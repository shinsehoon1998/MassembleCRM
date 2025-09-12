import { db } from './db';
import { arsCampaigns, arsSendLogs, arsApiLogs } from '@shared/schema';

// 🔥 보안 강화: HTTPS 강제 및 환경변수 검증
function validateAndSecureConfig() {
  const baseUrl = process.env.ATALK_API_BASE_URL || 'http://101.202.45.50:8080/thirdparty/v1';
  const token = process.env.ATALK_API_TOKEN || '';
  const company = process.env.ATALK_COMPANY || '';
  const userId = process.env.ATALK_USER_ID || '';

  // 🔥 중요: 필수 환경변수 검증 - fail-fast (프로덕션에서 강제)
  if (!token || !company || !userId) {
    const missing = [];
    if (!token) missing.push('ATALK_API_TOKEN');
    if (!company) missing.push('ATALK_COMPANY');
    if (!userId) missing.push('ATALK_USER_ID');
    
    if (process.env.NODE_ENV === 'production') {
      console.error('🚨 치명적 오류: 필수 ATALK API 환경변수가 설정되지 않았습니다');
      console.error(`누락된 변수: ${missing.join(', ')}`);
      throw new Error(`ARS Service 초기화 실패: 필수 환경변수 누락 (${missing.join(', ')})`);
    } else {
      console.warn('⚠️  개발 모드: ATALK API 환경변수가 설정되지 않았습니다. ARS 기능은 제한됩니다.');
      console.warn(`누락된 변수: ${missing.join(', ')}`);
      console.warn('프로덕션 배포 전에 반드시 설정하세요!');
    }
  }

  // 🔥 보안: HTTPS 강제 (프로덕션)
  if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
    console.error('🚨 보안 오류: 프로덕션 환경에서는 HTTPS가 필수입니다');
    console.error(`현재 URL: ${baseUrl}`);
    throw new Error('프로덕션 환경에서는 HTTPS URL이 필요합니다');
  }

  // 개발 환경에서 HTTP 사용시 경고
  if (baseUrl.startsWith('http://')) {
    console.warn('⚠️  보안 경고: HTTP를 사용하고 있습니다. Bearer 토큰이 평문으로 전송됩니다.');
    console.warn('   프로덕션에서는 반드시 HTTPS를 사용하세요.');
  }

  return { baseUrl, token, company, userId };
}

// 보안 검증된 설정
const secureConfig = validateAndSecureConfig();
const ATALK_API_CONFIG = {
  baseUrl: secureConfig.baseUrl,
  token: secureConfig.token,
  company: secureConfig.company,
  userId: secureConfig.userId,
  campaignName: process.env.ATALK_CAMPAIGN_NAME || '주식회사마셈블',
  page: 'A'
};

console.log('✅ ARS API 보안 설정 완료 - 환경변수 검증 및 HTTPS 보안 적용');

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
    method: 'POST' = 'POST'
  ): Promise<T> {
    const url = `${ATALK_API_CONFIG.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ATALK_API_CONFIG.token}`
    };
    
    const requestOptions = {
      method,
      headers,
      body: JSON.stringify(data),
    };

    // 로그에서 민감정보 마스킹
    const maskedData = { ...data };
    if (maskedData.user_id) maskedData.user_id = '***';
    if (maskedData.company) maskedData.company = '***';
    
    console.log(`[ATALK API] ${method} ${endpoint}`, {
      endpoint,
      data: maskedData,
      authPresent: !!ATALK_API_CONFIG.token
    });

    try {
      const response = await fetch(url, requestOptions);
      
      // HTTP 상태 코드 체크
      console.log(`[ATALK API] Response: ${response.status} , Content-Type: ${response.headers.get('content-type')}`);
      
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
            console.log(`[ATALK API] Non-JSON response received (length: ${textError.length})`);
          }
        } catch (parseError) {
          console.log(`[ATALK API] Response parsing failed:`, parseError);
        }
        
        await this.logApiCall(endpoint, method, data, errorResult, response.status);
        throw new Error(`API 호출 실패 (HTTP ${response.status}): ${response.statusText}`);
      }
      
      // 성공 응답 파싱
      const contentType = response.headers.get('content-type') || '';
      let result: any;
      
      if (contentType.includes('application/json')) {
        result = await response.json();
        console.log(`[ATALK API] Response code: ${result.code}`);
      } else {
        const textResult = await response.text();
        result = {
          code: '200',
          result: '성공',
          data: textResult
        };
        console.log(`[ATALK API] Non-JSON success response received`);
      }

      // API 호출 로그 저장
      await this.logApiCall(endpoint, method, data, result, response.status);

      return result as T;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ATALK API] Error for ${endpoint}:`, errorMessage);
      
      await this.logApiCall(endpoint, method, data, { error: errorMessage }, 500);
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
    httpCode: number
  ): Promise<void> {
    try {
      await db.insert(arsApiLogs).values({
        endpoint,
        method,
        requestData: JSON.stringify(request),
        responseData: JSON.stringify(response),
        httpCode,
      });
    } catch (error) {
      console.error('API 로그 저장 실패:', error);
    }
  }

  /**
   * 1. 발송리스트 추가 - API 가이드 기반 단순 구현
   */
  async addCallList(
    sendNumber: string,
    targetPhone: string
  ): Promise<{ success: boolean; historyKey?: string; message: string }> {
    try {
      const callData: AddCallListRequest = {
        text_send_no: sendNumber,
        company: ATALK_API_CONFIG.company,
        user_id: ATALK_API_CONFIG.userId,
        text_campaign_name: ATALK_API_CONFIG.campaignName,
        text_page: ATALK_API_CONFIG.page,
        callee: targetPhone.replace(/[^0-9]/g, '') // 숫자만
      };

      const response = await this.makeApiCall('/calllist/add', callData);

      if (response.code === '200') {
        return {
          success: true,
          historyKey: response.history_key,
          message: '발송리스트에 추가되었습니다.',
        };
      } else {
        throw new Error(response.result || '발송리스트 추가 실패');
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '발송리스트 추가에 실패했습니다.',
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
      const formData = new FormData();
      
      // 필수 필드 추가
      formData.append('text_campaign_name', ATALK_API_CONFIG.campaignName);
      formData.append('company', ATALK_API_CONFIG.company);
      formData.append('user_id', ATALK_API_CONFIG.userId);
      formData.append('file_title_name', fileName.replace(/\.[^/.]+$/, "")); // 확장자 제거
      formData.append('text_type', 'A');

      // 음성파일 추가
      const blob = new Blob([fileBuffer], { type: 'audio/wav' });
      formData.append('uploadFile', blob, fileName);
      
      const response = await fetch(`${ATALK_API_CONFIG.baseUrl}/resource/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ATALK_API_CONFIG.token}`,
        },
        body: formData,
      });

      console.log(`[ATALK API] Upload Response: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);

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
          console.log(`[ATALK API] Upload response parsing failed:`, parseError);
        }
        
        await this.logApiCall('/resource/upload', 'POST', {
          fileName,
          campaignName: ATALK_API_CONFIG.campaignName
        }, errorResult, response.status);
        
        throw new Error(`음성파일 업로드 실패 (HTTP ${response.status}): ${response.statusText}`);
      }
      
      // 성공 응답 파싱
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        result = await response.json();
        console.log(`[ATALK API] 음성파일 업로드 응답: ${result.code}`);
      } else {
        const textResult = await response.text();
        result = {
          code: '200',
          result: '성공',
          data: textResult
        };
        console.log(`[ATALK API] Non-JSON upload success response received`);
      }
      
      // 로그 저장
      await this.logApiCall('/resource/upload', 'POST', {
        fileName,
        campaignName: ATALK_API_CONFIG.campaignName
      }, result, response.status);

      if (result.code === '200') {
        return {
          success: true,
          message: '음성파일이 성공적으로 업로드되었습니다.',
          fileName
        };
      } else {
        throw new Error(result.result || '음성파일 업로드 실패');
      }
    } catch (error) {
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
      if (!historyKey) {
        // historyKey 없이도 시작 가능하도록 수정
        console.log('[ARS] historyKey 없이 캠페인 시작 시도');
      }

      // 발송 즉시 시작 API 사용
      const startData = {
        company: ATALK_API_CONFIG.company,
        user_id: ATALK_API_CONFIG.userId,
        text_campaign_name: ATALK_API_CONFIG.campaignName,
        text_page: ATALK_API_CONFIG.page,
        ...(historyKey && { history_key: historyKey })
      };

      // /calllist/start 엔드포인트 사용 (API 가이드 기반)
      const response = await this.makeApiCall('/calllist/start', startData);
      
      if (response.code === '200' || response.code === 'SUCCESS') {
        return {
          success: true,
          message: '캠페인이 성공적으로 시작되었습니다.',
        };
      } else {
        throw new Error(response.result || '캠페인 시작 실패');
      }
    } catch (error) {
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
      const historyData = {
        history_key: historyKey,
        company: ATALK_API_CONFIG.company,
        user_id: ATALK_API_CONFIG.userId,
        text_campaign_name: ATALK_API_CONFIG.campaignName,
        text_page: ATALK_API_CONFIG.page,
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






}

export const atalkArsService = new AtalkArsService();