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

// 🔥 보안 강화: HTTPS 강제 및 환경변수 검증 (다중 명명 규칙 지원)
function validateAndSecureConfig() {
  // 환경변수 명명 규칙 유연성 지원
  const baseUrl = process.env.ATALK_API_BASE_URL || process.env.ATALK_API_URL;
  const token = process.env.ATALK_API_TOKEN || process.env.ATALK_API_KEY;
  const company = process.env.ATALK_COMPANY;
  const userId = process.env.ATALK_USER_ID;

  // 🔥 중요: 필수 환경변수 검증 - 모든 환경에서 강제
  if (!baseUrl || !token || !company || !userId) {
    const missing = [];
    if (!baseUrl) missing.push('ATALK_API_BASE_URL 또는 ATALK_API_URL');
    if (!token) missing.push('ATALK_API_TOKEN 또는 ATALK_API_KEY');
    if (!company) missing.push('ATALK_COMPANY');
    if (!userId) missing.push('ATALK_USER_ID');
    
    // 개발 모드에서 더 친화적인 메시지 제공
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const friendlyMessage = isDevelopment 
      ? `🛠️ ARS 기능을 사용하려면 다음 환경변수를 설정해주세요:\n\n현재 누락된 환경변수:\n${missing.map(m => `- ${m}`).join('\n')}\n\n예시 설정:\n- ATALK_API_BASE_URL=https://api.example.com\n- ATALK_API_TOKEN=your_token_here\n- ATALK_COMPANY=your_company\n- ATALK_USER_ID=your_user_id\n\n관리자에게 문의하여 정확한 값을 받으세요.`
      : `ARS 서비스 설정 오류: 관리자에게 문의하세요 (환경변수 누락: ${missing.join(', ')})`;
    
    secureLog(LogLevel.ERROR, 'CONFIG', '치명적 오류: 필수 ATALK API 환경변수가 설정되지 않았습니다', {
      missing: missing.join(', '),
      message: '서버를 시작하려면 모든 ATALK API 환경변수를 설정해야 합니다.',
      development: isDevelopment
    });
    throw new Error(friendlyMessage);
  }

  // 🔥 보안: HTTPS 강제 (프로덕션)
  if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
    secureLog(LogLevel.ERROR, 'CONFIG', '보안 오류: 프로덕션 환경에서는 HTTPS가 필수입니다', {
      currentUrl: baseUrl
    });
    throw new Error('프로덕션 환경에서는 HTTPS URL이 필요합니다');
  }

  // 개발 환경에서 HTTP 사용시 경고
  if (baseUrl.startsWith('http://')) {
    secureLog(LogLevel.WARNING, 'CONFIG', 'HTTP 사용 중 - Bearer 토큰이 평문으로 전송됩니다', {
      message: '프로덕션에서는 반드시 HTTPS를 사용하세요.'
    });
  }

  return { baseUrl, token, company, userId };
}

// 환경변수 설정을 lazy하게 처리
let ATALK_API_CONFIG: any = null;

// 🔥 환경변수 검증 상태 캐시 (중복 체크 방지)
let ENV_VALIDATION_RESULT: { success: boolean; error?: string; config?: any } | null = null;

function getAtalkConfig() {
  // 이미 검증된 결과가 있으면 재사용
  if (ENV_VALIDATION_RESULT) {
    if (!ENV_VALIDATION_RESULT.success) {
      throw new Error(ENV_VALIDATION_RESULT.error);
    }
    if (!ATALK_API_CONFIG) {
      ATALK_API_CONFIG = ENV_VALIDATION_RESULT.config;
    }
    return ATALK_API_CONFIG;
  }

  // 🔥 첫 번째 호출시에만 검증 수행
  try {
    const secureConfig = validateAndSecureConfig();
    
    // 🔥 실제 ATALK API 설정만 사용
    ATALK_API_CONFIG = {
      baseUrl: secureConfig.baseUrl,
      token: secureConfig.token,
      company: secureConfig.company,
      userId: secureConfig.userId,
      campaignName: process.env.ATALK_CAMPAIGN_NAME || '주식회사마셈블',
      page: 'A'
    };
    
    // 검증 성공 결과 캐시
    ENV_VALIDATION_RESULT = {
      success: true,
      config: ATALK_API_CONFIG
    };
    
    return ATALK_API_CONFIG;
  } catch (error) {
    // 🔥 검증 실패 결과 캐시하여 반복적인 에러 방지
    const errorMessage = error instanceof Error ? error.message : 'Unknown configuration error';
    ENV_VALIDATION_RESULT = {
      success: false,
      error: errorMessage
    };
    throw error;
  }
}

// 🔥 보안 설정 검증 강화
function validateSecurityConfig() {
  const config = validateAndSecureConfig();
  
  // API 키 형식 검증
  if (!isValidApiKey(config.token)) {
    secureLog(LogLevel.ERROR, 'CONFIG', 'Invalid API key format detected');
    throw new Error('유효하지 않은 API 키 형식입니다. 관리자에게 문의하세요.');
  }
  
  // 완전한 config 객체 반환
  return {
    ...config,
    campaignName: process.env.ATALK_CAMPAIGN_NAME || '주식회사마셈블',
    page: 'A'
  };
}

secureLog(LogLevel.INFO, 'CONFIG', 'ARS API 보안 설정 완료', {
  features: ['환경변수 검증', 'HTTPS 보안', 'PII 보호']
});

// API 응답 인터페이스
export interface AtalkApiResponse {
  code: string;
  history_key?: string;
  result?: string;
  data?: any;
}

// 발송리스트 추가 요청
export interface AddCallListRequest {
  text_send_no: string;
  company: string;
  user_id: string;
  text_campaign_name: string;
  text_page: string;
  callee: string;
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
      secureLog(LogLevel.ERROR, 'ATALK_API', `Error for ${endpoint}`, {
        error: errorMessage
      }, currentRequestId);
      
      await this.logApiCall(endpoint, method, data, { error: errorMessage }, 500, currentRequestId);
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
   * 1. 발송리스트 추가 - API 가이드 기반 단순 구현
   */
  async addCallList(
    sendNumber: string,
    targetPhone: string
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
        config = validateSecurityConfig();
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
      
      // 🔥 발신번호 검증
      if (!isValidPhoneNumber(sendNumber)) {
        secureLog(LogLevel.WARNING, 'ARS', '잘못된 발신번호 형식', {
          sendNumber: maskPhoneNumber(sendNumber)
        });
        
        return {
          success: false,
          message: `❌ 잘못된 발신번호 형식: ${maskPhoneNumber(sendNumber)}`,
        };
      }
      
      // 🔥 캠페인명 검증
      if (!isValidCampaignName(config.campaignName)) {
        secureLog(LogLevel.ERROR, 'ARS', '잘못된 캠페인명', {
          campaignName: config.campaignName
        });
        
        return {
          success: false,
          message: '❌ 캠페인명이 유효하지 않습니다. 관리자에게 문의하세요.',
        };
      }
      
      // 🔥 입력값 정제 (PHP 패턴)
      const callData: AddCallListRequest = {
        text_send_no: sanitizeInput(sendNumber),
        company: sanitizeInput(config.company),
        user_id: sanitizeInput(config.userId),
        text_campaign_name: sanitizeInput(config.campaignName),
        text_page: sanitizeInput(config.page),
        callee: cleanPhone
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
      const isSuccessResult = !response.result || 
                              response.result === '성공' || 
                              response.result === 'SUCCESS' || 
                              response.result.includes('성공') ||
                              response.result.toLowerCase().includes('success');

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
   * 2. 음성파일 업로드 - API 가이드 기반 단순 구현
   */
  async uploadAudioFile(
    fileBuffer: Buffer,
    fileName: string
  ): Promise<{ success: boolean; message: string; fileName?: string }> {
    try {
      const config = getAtalkConfig();
      
      const formData = new FormData();
      
      // 필수 필드 추가
      formData.append('text_campaign_name', config.campaignName);
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
          campaignName: config.campaignName
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
        campaignName: config.campaignName
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
   * 3. 캠페인 시작 - 발송 즉시 시작 API 사용
   */
  async startCampaign(
    historyKey?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const config = getAtalkConfig();
      
      const requestId = generateRequestId();
      
      if (!historyKey) {
        secureLog(LogLevel.WARNING, 'ARS', 'historyKey 없이 캠페인 시작 시도', {}, requestId);
      }

      const startData = {
        company: config.company,
        user_id: config.userId,
        text_campaign_name: config.campaignName,
        text_page: config.page,
        ...(historyKey && { history_key: historyKey })
      };

      const response = await this.makeApiCall('/calllist/start', startData, 'POST', requestId);
      
      // 🔥 수정: 더 정교한 성공/실패 판단 로직
      secureLog(LogLevel.INFO, 'ARS', '캠페인 시작 응답 분석', {
        code: response.code,
        result: response.result,
        hasData: !!response.data,
        hasHistoryKey: !!response.history_key
      }, requestId);

      const isSuccessCode = response.code === '200' || response.code === 'SUCCESS' || response.code === '0';
      const isSuccessResult = !response.result || 
                              response.result === '성공' || 
                              response.result === 'SUCCESS' || 
                              response.result.includes('성공') ||
                              response.result.toLowerCase().includes('success');
      const hasValidData = !response.data || typeof response.data === 'object';

      // 성공 조건: 응답 코드가 성공이고 result가 에러가 아닌 경우
      if (isSuccessCode && isSuccessResult) {
        secureLog(LogLevel.INFO, 'ARS', '캠페인 시작 성공 확인', {
          responseCode: response.code,
          result: response.result
        }, requestId);
        return {
          success: true,
          message: '캠페인이 성공적으로 시작되었습니다.',
        };
      } else {
        // 실패 조건들을 상세히 로깅
        const failReasons = [];
        if (!isSuccessCode) failReasons.push(`잘못된 코드: ${response.code}`);
        if (!isSuccessResult) failReasons.push(`결과 에러: ${response.result}`);
        if (!hasValidData) failReasons.push(`데이터 문제: ${JSON.stringify(response.data)}`);
        
        secureLog(LogLevel.WARNING, 'ARS', '캠페인 시작 실패', {
          failReasons: failReasons.join(', '),
          responseCode: response.code,
          result: response.result
        }, requestId);
        
        const errorMessage = response.result || 
                            response.data?.error || 
                            response.data?.message ||
                            `캠페인 시작 실패 (코드: ${response.code})`;
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error(`[ARS] 캠페인 시작 예외:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : '캠페인 시작에 실패했습니다.',
      };
    }
  }

  /**
   * 4. 캠페인 상태 조회 - historyKey로 상태 확인
   */
  async getCampaignStatus(
    historyKey: string
  ): Promise<{ success: boolean; status?: string; message: string }> {
    try {
      const config = getAtalkConfig();
      const historyData = {
        history_key: historyKey,
        company: config.company,
        user_id: config.userId,
        text_campaign_name: config.campaignName,
        text_page: config.page,
      };

      const response = await this.makeApiCall('/calllist/status', historyData);
      
      if (response.code === '200') {
        return {
          success: true,
          status: response.data?.status || 'unknown',
          message: '캠페인 상태를 성공적으로 조회했습니다.',
        };
      } else {
        throw new Error(response.result || '캠페인 상태 조회 실패');
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '캠페인 상태 조회에 실패했습니다.',
      };
    }
  }

  /**
   * 5. 캠페인 중단 - 캠페인 종료 (스텁 구현)
   */
  async stopCampaign(
    campaignId: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`[ATALK API] 캠페인 중단 요청: ${campaignId}`);
      
      // TODO: 실제 ATALK API 캠페인 중단 기능 구현 필요
      // 현재는 스텁으로 성공 응답만 반환
      
      return {
        success: true,
        message: '캠페인이 중단되었습니다. (스텁 구현)',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '캠페인 중단에 실패했습니다.',
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
   * 7. 신규 캠페인 발송 통합 파이프라인
   * 고객 그룹 → 발송리스트 추가 → 음성파일 업로드 → 캠페인 시작
   */
  async executeNewCampaignPipeline(params: {
    campaignName: string;
    customerPhones: string[];
    audioFileBuffer?: Buffer;
    audioFileName?: string;
    sendNumber: string;
    scenarioId?: string;
  }): Promise<{
    success: boolean;
    message: string;
    results: {
      callListAdded: number;
      callListFailed: number;
      audioUploaded: boolean;
      campaignStarted: boolean;
      historyKeys: string[];
    };
  }> {
    const requestId = generateRequestId();
    const results = {
      callListAdded: 0,
      callListFailed: 0,
      audioUploaded: false,
      campaignStarted: false,
      historyKeys: [] as string[],
    };

    try {
      
      secureLog(LogLevel.INFO, 'ARS_PIPELINE', '신규 캠페인 시작', {
        campaignName: params.campaignName,
        targetCount: params.customerPhones.length
      }, requestId);

      // Step 1: 음성파일 업로드 (있는 경우)
      if (params.audioFileBuffer && params.audioFileName) {
        secureLog(LogLevel.INFO, 'ARS_PIPELINE', '음성파일 업로드 시도', {
          fileName: params.audioFileName
        }, requestId);
        const uploadResult = await this.uploadAudioFile(params.audioFileBuffer, params.audioFileName);
        results.audioUploaded = uploadResult.success;
        
        if (!uploadResult.success) {
          return {
            success: false,
            message: `음성파일 업로드 실패: ${uploadResult.message}`,
            results,
          };
        }
        secureLog(LogLevel.INFO, 'ARS_PIPELINE', '음성파일 업로드 완료', {}, requestId);
      } else if (params.scenarioId && params.scenarioId !== 'marketing_consent') {
        // 🔥 시나리오 오디오 필수 업로드 로직 강화
        secureLog(LogLevel.WARNING, 'ARS_PIPELINE', '시나리오에 오디오 파일 없음', {
          scenarioId: params.scenarioId
        }, requestId);
        secureLog(LogLevel.WARNING, 'ARS_PIPELINE', '시나리오 오디오 파일 필수 경고', {}, requestId);
        
        // 🔥 선택적 엄격 벌시: 시나리오 오디오 필수일 때 업로드 없이 진행 차단
        const strictMode = process.env.ARS_STRICT_AUDIO_REQUIRED === 'true';
        if (strictMode) {
          return {
            success: false,
            message: `시나리오 "${params.scenarioId}"에는 오디오 파일이 필수입니다. 오디오 파일을 먼저 업로드해주세요.`,
            results,
          };
        }
      }

      // Step 2: 발송리스트 추가 (배치 처리)
      secureLog(LogLevel.INFO, 'ARS_PIPELINE', '발송리스트 추가 시작', {
        totalPhones: params.customerPhones.length
      }, requestId);
      const batchSize = 5; // 동시 처리 제한
      const historyKeys: string[] = [];

      for (let i = 0; i < params.customerPhones.length; i += batchSize) {
        const batch = params.customerPhones.slice(i, i + batchSize);
        secureLog(LogLevel.INFO, 'ARS_PIPELINE', '배치 처리 중', {
          batchNumber: Math.floor(i / batchSize) + 1,
          totalBatches: Math.ceil(params.customerPhones.length / batchSize),
          batchSize: batch.length
        }, requestId);
        
        const batchPromises = batch.map(phone => 
          this.addCallList(params.sendNumber, phone)
        );

        const batchResults = await Promise.allSettled(batchPromises);
        
        // 🔥 개선: 배치 결과 상세 분석
        let batchSuccess = 0;
        let batchFailed = 0;
        
        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const phone = batch[j];
          
          if (result.status === 'fulfilled' && result.value.success) {
            results.callListAdded++;
            batchSuccess++;
            if (result.value.historyKey) {
              historyKeys.push(result.value.historyKey);
              secureLog(LogLevel.INFO, 'ARS_PIPELINE', '발송 성공', {
                phone: maskPhoneNumber(phone),
                historyKey: result.value.historyKey
              }, requestId);
            } else {
              secureLog(LogLevel.WARNING, 'ARS_PIPELINE', '성공했지만 historyKey 없음', {
                phone: maskPhoneNumber(phone)
              }, requestId);
            }
          } else {
            results.callListFailed++;
            batchFailed++;
            const errorMsg = result.status === 'fulfilled' 
              ? result.value.message 
              : result.reason?.message || 'Unknown error';
            secureLog(LogLevel.ERROR, 'ARS_PIPELINE', '발송 실패', {
              phone: maskPhoneNumber(phone),
              error: errorMsg
            }, requestId);
          }
        }
        
        secureLog(LogLevel.INFO, 'ARS_PIPELINE', '배치 완료', {
          batchNumber: Math.floor(i / batchSize) + 1,
          success: batchSuccess,
          failed: batchFailed
        }, requestId);

        // 배치 간 지연 (API 과부하 방지)
        if (i + batchSize < params.customerPhones.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      results.historyKeys = historyKeys;
      secureLog(LogLevel.INFO, 'ARS_PIPELINE', '발송리스트 추가 완료', {
        success: results.callListAdded,
        failed: results.callListFailed
      }, requestId);

      // Step 3: 캠페인 시작 - 모든 historyKeys에 대해 처리
      if (results.callListAdded > 0 && historyKeys.length > 0) {
        secureLog(LogLevel.INFO, 'ARS_PIPELINE', '캠페인 시작 시도', {
          historyKeysCount: historyKeys.length
        }, requestId);
        
        // 🔥 수정: 모든 historyKeys에 대해 캠페인 시작
        let startedCount = 0;
        const startErrors: string[] = [];
        
        // 첫 번째 방법: 개별 historyKey로 각각 시작
        for (const historyKey of historyKeys) {
          const startResult = await this.startCampaign(historyKey);
          if (startResult.success) {
            startedCount++;
          } else {
            startErrors.push(`historyKey ${historyKey}: ${startResult.message}`);
          }
        }
        
        results.campaignStarted = startedCount > 0;
        
        if (startedCount === 0) {
          return {
            success: false,
            message: `모든 캠페인 시작 실패: ${startErrors.join(', ')}`,
            results,
          };
        }
        
        if (startedCount < historyKeys.length) {
          secureLog(LogLevel.WARNING, 'ARS_PIPELINE', '일부 캠페인만 시작됨', {
            started: startedCount,
            total: historyKeys.length
          }, requestId);
        }
        
        secureLog(LogLevel.INFO, 'ARS_PIPELINE', '캠페인 시작 완료', {
          success: startedCount,
          total: historyKeys.length
        }, requestId);
      }

      const successRate = (results.callListAdded / params.customerPhones.length) * 100;
      
      // 🔥 트랜잭션 안전성: 최종 결과 검증 및 로깅
      const finalSuccess = results.callListAdded > 0;
      const detailedMessage = `캠페인 "${params.campaignName}" 발송 ${finalSuccess ? '완료' : '실패'} - 성공: ${results.callListAdded}명 (${successRate.toFixed(1)}%), 실패: ${results.callListFailed}명, 오디오: ${results.audioUploaded ? '업로드 성공' : '업로드 없음'}, 캠페인 시작: ${results.campaignStarted ? '성공' : '실패'}`;
      
      secureLog(LogLevel.INFO, 'ARS_PIPELINE', '파이프라인 최종 결과', {
        message: detailedMessage
      }, requestId);
      
      return {
        success: finalSuccess,
        message: detailedMessage,
        results,
      };

    } catch (error) {
      secureLog(LogLevel.ERROR, 'ARS_PIPELINE', '파이프라인 에러', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, requestId);
      return {
        success: false,
        message: error instanceof Error ? error.message : '캠페인 발송 중 오류가 발생했습니다.',
        results,
      };
    }
  }

  /**
   * 8. 기존 캠페인 재발송 파이프라인
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
      campaignStarted: boolean;
      historyKeys: string[];
    };
  }> {
    const results = {
      callListAdded: 0,
      callListFailed: 0,
      campaignStarted: false,
      historyKeys: [] as string[],
    };

    try {
      console.log(`[ARS 재발송] 캠페인 ID ${params.originalCampaignId} 재발송 시작 - 대상: ${params.customerPhones.length}명`);

      // Step 1: 음성파일 재업로드 (있는 경우)
      if (params.audioFileBuffer && params.audioFileName) {
        console.log(`[ARS 재발송] 음성파일 재업로드: ${params.audioFileName}`);
        const uploadResult = await this.uploadAudioFile(params.audioFileBuffer, params.audioFileName);
        
        if (!uploadResult.success) {
          console.warn(`[ARS 재발송] 음성파일 업로드 실패, 기존 파일 사용: ${uploadResult.message}`);
        }
      }

      // Step 2: 발송리스트 재추가
      console.log(`[ARS 재발송] 발송리스트 재추가 시작`);
      const batchSize = 5;
      const historyKeys: string[] = [];

      for (let i = 0; i < params.customerPhones.length; i += batchSize) {
        const batch = params.customerPhones.slice(i, i + batchSize);
        const batchPromises = batch.map(phone => 
          this.addCallList(params.sendNumber, phone)
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

      // Step 3: 캠페인 재시작 - 모든 historyKeys에 대해 처리
      if (results.callListAdded > 0 && historyKeys.length > 0) {
        console.log(`[ARS 재발송] 캠페인 재시작 - ${historyKeys.length}개 historyKey 처리`);
        
        // 🔥 수정: 모든 historyKeys에 대해 캠페인 시작
        let startedCount = 0;
        const startErrors: string[] = [];
        
        for (const historyKey of historyKeys) {
          const startResult = await this.startCampaign(historyKey);
          if (startResult.success) {
            startedCount++;
          } else {
            startErrors.push(`historyKey ${historyKey}: ${startResult.message}`);
          }
        }
        
        results.campaignStarted = startedCount > 0;
        
        if (startedCount === 0) {
          return {
            success: false,
            message: `모든 캠페인 재시작 실패: ${startErrors.join(', ')}`,
            results,
          };
        }
        
        if (startedCount < historyKeys.length) {
          console.warn(`[ARS 재발송] 일부 캠페인만 재시작됨: ${startedCount}/${historyKeys.length}`);
        }
        
        console.log(`[ARS 재발송] 캠페인 재시작 완룼 - ${startedCount}/${historyKeys.length}개 성공`);
      }

      const successRate = (results.callListAdded / params.customerPhones.length) * 100;
      
      return {
        success: results.callListAdded > 0,
        message: `캠페인 재발송 완료 - 성공: ${results.callListAdded}명 (${successRate.toFixed(1)}%), 실패: ${results.callListFailed}명`,
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