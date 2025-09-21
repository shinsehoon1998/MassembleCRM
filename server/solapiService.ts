/**
 * Solapi SMS Service - 솔라피 SMS 발송 서비스
 * 솔라피 API v4 REST API를 사용한 SMS 발송 모듈
 */

import {
  maskPhoneNumber,
  maskName,
  maskApiData,
  generateRequestId,
  secureLog,
  LogLevel
} from './securityUtils';

// 솔라피 API v4 응답 인터페이스 (공식 문서 기준)
export interface SolapiApiResponse {
  groupId?: string;
  messageCount?: number;
  successCount?: number;
  failCount?: number;
  resultList?: any[];
  failedMessageList?: any[];
  groupInfo?: {
    groupId: string;
    messageCount: number;
    successCount: number;
    failCount: number;
    resultList: Array<{
      messageId: string;
      statusMessage: string;
      statusCode: string;
      to: string;
      from: string;
      type: string;
      country: string;
      messageCount: number;
    }>;
  };
  // 잔액 조회용
  balance?: number;
  // 메시지 조회용
  messageId?: string;
  id?: string;
  // 에러 관련
  errorCode?: string;
  errorMessage?: string;
  message?: string;
}

// SMS 메시지 개별 인터페이스
export interface SmsMessage {
  to: string;          // 수신번호
  from: string;        // 발신번호  
  text: string;        // 메시지 내용
  type?: string;       // SMS, LMS, MMS (기본: SMS)
  country?: string;    // 국가코드 (기본: 82)
  subject?: string;    // LMS/MMS 제목
}

// Solapi v4 API 요청 구조
export interface SolapiSendRequest {
  messages: SmsMessage[];
  scheduledDate?: string;
  strict?: boolean;
  allowDuplicates?: boolean;
  showMessageList?: boolean;
}

// SMS 템플릿 데이터 인터페이스
export interface SmsTemplateData {
  customerName: string;
  customerPhone: string;
  status: string;
  assignedTime: string;
}

// 발송 결과 인터페이스
export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  groupId?: string;
  message: string;
  errorCode?: string;
}

export class SolapiSmsService {
  private readonly baseUrl = 'https://api.solapi.com';
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly senderPhone: string;

  constructor() {
    // 환경변수에서 API 키 읽기
    this.apiKey = process.env.SOLAPI_API_KEY || '';
    this.secretKey = process.env.SOLAPI_SECRET_KEY || '';
    this.senderPhone = process.env.SOLAPI_SENDER_PHONE || '';

    // 필수 환경변수 검증
    if (!this.apiKey || !this.secretKey || !this.senderPhone) {
      throw new Error('SOLAPI 환경변수가 설정되지 않았습니다: SOLAPI_API_KEY, SOLAPI_SECRET_KEY, SOLAPI_SENDER_PHONE');
    }
  }

  /**
   * 한국 전화번호 형식 검증 및 정규화 (개선된 버전)
   * 서울 지역번호(02) 9자리 전화번호 지원 포함
   */
  private normalizePhoneNumber(phone: string): { isValid: boolean; normalized: string; error?: string } {
    if (!phone || typeof phone !== 'string') {
      return { isValid: false, normalized: '', error: '전화번호가 제공되지 않았습니다.' };
    }

    // 숫자만 추출
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    // 국가코드 제거 (82로 시작하는 경우)
    let normalizedPhone = cleanPhone;
    if (cleanPhone.startsWith('82')) {
      normalizedPhone = '0' + cleanPhone.substring(2);
    }

    // 휴대폰 번호 패턴 (010, 011, 016, 017, 018, 019)
    const koreanMobileRegex = /^(010|011|016|017|018|019)\d{7,8}$/;
    
    // 서울 지역번호 (02) - 9자리 또는 10자리 지원
    const seoulLandlineRegex = /^02\d{7,8}$/;
    
    // 기타 지역번호 (031-064) - 10자리 또는 11자리
    const otherLandlineRegex = /^0[3-9][0-9]\d{7,8}$/;

    // 길이 검증 (더 유연하게 - 서울 02 번호 9자리 허용)
    if (normalizedPhone.length < 9 || normalizedPhone.length > 11) {
      return { 
        isValid: false, 
        normalized: '', 
        error: `잘못된 전화번호 길이: ${normalizedPhone.length}자리 (9-11자리 필요)` 
      };
    }

    // 각 패턴별 검증
    if (koreanMobileRegex.test(normalizedPhone)) {
      return { isValid: true, normalized: normalizedPhone };
    }
    
    if (seoulLandlineRegex.test(normalizedPhone)) {
      return { isValid: true, normalized: normalizedPhone };
    }
    
    if (otherLandlineRegex.test(normalizedPhone)) {
      return { isValid: true, normalized: normalizedPhone };
    }

    return { 
      isValid: false, 
      normalized: '', 
      error: '한국 전화번호 형식이 아닙니다. (휴대폰: 010/011/016-019, 서울: 02, 기타지역: 031-064로 시작)' 
    };
  }

  /**
   * HMAC-SHA256 기반 인증 헤더 생성
   */
  private async generateAuthHeaders(): Promise<{ [key: string]: string }> {
    const timestamp = Date.now().toString();
    const salt = this.generateRandomString(32);
    
    // Node.js crypto 모듈 사용
    const crypto = await import('crypto');
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(timestamp + salt)
      .digest('hex');

    return {
      'Authorization': `HMAC-SHA256 ApiKey=${this.apiKey}, Date=${timestamp}, salt=${salt}, signature=${signature}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 랜덤 문자열 생성
   */
  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 지수 백오프를 사용한 재시도 헬퍼 함수
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * API 호출 공통 함수 (재시도 로직 포함)
   */
  private async makeApiCall<T = SolapiApiResponse>(
    endpoint: string,
    data: any,
    method: 'POST' | 'GET' = 'POST',
    requestId?: string,
    maxRetries = 3
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const currentRequestId = requestId || generateRequestId();
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const authHeaders = await this.generateAuthHeaders();
        
        const requestOptions: RequestInit = {
          method,
          headers: {
            ...authHeaders,
            'X-Request-ID': currentRequestId,
          }
        };

        if (method === 'POST' && data) {
          requestOptions.body = JSON.stringify(data);
        }

        // 로그에서 민감정보 마스킹
        const maskedData = maskApiData(data);
        
        if (attempt > 0) {
          secureLog(LogLevel.INFO, 'SOLAPI_SMS', `${method} ${endpoint} (재시도 ${attempt}/${maxRetries})`, {
            endpoint,
            data: maskedData,
            authPresent: !!this.apiKey,
            attempt
          }, currentRequestId);
        } else {
          secureLog(LogLevel.INFO, 'SOLAPI_SMS', `${method} ${endpoint}`, {
            endpoint,
            data: maskedData,
            authPresent: !!this.apiKey
          }, currentRequestId);
        }

        const response = await fetch(url, requestOptions);
        
        secureLog(LogLevel.INFO, 'SOLAPI_SMS', 'Response received', {
          status: response.status,
          contentType: response.headers.get('content-type'),
          attempt
        }, currentRequestId);
        
        let result: any;
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          result = await response.json();
        } else {
          const textResult = await response.text();
          result = {
            statusCode: response.status.toString(),
            statusMessage: textResult || response.statusText,
            data: textResult
          };
        }

        // API 호출 결과 로깅 (v4 구조에 맞게 수정)
        secureLog(LogLevel.INFO, 'SOLAPI_SMS', 'API response parsed', {
          httpStatus: response.status,
          hasGroupId: !!result.groupId,
          hasMessageId: !!result.messageId,
          successCount: result.successCount,
          failCount: result.failCount,
          hasBalance: result.balance !== undefined,
          hasError: !!result.errorCode,
          attempt
        }, currentRequestId);

        // 재시도 가능한 HTTP 상태 코드 확인
        const isRetryableStatus = response.status === 429 || // Rate limit
                                 response.status === 500 || // Internal server error
                                 response.status === 502 || // Bad gateway
                                 response.status === 503 || // Service unavailable
                                 response.status === 504;   // Gateway timeout

        if (!response.ok) {
          const error = new Error(`Solapi API 호출 실패 (HTTP ${response.status}): ${result.statusMessage || response.statusText}`);
          
          // 재시도 가능한 상태이고 아직 재시도 횟수가 남아있으면 재시도
          if (isRetryableStatus && attempt < maxRetries) {
            lastError = error;
            
            // 지수 백오프 계산 (base: 1초, 최대: 16초)
            const delayMs = Math.min(1000 * Math.pow(2, attempt), 16000);
            
            secureLog(LogLevel.WARNING, 'SOLAPI_SMS', '재시도 가능한 오류 발생', {
              httpStatus: response.status,
              error: result.statusMessage || response.statusText,
              attempt: attempt + 1,
              maxRetries,
              delayMs
            }, currentRequestId);
            
            await this.delay(delayMs);
            continue; // 다음 재시도로
          }
          
          throw error;
        }

        // 성공적인 응답
        if (attempt > 0) {
          secureLog(LogLevel.INFO, 'SOLAPI_SMS', '재시도 후 성공', {
            attempt: attempt + 1,
            httpStatus: response.status
          }, currentRequestId);
        }

        return result as T;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // 네트워크 오류나 기타 예외의 경우도 재시도 (fetch 실패 등)
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 16000);
          
          secureLog(LogLevel.WARNING, 'SOLAPI_SMS', '네트워크 오류로 재시도', {
            error: lastError.message,
            attempt: attempt + 1,
            maxRetries,
            delayMs
          }, currentRequestId);
          
          await this.delay(delayMs);
          continue; // 다음 재시도로
        }
        
        // 최대 재시도 횟수 초과
        break;
      }
    }
    
    // 모든 재시도 실패
    const errorMessage = lastError?.message || 'Unknown error';
    
    secureLog(LogLevel.ERROR, 'SOLAPI_SMS', `${endpoint} 호출 최종 실패 (${maxRetries + 1}번 시도)`, {
      error: errorMessage,
      url,
      endpoint,
      totalAttempts: maxRetries + 1
    }, currentRequestId);
    
    throw lastError || new Error('Unknown error occurred during API call');
  }

  /**
   * SMS 템플릿 처리
   */
  private processTemplate(templateData: SmsTemplateData): string {
    const template = `[마셈블] 고객 배정 알림
고객: {{customerName}}
연락처: {{customerPhone}}
상태: {{status}}
배정시간: {{assignedTime}}
시스템 확인 바랍니다.
https://massemble-crm-shinsehoona.replit.app`;

    return template
      .replace('{{customerName}}', templateData.customerName)
      .replace('{{customerPhone}}', templateData.customerPhone)
      .replace('{{status}}', templateData.status)
      .replace('{{assignedTime}}', templateData.assignedTime);
  }

  /**
   * 단일 SMS 발송
   */
  async sendSms(
    recipientPhone: string,
    message: string,
    options?: { 
      type?: 'SMS' | 'LMS' | 'MMS'; 
      subject?: string;
      customSender?: string;
    }
  ): Promise<SmsSendResult> {
    const requestId = generateRequestId();
    
    try {
      // 수신번호 검증 및 정규화
      const phoneValidation = this.normalizePhoneNumber(recipientPhone);
      if (!phoneValidation.isValid) {
        secureLog(LogLevel.WARNING, 'SOLAPI_SMS', '잘못된 전화번호 형식', {
          originalPhone: maskPhoneNumber(recipientPhone),
          error: phoneValidation.error
        }, requestId);
        
        return {
          success: false,
          message: `❌ ${phoneValidation.error}`,
        };
      }

      // 발신번호 검증
      const senderPhone = options?.customSender || this.senderPhone;
      const senderValidation = this.normalizePhoneNumber(senderPhone);
      if (!senderValidation.isValid) {
        secureLog(LogLevel.ERROR, 'SOLAPI_SMS', '잘못된 발신번호', {
          senderPhone: maskPhoneNumber(senderPhone),
          error: senderValidation.error
        }, requestId);
        
        return {
          success: false,
          message: `❌ 발신번호 오류: ${senderValidation.error}`,
        };
      }

      // 메시지 길이에 따른 타입 자동 결정
      const messageType = options?.type || (message.length > 90 ? 'LMS' : 'SMS');
      
      // Solapi v4 API 구조에 맞는 요청 데이터 구성 ({messages: [...]} 형태)
      const messageData: SmsMessage = {
        to: phoneValidation.normalized,
        from: senderValidation.normalized,
        text: message,
        type: messageType,
        country: '82'
      };

      // LMS인 경우 제목 추가
      if (messageType === 'LMS' && options?.subject) {
        messageData.subject = options.subject;
      }

      const apiRequest: SolapiSendRequest = {
        messages: [messageData]
      };

      secureLog(LogLevel.INFO, 'SOLAPI_SMS', 'SMS 발송 시도', {
        recipientPhone: maskPhoneNumber(phoneValidation.normalized),
        senderPhone: maskPhoneNumber(senderValidation.normalized),
        messageType,
        messageLength: message.length,
        hasSubject: !!messageData.subject
      }, requestId);

      // Solapi API v4 호출 (단일 메시지도 /send-many/detail 엔드포인트 사용)
      const response = await this.makeApiCall('/messages/v4/send-many/detail', apiRequest, 'POST', requestId);

      // HTTP 2xx와 groupId/messageId 기반 성공 판단 (v4 API 구조)
      const hasSuccessfulMessages = (response.successCount || 0) > 0;
      const hasGroupId = !!response.groupInfo?.groupId;
      const messageResult = response.groupInfo?.resultList?.[0];
      const messageId = messageResult?.messageId;
      
      if (hasSuccessfulMessages && hasGroupId && messageId) {
        secureLog(LogLevel.INFO, 'SOLAPI_SMS', 'SMS 발송 성공', {
          recipientPhone: maskPhoneNumber(phoneValidation.normalized),
          messageId: messageId,
          groupId: response.groupInfo?.groupId,
          successCount: response.successCount || 0,
          failCount: response.failCount || 0
        }, requestId);
        
        return {
          success: true,
          messageId: messageId,
          groupId: response.groupInfo.groupId,
          message: '✅ SMS 발송이 완료되었습니다.'
        };
      } else {
        // 실패한 메시지 정보 추출
        const failedMessage = response.failedMessageList?.[0];
        const errorMessage = failedMessage?.errorMessage || messageResult?.statusMessage || 'SMS 발송 실패';
        
        secureLog(LogLevel.WARNING, 'SOLAPI_SMS', 'SMS 발송 실패', {
          recipientPhone: maskPhoneNumber(phoneValidation.normalized),
          successCount: response.successCount,
          failCount: response.failCount,
          errorCode: failedMessage?.errorCode,
          error: errorMessage
        }, requestId);
        
        return {
          success: false,
          message: `❌ SMS 발송 실패: ${errorMessage}`,
          errorCode: failedMessage?.errorCode
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      secureLog(LogLevel.ERROR, 'SOLAPI_SMS', 'SMS 발송 예외', {
        recipientPhone: maskPhoneNumber(recipientPhone),
        error: errorMessage
      }, requestId);
      
      // 네트워크 에러와 API 에러 구분
      if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
        return {
          success: false,
          message: '🌐 네트워크 연결 오류: Solapi API 서버에 접속할 수 없습니다.',
        };
      } else if (errorMessage.includes('HTTP')) {
        return {
          success: false,
          message: `🚫 API 호출 실패: ${errorMessage}`,
        };
      } else {
        return {
          success: false,
          message: errorMessage.startsWith('❌') ? errorMessage : `❌ ${errorMessage}`,
        };
      }
    }
  }

  /**
   * 템플릿을 사용한 고객 배정 알림 SMS 발송
   */
  async sendCustomerAssignmentNotification(
    recipientPhone: string,
    templateData: SmsTemplateData
  ): Promise<SmsSendResult> {
    const requestId = generateRequestId();
    
    try {
      // 템플릿 처리
      const message = this.processTemplate(templateData);
      
      secureLog(LogLevel.INFO, 'SOLAPI_SMS', '고객 배정 알림 SMS 발송', {
        recipientPhone: maskPhoneNumber(recipientPhone),
        customerName: maskName(templateData.customerName),
        status: templateData.status,
        assignedTime: templateData.assignedTime,
        messageLength: message.length
      }, requestId);

      // SMS 발송 (LMS 타입으로 발송하여 긴 메시지 지원)
      return await this.sendSms(recipientPhone, message, {
        type: 'LMS',
        subject: '[마셈블] 고객 배정 알림'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      secureLog(LogLevel.ERROR, 'SOLAPI_SMS', '고객 배정 알림 SMS 발송 예외', {
        recipientPhone: maskPhoneNumber(recipientPhone),
        customerName: maskName(templateData.customerName),
        error: errorMessage
      }, requestId);
      
      return {
        success: false,
        message: `❌ 고객 배정 알림 발송 실패: ${errorMessage}`,
      };
    }
  }

  /**
   * 계정 잔액 조회
   */
  async getBalance(): Promise<{ success: boolean; balance?: number; message: string }> {
    const requestId = generateRequestId();
    
    try {
      secureLog(LogLevel.INFO, 'SOLAPI_SMS', '계정 잔액 조회', {}, requestId);
      
      const response = await this.makeApiCall('/cash/v1/balance', {}, 'GET', requestId);
      
      // HTTP 2xx 상태코드와 잔액 데이터 존재 여부로 성공 판단
      if (response.balance !== undefined && response.balance !== null) {
        const balance = response.balance || 0;
        
        secureLog(LogLevel.INFO, 'SOLAPI_SMS', '계정 잔액 조회 성공', {
          balance: balance
        }, requestId);
        
        return {
          success: true,
          balance: balance,
          message: `✅ 현재 잔액: ${balance.toLocaleString()}원`
        };
      } else {
        const errorMessage = response.errorMessage || response.message || '잔액 조회 실패';
        
        secureLog(LogLevel.WARNING, 'SOLAPI_SMS', '계정 잔액 조회 실패', {
          error: errorMessage
        }, requestId);
        
        return {
          success: false,
          message: `❌ 잔액 조회 실패: ${errorMessage}`
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      secureLog(LogLevel.ERROR, 'SOLAPI_SMS', '계정 잔액 조회 예외', {
        error: errorMessage
      }, requestId);
      
      return {
        success: false,
        message: `❌ 잔액 조회 중 오류 발생: ${errorMessage}`
      };
    }
  }

  /**
   * SMS 발송 이력 조회
   */
  async getSendHistory(messageId: string): Promise<{ success: boolean; data?: any; message: string }> {
    const requestId = generateRequestId();
    
    try {
      secureLog(LogLevel.INFO, 'SOLAPI_SMS', 'SMS 발송 이력 조회', {
        messageId: messageId
      }, requestId);
      
      // 올바른 v4 API 엔드포인트 사용
      const response = await this.makeApiCall(`/messages/v4/${messageId}`, {}, 'GET', requestId);
      
      // HTTP 2xx 상태코드와 메시지 데이터 존재 여부로 성공 판단
      if (response.messageId || response.id) {
        secureLog(LogLevel.INFO, 'SOLAPI_SMS', 'SMS 발송 이력 조회 성공', {
          messageId: messageId,
          hasData: !!(response.messageId || response.id)
        }, requestId);
        
        return {
          success: true,
          data: response,
          message: '✅ 발송 이력 조회 완료'
        };
      } else {
        const errorMessage = response.errorMessage || response.message || '발송 이력 조회 실패';
        
        secureLog(LogLevel.WARNING, 'SOLAPI_SMS', 'SMS 발송 이력 조회 실패', {
          messageId: messageId,
          error: errorMessage
        }, requestId);
        
        return {
          success: false,
          message: `❌ 발송 이력 조회 실패: ${errorMessage}`
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      secureLog(LogLevel.ERROR, 'SOLAPI_SMS', 'SMS 발송 이력 조회 예외', {
        messageId: messageId,
        error: errorMessage
      }, requestId);
      
      return {
        success: false,
        message: `❌ 발송 이력 조회 중 오류 발생: ${errorMessage}`
      };
    }
  }
}

// 서비스 인스턴스 생성 및 내보내기
export const solapiSmsService = new SolapiSmsService();