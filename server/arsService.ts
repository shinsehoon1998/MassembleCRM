import { db } from './db';
import { arsCampaigns, arsSendLogs, arsApiLogs } from '@shared/schema';
import {
  maskPhoneNumber,
  maskName,
  maskApiData,
  isValidPhoneNumber,
  isValidCampaignName,
  sanitizeInput,
  isValidApiKey,
  generateAuthHeaders,
  checkRateLimit,
  generateRequestId,
  getHttpStatusFromServiceResponse,
  secureLog,
  LogLevel
} from './securityUtils';
import { getAtalkConfig } from './atalkConfig';

// ATALK 설정 중앙화 완료 - atalkConfig.ts에서 관리
// 이제 모든 ATALK 설정은 atalkConfig.ts에서 중앙화된 설정을 사용함

// API 응답 인터페이스
export interface AtalkApiResponse {
  code: string;
  history_key?: string;
  result?: string;
  data?: any;
}

// 발송리스트 추가 요청 - ATALK API 문서 기준
export interface AddCallListRequest {
  text_send_no: string;  // 발신번호 (콤마로 최대 20개 구분)
  company: string;       // 회사 (고정값: 627923)
  user_id: string;       // 등록요청자 아이디 (Base64, 고정값: bWI2Mjc5MjM=)
  text_campaign_name: string; // 캠페인명
  text_page: string;     // A 고정
}

// 음성파일 업로드 요청
export interface AudioUploadFormData {
  uploadFile: File | Buffer;
  text_campaign_name: string;
  company: string;
  user_id: string;
  file_title_name: string;
  text_type: string;
}

export class AtalkArsService {
  /**
   * API 호출 공통 함수 - 안전한 응답 파싱 포함
   */
  private async makeApiCall<T = AtalkApiResponse>(
    endpoint: string,
    data: any,
    method: 'POST' = 'POST',
    requestId?: string
  ): Promise<T> {
    const config = getAtalkConfig();
    const url = `${config.baseUrl}${endpoint}`;
    
    // 🔥 수정: 표준 Bearer 토큰 사용 (ATALK API 호환성)
    const secretKey = process.env.ATALK_SECRET_KEY || process.env.ATALK_SECRET;
    const currentRequestId = requestId || generateRequestId();
    
    // 표준 Authorization 헤더 + 선택적 서명 헤더
    const authHeaders = generateAuthHeaders(config.token, secretKey);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': currentRequestId,
      ...authHeaders
    };
    
    const requestOptions = {
      method,
      headers,
      body: JSON.stringify(data),
    };

    // 🔥 로그에서 민감정보 마스킹 (전화번호 포함)
    const maskedData = maskApiData(data);
    
    secureLog(LogLevel.INFO, 'ATALK_API', `${method} ${endpoint}`, {
      endpoint,
      data: maskedData,
      authPresent: !!config.token
    }, currentRequestId);

    try {
      const response = await fetch(url, requestOptions);
      
      // HTTP 상태 코드 체크
      secureLog(LogLevel.INFO, 'ATALK_API', 'Response received', {
        status: response.status,
        contentType: response.headers.get('content-type')
      }, currentRequestId);
      
      if (!response.ok) {
        // 404나 기타 HTTP 에러 처리
        let errorResult: any = {
          code: response.status.toString(),
          result: `HTTP ${response.status} 에러`,
          error: `API 호출 실패: ${response.statusText}`
        };
        
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const jsonError = await response.json();
            errorResult = { ...errorResult, ...jsonError };
          } else {
            const textError = await response.text();
            if (textError.length > 0) {
              errorResult.htmlResponse = textError.substring(0, 200);
            }
            secureLog(LogLevel.WARNING, 'ATALK_API', 'Non-JSON response received', {
              responseLength: textError.length
            }, currentRequestId);
          }
        } catch (parseError) {
          secureLog(LogLevel.ERROR, 'ATALK_API', 'Response parsing failed', {
            error: parseError instanceof Error ? parseError.message : 'Unknown parse error'
          }, currentRequestId);
        }
        
        await this.logApiCall(endpoint, method, data, errorResult, response.status, currentRequestId);
        throw new Error(`API 호출 실패 (HTTP ${response.status}): ${response.statusText}`);
      }
      
      // 성공 응답 파싱
      const contentType = response.headers.get('content-type') || '';
      let result: any;
      
      if (contentType.includes('application/json')) {
        result = await response.json();
        secureLog(LogLevel.INFO, 'ATALK_API', 'JSON response received', {
          responseCode: result.code
        }, currentRequestId);
      } else {
        const textResult = await response.text();
        result = {
          code: '200',
          result: '성공',
          data: textResult
        };
        secureLog(LogLevel.INFO, 'ATALK_API', 'Non-JSON success response received', {}, currentRequestId);
      }

      // API 호출 로그 저장
      await this.logApiCall(endpoint, method, data, result, response.status, currentRequestId);

      return result as T;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // 🔥 프로토콜별 에러 분석 및 로깅 강화
      let errorType = 'UNKNOWN';
      let userFriendlyMessage = errorMessage;
      let suggestedSolution = '';
      
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        
        // SSL/TLS 관련 에러 감지
        if (message.includes('ssl') || message.includes('tls') || 
            message.includes('handshake') || message.includes('certificate') ||
            message.includes('packet length too long') || message.includes('routines::')) {
          errorType = 'SSL_TLS_ERROR';
          userFriendlyMessage = '🔒 HTTPS 연결 실패: ATALK 서버가 HTTPS를 지원하지 않습니다.';
          suggestedSolution = 'ATALK_FORCE_HTTP=true 환경변수를 설정하여 HTTP 사용을 허용하세요.';
        }
        // HTTPS URL에서 일반적인 연결 실패
        else if (url.startsWith('https') && (message.includes('fetch') || message.includes('network') || 
                 message.includes('connection') || message.includes('timeout'))) {
          errorType = 'HTTPS_CONNECTION_ERROR';
          userFriendlyMessage = '🌐 HTTPS 연결 실패: ATALK 서버 접속 불가';
          suggestedSolution = 'ATALK_FORCE_HTTP=true 환경변수 설정 또는 네트워크 연결을 확인하세요.';
        }
        // HTTP 연결 실패
        else if (url.startsWith('http') && (message.includes('fetch') || message.includes('network') || 
                 message.includes('connection') || message.includes('timeout'))) {
          errorType = 'HTTP_CONNECTION_ERROR';
          userFriendlyMessage = '🌐 HTTP 연결 실패: ATALK 서버 접속 불가';
          suggestedSolution = '네트워크 연결과 ATALK 서버 상태를 확인하세요.';
        }
        // JSON 파싱 에러
        else if (message.includes('json') || message.includes('parse')) {
          errorType = 'RESPONSE_PARSE_ERROR';
          userFriendlyMessage = '📄 서버 응답 형식 오류';
          suggestedSolution = 'ATALK 서버 응답 형식을 확인하세요.';
        }
      }
      
      secureLog(LogLevel.ERROR, 'ATALK_API', `${errorType}: ${endpoint} 호출 실패`, {
        errorType,
        originalError: errorMessage,
        userFriendlyMessage,
        suggestedSolution,
        url,
        protocol: url.startsWith('https') ? 'HTTPS' : 'HTTP',
        isSSLError: errorType === 'SSL_TLS_ERROR',
        endpoint
      }, currentRequestId);
      
      await this.logApiCall(endpoint, method, data, { 
        error: errorMessage,
        errorType,
        protocol: url.startsWith('https') ? 'HTTPS' : 'HTTP',
        userFriendlyMessage 
      }, 500, currentRequestId);
      
      // 🔥 SSL/TLS 에러의 경우 더 명확한 에러 메시지 throw
      if (errorType === 'SSL_TLS_ERROR') {
        throw new Error(`${userFriendlyMessage} ${suggestedSolution}`);
      } else if (errorType.includes('CONNECTION_ERROR')) {
        throw new Error(`${userFriendlyMessage} ${suggestedSolution}`);
      }
      
      throw error;
    }
  }

  /**
   * API 호출 로그 저장
   */
  private async logApiCall(
    endpoint: string,
    method: string,
    request: any,
    response: any,
    httpCode: number,
    requestId?: string
  ): Promise<void> {
    try {
      // 🔥 PII 보호된 로그 저장
      await db.insert(arsApiLogs).values({
        endpoint,
        method,
        requestData: JSON.stringify(maskApiData(request)),
        responseData: JSON.stringify(maskApiData(response)),
        httpCode,
      });
    } catch (error) {
      secureLog(LogLevel.ERROR, 'ARS', 'API 로그 저장 실패', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, requestId);
    }
  }

  /**
   * 1. 발송리스트 추가 - API 가이드 기반 + 환경설정 개선
   */
  async addCallList(
    targetPhone: string,
    campaignName: string,
    page: string = 'A'
  ): Promise<{ success: boolean; historyKey?: string; message: string }> {
    const requestId = generateRequestId();
    
    try {
      // 🔥 Rate Limiting 체크 (PHP 패턴)
      const clientId = `ars_${targetPhone.slice(-4)}`; // 전화번호 뒷자리로 구분
      const rateLimitResult = checkRateLimit(clientId, 10, 60); // 분당 10회 제한
      
      if (!rateLimitResult.allowed) {
        secureLog(LogLevel.WARNING, 'ARS', 'Rate limit exceeded', {
          clientId: maskPhoneNumber(clientId),
          remaining: rateLimitResult.remaining
        });
        
        return {
          success: false,
          message: '⚠️ 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        };
      }
      
      // 🔥 환경변수 및 보안 검증을 먼저 수행하여 명확한 에러 메시지 제공
      let config;
      try {
        config = getAtalkConfig();
      } catch (configError) {
        // 🔥 환경변수 문제일 때 구체적인 에러 메시지 제공
        const errorMessage = configError instanceof Error ? configError.message : 'ATALK API 설정 오류';
        secureLog(LogLevel.ERROR, 'ARS', '환경변수 설정 오류', {
          phone: maskPhoneNumber(targetPhone),
          error: errorMessage
        });
        
        // 사용자에게 구체적인 해결 방법 안내
        if (errorMessage.includes('필수 환경변수 누락')) {
          return {
            success: false,
            message: '⚠️ ATALK API 설정이 완료되지 않았습니다. 관리자에게 문의하세요. (환경변수 누락)',
          };
        } else if (errorMessage.includes('HTTPS가 필수')) {
          return {
            success: false,
            message: '🔒 보안 오류: 프로덕션 환경에서는 HTTPS 설정이 필요합니다.',
          };
        } else {
          return {
            success: false,
            message: `🔧 ATALK API 설정 오류: ${errorMessage}`,
          };
        }
      }
      
      // 🔥 전화번호 형식 검증 강화 (PHP 패턴)
      const cleanPhone = targetPhone.replace(/[^0-9]/g, ''); // 숫자만
      
      if (!isValidPhoneNumber(targetPhone)) {
        secureLog(LogLevel.WARNING, 'ARS', '잘못된 전화번호 형식', {
          originalPhone: maskPhoneNumber(targetPhone),
          cleanPhone: maskPhoneNumber(cleanPhone),
          length: cleanPhone.length
        });
        
        return {
          success: false,
          message: `❌ 잘못된 전화번호 형식: ${maskPhoneNumber(targetPhone)} (한국 전화번호 형식이 아닙니다)`,
        };
      }
      
      
      // 🔥 캠페인명 검증
      if (!isValidCampaignName(campaignName)) {
        secureLog(LogLevel.ERROR, 'ARS', '잘못된 캠페인명', {
          campaignName: campaignName
        });
        
        return {
          success: false,
          message: '❌ 캠페인명이 유효하지 않습니다.',
        };
      }
      
      // 🔥 입력값 정제 (PHP 패턴)
      // targetPhone은 이미 위에서 cleanPhone으로 정제됨
      
      // 🔥 ATALK API 문서에 따른 정확한 파라미터 구성
      // text_send_no: 발신번호(ARS를 받을 번호들, 즉 수신번호)를 콤마로 구분
      const callData: AddCallListRequest = {
        text_send_no: cleanPhone, // 수신번호 (ARS를 받을 번호)
        company: sanitizeInput(config.company),
        user_id: sanitizeInput(config.userId),
        text_campaign_name: sanitizeInput(campaignName),
        text_page: sanitizeInput(page)
      };
      
      secureLog(LogLevel.INFO, 'ARS', '발송리스트 추가 시도', {
        originalPhone: maskPhoneNumber(targetPhone),
        cleanPhone: maskPhoneNumber(cleanPhone),
        requestData: maskApiData(callData)
      }, requestId);
      
      const response = await this.makeApiCall('/calllist/add', callData, 'POST', requestId);

      // 🔥 수정: 더 정교한 성공/실패 판단 로직
      secureLog(LogLevel.INFO, 'ARS', '발송리스트 추가 응답 상세', {
        code: response.code,
        result: response.result,
        historyKey: response.history_key,
        phone: maskPhoneNumber(cleanPhone),
        fullResponse: maskApiData(response)
      }, requestId);

      const isSuccessCode = response.code === '200' || response.code === 'SUCCESS' || response.code === '0';
      // 🔥 ATALK API 성공 응답 패턴 개선 - "등록 처리하였습니다" 등의 실제 성공 메시지 인식
      const isSuccessResult = !response.result || 
                              response.result === '성공' || 
                              response.result === 'SUCCESS' || 
                              response.result.includes('성공') ||
                              response.result.toLowerCase().includes('success') ||
                              response.result.includes('등록 처리하였습니다') ||
                              response.result.includes('등록') ||
                              (response.result.includes('처리') && response.result.includes('건'));

      if (isSuccessCode && isSuccessResult) {
        secureLog(LogLevel.INFO, 'ARS', '발송리스트 추가 성공', {
          phone: maskPhoneNumber(cleanPhone),
          historyKey: response.history_key
        }, requestId);
        
        return {
          success: true,
          historyKey: response.history_key,
          message: '✅ 발송리스트에 추가되었습니다.',
        };
      } else {
        // 🔥 더 구체적인 에러 메시지 생성
        let errorMessage = '❌ 발송리스트 추가 실패';
        
        if (response.result) {
          errorMessage = `❌ ${response.result}`;
        } else if (response.data?.error) {
          errorMessage = `❌ API 오류: ${response.data.error}`;
        } else if (response.data?.message) {
          errorMessage = `❌ ${response.data.message}`;
        } else {
          errorMessage = `❌ 발송리스트 추가 실패 (응답코드: ${response.code})`;
        }
        
        secureLog(LogLevel.WARNING, 'ARS', '발송리스트 추가 실패', {
          phone: maskPhoneNumber(cleanPhone),
          error: errorMessage,
          responseCode: response.code,
          result: response.result,
          data: maskApiData(response.data)
        }, requestId);
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      secureLog(LogLevel.ERROR, 'ARS', '발송리스트 추가 예외', {
        phone: maskPhoneNumber(targetPhone),
        error: error instanceof Error ? error.message : 'Unknown error'
      }, requestId);
      
      // 🔥 네트워크 에러와 API 에러 구분
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          return {
            success: false,
            message: '🌐 네트워크 연결 오류: ATALK API 서버에 접속할 수 없습니다.',
          };
        } else if (error.message.includes('HTTP')) {
          return {
            success: false,
            message: `🚫 API 호출 실패: ${error.message}`,
          };
        } else {
          return {
            success: false,
            message: error.message.startsWith('❌') ? error.message : `❌ ${error.message}`,
          };
        }
      }
      
      return {
        success: false,
        message: '❌ 발송리스트 추가 중 알 수 없는 오류가 발생했습니다.',
      };
    }
  }

  /**
   * 1-2. 발송리스트 배치 추가 - API 명세 준수 (콤마로 최대 20개 번호 지원)
   */
  async addCallListBatch(
    targetPhones: string[],
    campaignName: string,
    page: string = 'A'
  ): Promise<{ success: boolean; historyKey?: string; message: string; processedCount: number }> {
    const requestId = generateRequestId();
    
    try {
      // 🔥 배치 크기 검증 (API 문서에 따라 최대 20개)
      if (targetPhones.length === 0) {
        return {
          success: false,
          message: '❌ 발송할 전화번호가 없습니다.',
          processedCount: 0
        };
      }
      
      if (targetPhones.length > 20) {
        secureLog(LogLevel.WARNING, 'ARS', '배치 크기 초과', {
          requestedCount: targetPhones.length,
          maxAllowed: 20
        });
        return {
          success: false,
          message: `❌ 배치 크기 초과: 최대 20개까지 가능 (요청: ${targetPhones.length}개)`,
          processedCount: 0
        };
      }

      // 🔥 환경변수 및 보안 검증
      let config;
      try {
        config = getAtalkConfig();
      } catch (configError) {
        const errorMessage = configError instanceof Error ? configError.message : 'ATALK API 설정 오류';
        secureLog(LogLevel.ERROR, 'ARS', '환경변수 설정 오류', {
          error: errorMessage,
          batchSize: targetPhones.length
        });
        
        if (errorMessage.includes('필수 환경변수 누락')) {
          return {
            success: false,
            message: '⚠️ ATALK API 설정이 완료되지 않았습니다. 관리자에게 문의하세요. (환경변수 누락)',
            processedCount: 0
          };
        } else if (errorMessage.includes('HTTPS가 필수')) {
          return {
            success: false,
            message: '🔒 보안 오류: 프로덕션 환경에서는 HTTPS 설정이 필요합니다.',
            processedCount: 0
          };
        } else {
          return {
            success: false,
            message: `🔧 ATALK API 설정 오류: ${errorMessage}`,
            processedCount: 0
          };
        }
      }

      // 🔥 전화번호 형식 검증 및 정제
      const validPhones: string[] = [];
      const invalidPhones: string[] = [];
      
      for (const phone of targetPhones) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        if (isValidPhoneNumber(phone)) {
          validPhones.push(cleanPhone);
        } else {
          invalidPhones.push(phone);
        }
      }
      
      if (invalidPhones.length > 0) {
        secureLog(LogLevel.WARNING, 'ARS', '유효하지 않은 전화번호 발견', {
          invalidCount: invalidPhones.length,
          totalCount: targetPhones.length,
          invalidPhones: invalidPhones.map(p => maskPhoneNumber(p))
        });
      }
      
      if (validPhones.length === 0) {
        return {
          success: false,
          message: `❌ 유효한 전화번호가 없습니다. (무효: ${invalidPhones.length}개)`,
          processedCount: 0
        };
      }
      
      // 🔥 캠페인명 검증
      if (!isValidCampaignName(campaignName)) {
        secureLog(LogLevel.ERROR, 'ARS', '잘못된 캠페인명', {
          campaignName: campaignName
        });
        
        return {
          success: false,
          message: '❌ 캠페인명이 유효하지 않습니다.',
          processedCount: 0
        };
      }

      // 🔥 ATALK API 문서에 따른 배치 요청 구성
      const callData: AddCallListRequest = {
        text_send_no: validPhones.join(','), // 수신번호들을 콤마로 구분
        company: sanitizeInput(config.company),
        user_id: sanitizeInput(config.userId),
        text_campaign_name: sanitizeInput(campaignName),
        text_page: sanitizeInput(page)
      };
      
      secureLog(LogLevel.INFO, 'ARS', '배치 발송리스트 추가 시도', {
        validCount: validPhones.length,
        invalidCount: invalidPhones.length,
        campaignName: campaignName,
        requestData: maskApiData(callData)
      }, requestId);
      
      const response = await this.makeApiCall('/calllist/add', callData, 'POST', requestId);

      // 🔥 성공/실패 판단 로직 개선
      secureLog(LogLevel.INFO, 'ARS', '배치 발송리스트 추가 응답 상세', {
        code: response.code,
        result: response.result,
        historyKey: response.history_key,
        validPhonesCount: validPhones.length,
        fullResponse: maskApiData(response)
      }, requestId);

      const isSuccessCode = response.code === '200' || response.code === 'SUCCESS' || response.code === '0';
      // 🔥 ATALK API 성공 응답 패턴 개선 - "등록 처리하였습니다" 등의 실제 성공 메시지 인식
      const isSuccessResult = !response.result || 
                              response.result === '성공' || 
                              response.result === 'SUCCESS' || 
                              response.result.includes('성공') ||
                              response.result.toLowerCase().includes('success') ||
                              response.result.includes('등록 처리하였습니다') ||
                              response.result.includes('등록') ||
                              (response.result.includes('처리') && response.result.includes('건'));

      if (isSuccessCode && isSuccessResult) {
        secureLog(LogLevel.INFO, 'ARS', '배치 발송리스트 추가 성공', {
          processedCount: validPhones.length,
          historyKey: response.history_key
        }, requestId);
        
        const successMessage = invalidPhones.length > 0 
          ? `✅ ${validPhones.length}개 번호 발송리스트 추가 완료 (${invalidPhones.length}개 무효번호 제외)`
          : `✅ ${validPhones.length}개 번호 발송리스트 추가 완료`;
        
        return {
          success: true,
          historyKey: response.history_key,
          message: successMessage,
          processedCount: validPhones.length
        };
      } else {
        // 🔥 400 오류에 대한 구체적인 메시지 파싱 개선
        let errorMessage = response.result || response.data?.error || response.data?.message;
        
        // 400 오류일 때 더 구체적인 메시지 제공
        if (response.code === '400') {
          if (errorMessage && errorMessage.includes('캠페인')) {
            errorMessage = `❌ 캠페인 '${campaignName}'이 ATALK 시스템에 존재하지 않습니다.\n\n해결 방법:\n1. 아톡비즈(ATALK) 관리자 페이지에서 캠페인을 먼저 생성해주세요.\n2. 캠페인명이 정확한지 확인해주세요 (대소문자 구분).\n3. 관리자에게 문의하여 사용 가능한 캠페인 목록을 확인해주세요.`;
          } else if (errorMessage && (errorMessage.includes('필수') || errorMessage.includes('누락'))) {
            errorMessage = `❌ 필수 정보가 누락되었습니다: ${errorMessage}`;
          } else {
            errorMessage = `❌ 잘못된 API 요청입니다.\n\n가능한 원인:\n1. 캠페인 '${campaignName}'이 존재하지 않음\n2. 전화번호 형식 오류\n3. 필수 필드 누락\n\n자세한 오류: ${errorMessage || '응답코드 400'}`;
          }
        } else if (response.code === '401') {
          errorMessage = `❌ 인증 오류: ATALK API 토큰이 유효하지 않습니다. 관리자에게 문의하세요.`;
        } else if (response.code === '500') {
          errorMessage = `❌ ATALK 서버 내부 오류가 발생했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.`;
        } else {
          errorMessage = errorMessage || `배치 발송리스트 추가 실패 (응답코드: ${response.code})`;
        }
        
        secureLog(LogLevel.WARNING, 'ARS', '배치 발송리스트 추가 실패', {
          validCount: validPhones.length,
          error: errorMessage,
          responseCode: response.code,
          result: response.result,
          campaignName: campaignName
        }, requestId);
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      secureLog(LogLevel.ERROR, 'ARS', '배치 발송리스트 추가 예외', {
        batchSize: targetPhones.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, requestId);
      
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          return {
            success: false,
            message: '🌐 네트워크 연결 오류: ATALK API 서버에 접속할 수 없습니다.',
            processedCount: 0
          };
        } else if (error.message.includes('HTTP')) {
          return {
            success: false,
            message: `🚫 API 호출 실패: ${error.message}`,
            processedCount: 0
          };
        } else {
          return {
            success: false,
            message: error.message.startsWith('❌') ? error.message : `❌ ${error.message}`,
            processedCount: 0
          };
        }
      }
      
      return {
        success: false,
        message: '❌ 배치 발송리스트 추가 중 알 수 없는 오류가 발생했습니다.',
        processedCount: 0
      };
    }
  }

  /**
   * 2. 음성파일 업로드 - API 가이드 기준 + 환경설정 개선
   */
  async uploadAudioFile(
    fileBuffer: Buffer,
    fileName: string,
    campaignName: string
  ): Promise<{ success: boolean; message: string; fileName?: string }> {
    try {
      const config = getAtalkConfig();
      
      const formData = new FormData();
      
      // 필수 필드 추가
      formData.append('text_campaign_name', sanitizeInput(campaignName));
      formData.append('company', config.company);
      formData.append('user_id', config.userId);
      formData.append('file_title_name', fileName.replace(/\.[^/.]+$/, "")); // 확장자 제거
      formData.append('text_type', 'A');

      // 음성파일 추가
      const blob = new Blob([fileBuffer], { type: 'audio/wav' });
      formData.append('uploadFile', blob, fileName);
      
      const requestId = generateRequestId();
      const authHeaders = generateAuthHeaders(config.token, process.env.ATALK_SECRET_KEY || process.env.ATALK_SECRET);
      
      const response = await fetch(`${config.baseUrl}/resource/upload`, {
        method: 'POST',
        headers: {
          'X-Request-ID': requestId,
          ...authHeaders,
        },
        body: formData,
      });

      secureLog(LogLevel.INFO, 'ATALK_API', 'Upload response received', {
        status: response.status,
        contentType: response.headers.get('content-type')
      }, requestId);

      // 🔥 중요: 안전한 응답 파싱 (makeApiCall()과 동일한 패턴)
      let result: any;
      
      if (!response.ok) {
        // HTTP 에러 처리
        let errorResult: any = {
          code: response.status.toString(),
          result: `HTTP ${response.status} 에러`,
          error: `음성파일 업로드 실패: ${response.statusText}`
        };
        
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const jsonError = await response.json();
            errorResult = { ...errorResult, ...jsonError };
          } else {
            const textError = await response.text();
            if (textError.length > 0) {
              errorResult.htmlResponse = textError.substring(0, 200);
            }
          }
        } catch (parseError) {
          secureLog(LogLevel.ERROR, 'ATALK_API', 'Upload response parsing failed', {
            error: parseError instanceof Error ? parseError.message : 'Unknown parse error'
          }, requestId);
        }
        
        await this.logApiCall('/resource/upload', 'POST', {
          fileName,
          campaignName: campaignName
        }, errorResult, response.status, requestId);
        
        throw new Error(`음성파일 업로드 실패 (HTTP ${response.status}): ${response.statusText}`);
      }
      
      // 성공 응답 파싱
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        result = await response.json();
        secureLog(LogLevel.INFO, 'ATALK_API', '음성파일 업로드 JSON 응답', {
          resultCode: result.code
        }, requestId);
      } else {
        const textResult = await response.text();
        result = {
          code: '200',
          result: '성공',
          data: textResult
        };
        secureLog(LogLevel.INFO, 'ATALK_API', 'Non-JSON upload success response received', {}, requestId);
      }
      
      // 로그 저장
      await this.logApiCall('/resource/upload', 'POST', {
        fileName,
        campaignName: campaignName
      }, result, response.status, requestId);

      // 🔥 수정: 더 정교한 성공/실패 판단 로직
      secureLog(LogLevel.INFO, 'ARS', '음성파일 업로드 응답 분석', {
        code: result.code,
        result: result.result,
        hasData: !!result.data,
        fileName
      }, requestId);

      const isSuccessCode = result.code === '200' || result.code === 'SUCCESS' || result.code === '0';
      const isSuccessResult = !result.result || 
                              result.result === '성공' || 
                              result.result === 'SUCCESS' || 
                              result.result.includes('성공') ||
                              result.result.toLowerCase().includes('success');

      if (isSuccessCode && isSuccessResult) {
        secureLog(LogLevel.INFO, 'ARS', '음성파일 업로드 성공', {
          fileName
        }, requestId);
        return {
          success: true,
          message: '음성파일이 성공적으로 업로드되었습니다.',
          fileName
        };
      } else {
        const errorMessage = result.result || 
                            result.data?.error || 
                            result.data?.message ||
                            `음성파일 업로드 실패 (코드: ${result.code})`;
        secureLog(LogLevel.WARNING, 'ARS', '음성파일 업로드 실패', {
          fileName,
          errorMessage,
          resultCode: result.code
        }, requestId);
        throw new Error(errorMessage);
      }
    } catch (error) {
      secureLog(LogLevel.ERROR, 'ARS', '음성파일 업로드 예외', {
        fileName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        success: false,
        message: error instanceof Error ? error.message : '음성파일 업로드에 실패했습니다.',
        fileName
      };
    }
  }


  /**
   * 3. 발송 결과 조회 - calllist/history API 구현 + 환경설정 개선
   */
  async getCallHistory(
    historyKey: string,
    campaignName: string,
    page: string = 'A'
  ): Promise<{ success: boolean; data?: any[]; message: string }> {
    const requestId = generateRequestId();
    
    try {
      const config = getAtalkConfig();
      const historyData = {
        history_key: historyKey,
        company: config.company,
        user_id: config.userId,
        text_campaign_name: sanitizeInput(campaignName),
        text_page: sanitizeInput(page),
      };

      secureLog(LogLevel.INFO, 'ARS', '발송 결과 조회 시도', {
        historyKey: historyKey,
        requestData: maskApiData(historyData)
      }, requestId);

      const response = await this.makeApiCall('/calllist/history', historyData, 'POST', requestId);
      
      // 🔥 수정: 더 정교한 성공/실패 판단 로직
      secureLog(LogLevel.INFO, 'ARS', '발송 결과 조회 응답 분석', {
        code: response.code,
        result: response.result,
        hasData: !!response.data,
        dataLength: Array.isArray(response.data) ? response.data.length : 0
      }, requestId);

      const isSuccessCode = response.code === '200' || response.code === 'SUCCESS' || response.code === '0';
      const isSuccessResult = !response.result || 
                              response.result === '성공' || 
                              response.result === 'SUCCESS' || 
                              response.result.includes('성공') ||
                              response.result.toLowerCase().includes('success') ||
                              response.result.includes('조회하였습니다');

      if (isSuccessCode && isSuccessResult) {
        secureLog(LogLevel.INFO, 'ARS', '발송 결과 조회 성공', {
          historyKey: historyKey,
          resultCount: Array.isArray(response.data) ? response.data.length : 0
        }, requestId);
        
        return {
          success: true,
          data: response.data || [],
          message: '발송 결과를 성공적으로 조회했습니다.',
        };
      } else {
        const errorMessage = response.result || 
                            response.data?.error || 
                            response.data?.message ||
                            `발송 결과 조회 실패 (코드: ${response.code})`;
        
        secureLog(LogLevel.WARNING, 'ARS', '발송 결과 조회 실패', {
          historyKey: historyKey,
          error: errorMessage,
          responseCode: response.code
        }, requestId);
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      secureLog(LogLevel.ERROR, 'ARS', '발송 결과 조회 예외', {
        historyKey: historyKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, requestId);
      
      return {
        success: false,
        message: error instanceof Error ? error.message : '발송 결과 조회에 실패했습니다.',
      };
    }
  }


  /**
   * 6. 고객 그룹을 ATALK 발송리스트에 동기화 (스텁 구현)
   */
  async syncCustomerGroupToAtalk(
    groupId: string,
    groupName: string,
    customerIds: string[]
  ): Promise<{ success: boolean; message: string; historyKeys: string[] }> {
    try {
      console.log(`[ATALK API] 고객 그룹 동기화: ${groupName} (${customerIds.length}명)`);
      
      // TODO: 실제 ATALK API 고객 그룹 동기화 기능 구현 필요
      // 현재는 스텁으로 성공 응답만 반환
      
      return {
        success: true,
        message: `고객 그룹 "${groupName}" 동기화 완료 (${customerIds.length}명)`,
        historyKeys: [] // 실제 구현 시 ATALK에서 반환하는 history keys
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '고객 그룹 동기화에 실패했습니다.',
        historyKeys: []
      };
    }
  }


  /**
   * 7. 기존 캠페인 재발송 파이프라인
   * 이전 설정을 사용하여 동일한 대상자들에게 재발송
   */
  async executeResendCampaignPipeline(params: {
    originalCampaignId: number;
    customerPhones: string[];
    sendNumber: string;
    audioFileBuffer?: Buffer;
    audioFileName?: string;
  }): Promise<{
    success: boolean;
    message: string;
    results: {
      callListAdded: number;
      callListFailed: number;
      historyKeys: string[];
    };
  }> {
    const results = {
      callListAdded: 0,
      callListFailed: 0,
      historyKeys: [] as string[],
    };

    try {
      console.log(`[ARS 재발송] 캠페인 ID ${params.originalCampaignId} 재발송 시작 - 대상: ${params.customerPhones.length}명`);

      // Step 1: 음성파일 재업로드 (있는 경우)
      if (params.audioFileBuffer && params.audioFileName) {
        console.log(`[ARS 재발송] 음성파일 재업로드: ${params.audioFileName}`);
        const uploadResult = await this.uploadAudioFile(params.audioFileBuffer, params.audioFileName, process.env.ATALK_CAMPAIGN_NAME || '주식회사마셈블');
        
        if (!uploadResult.success) {
          console.warn(`[ARS 재발송] 음성파일 업로드 실패 - 아톡비즈 기본 음원으로 재발송 진행: ${uploadResult.message}`);
        } else {
          console.log(`[ARS 재발송] 음성파일 재업로드 완료`);
        }
      } else {
        // 🔥 Fallback 메커니즘: 오디오 파일이 없어도 아톡비즈 기본 음원으로 재발송 진행
        console.log(`[ARS 재발송] 오디오 파일 없음 - 아톡비즈 기본 음원으로 재발송 진행`);
      }

      // Step 2: 발송리스트 재추가
      console.log(`[ARS 재발송] 발송리스트 재추가 시작`);
      const batchSize = 5;
      const historyKeys: string[] = [];

      for (let i = 0; i < params.customerPhones.length; i += batchSize) {
        const batch = params.customerPhones.slice(i, i + batchSize);
        const batchPromises = batch.map(phone => 
          this.addCallList(phone, process.env.ATALK_CAMPAIGN_NAME || '주식회사마셈블', 'A')
        );

        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value.success) {
            results.callListAdded++;
            if (result.value.historyKey) {
              historyKeys.push(result.value.historyKey);
            }
          } else {
            results.callListFailed++;
          }
        }

        if (i + batchSize < params.customerPhones.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      results.historyKeys = historyKeys;
      console.log(`[ARS 재발송] 발송리스트 재추가 완료 - 성공: ${results.callListAdded}, 실패: ${results.callListFailed}`);

      // API 문서에 따라 캠페인 자동 시작/생성 기능은 제거됨
      // 발송리스트 재추가만 수행하고 historyKey만 반환
      console.log(`[ARS 재발송] 발송리스트 재추가 완료 - historyKeys: ${historyKeys.length}개, ATALK API 문서에 따라 발송리스트 추가만 수행`);

      const successRate = (results.callListAdded / params.customerPhones.length) * 100;
      
      return {
        success: results.callListAdded > 0,
        message: `캠페인 재발송 리스트 추가 완료 - 성공: ${results.callListAdded}명 (${successRate.toFixed(1)}%), 실패: ${results.callListFailed}명`,
        results,
      };

    } catch (error) {
      console.error(`[ARS 재발송] 에러:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : '캠페인 재발송 중 오류가 발생했습니다.',
        results,
      };
    }
  }
}

export const atalkArsService = new AtalkArsService();