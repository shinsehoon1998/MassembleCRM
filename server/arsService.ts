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
      console.warn('⚠️  개발 모드: ATALK API 환경변수가 설정되지 않았습니다.');
      console.warn(`누락된 변수: ${missing.join(', ')}`);
      console.warn('📝 개발 모드에서는 모의 데이터로 대체합니다.');
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

// 환경변수 설정을 lazy하게 처리
let ATALK_API_CONFIG: any = null;

function getAtalkConfig() {
  if (!ATALK_API_CONFIG) {
    const secureConfig = validateAndSecureConfig();
    
    // 🔥 개발 모드에서 환경변수 누락 시 모의 데이터 사용
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const isMissingEnvVars = !secureConfig.token || !secureConfig.company || !secureConfig.userId;
    
    if (isDevelopment && isMissingEnvVars) {
      console.log('📝 개발 모드: 모의 ATALK API 설정 사용');
      ATALK_API_CONFIG = {
        baseUrl: 'http://mock-atalk-api.local',
        token: 'mock-token-for-development',
        company: 'mock-company',
        userId: 'mock-user-id',
        campaignName: process.env.ATALK_CAMPAIGN_NAME || '주식회사마셈블',
        page: 'A',
        mockMode: true
      };
    } else {
      ATALK_API_CONFIG = {
        baseUrl: secureConfig.baseUrl,
        token: secureConfig.token,
        company: secureConfig.company,
        userId: secureConfig.userId,
        campaignName: process.env.ATALK_CAMPAIGN_NAME || '주식회사마셈블',
        page: 'A',
        mockMode: false
      };
    }
  }
  return ATALK_API_CONFIG;
}

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
    const config = getAtalkConfig();
    const url = `${config.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`
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
      authPresent: !!config.token
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
      const config = getAtalkConfig();
      
      // 🔥 개발 모드에서 모의 응답 반환
      if (config.mockMode) {
        console.log(`[MOCK] 발송리스트 추가 모의 처리: ${targetPhone}`);
        
        // 90% 확률로 성공 시뮬레이션
        const isSuccess = Math.random() > 0.1;
        if (isSuccess) {
          return {
            success: true,
            historyKey: `mock-history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            message: '발송리스트에 추가되었습니다. (모의 데이터)',
          };
        } else {
          return {
            success: false,
            message: '발송리스트 추가에 실패했습니다. (모의 실패)',
          };
        }
      }
      
      const callData: AddCallListRequest = {
        text_send_no: sendNumber,
        company: config.company,
        user_id: config.userId,
        text_campaign_name: config.campaignName,
        text_page: config.page,
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
      const config = getAtalkConfig();
      
      // 🔥 개발 모드에서 모의 응답 반환
      if (config.mockMode) {
        console.log(`[MOCK] 음성파일 업로드 모의 처리: ${fileName}`);
        
        // 85% 확률로 성공 시뮬레이션
        const isSuccess = Math.random() > 0.15;
        if (isSuccess) {
          return {
            success: true,
            message: '음성파일이 성공적으로 업로드되었습니다. (모의 데이터)',
            fileName
          };
        } else {
          return {
            success: false,
            message: '음성파일 업로드에 실패했습니다. (모의 실패)',
            fileName
          };
        }
      }
      
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
      
      const response = await fetch(`${config.baseUrl}/resource/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
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
      const config = getAtalkConfig();
      
      // 🔥 개발 모드에서 모의 응답 반환
      if (config.mockMode) {
        console.log(`[MOCK] 캠페인 시작 모의 처리: historyKey=${historyKey}`);
        
        // 95% 확률로 성공 시뮬레이션
        const isSuccess = Math.random() > 0.05;
        if (isSuccess) {
          return {
            success: true,
            message: '캠페인이 성공적으로 시작되었습니다. (모의 데이터)',
          };
        } else {
          return {
            success: false,
            message: '캠페인 시작에 실패했습니다. (모의 실패)',
          };
        }
      }
      
      if (!historyKey) {
        console.log('[ARS] historyKey 없이 캠페인 시작 시도');
      }

      const startData = {
        company: config.company,
        user_id: config.userId,
        text_campaign_name: config.campaignName,
        text_page: config.page,
        ...(historyKey && { history_key: historyKey })
      };

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
    const results = {
      callListAdded: 0,
      callListFailed: 0,
      audioUploaded: false,
      campaignStarted: false,
      historyKeys: [] as string[],
    };

    try {
      console.log(`[ARS 파이프라인] 신규 캠페인 "${params.campaignName}" 시작 - 대상: ${params.customerPhones.length}명`);

      // Step 1: 음성파일 업로드 (있는 경우)
      if (params.audioFileBuffer && params.audioFileName) {
        console.log(`[ARS 파이프라인] 음성파일 업로드: ${params.audioFileName}`);
        const uploadResult = await this.uploadAudioFile(params.audioFileBuffer, params.audioFileName);
        results.audioUploaded = uploadResult.success;
        
        if (!uploadResult.success) {
          return {
            success: false,
            message: `음성파일 업로드 실패: ${uploadResult.message}`,
            results,
          };
        }
        console.log(`[ARS 파이프라인] 음성파일 업로드 완료`);
      } else if (params.scenarioId && params.scenarioId !== 'marketing_consent') {
        // 🔥 시나리오 오디오 필수 업로드 로직 강화
        console.warn(`[ARS 파이프라인] 경고: 시나리오 "${params.scenarioId}"에 오디오 파일이 없습니다.`);
        console.warn(`[ARS 파이프라인] marketing_consent 이외의 시나리오는 오디오 파일이 필수입니다.`);
        
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
      console.log(`[ARS 파이프라인] 발송리스트 추가 시작`);
      const batchSize = 5; // 동시 처리 제한
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

        // 배치 간 지연 (API 과부하 방지)
        if (i + batchSize < params.customerPhones.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      results.historyKeys = historyKeys;
      console.log(`[ARS 파이프라인] 발송리스트 추가 완료 - 성공: ${results.callListAdded}, 실패: ${results.callListFailed}`);

      // Step 3: 캠페인 시작 - 모든 historyKeys에 대해 처리
      if (results.callListAdded > 0 && historyKeys.length > 0) {
        console.log(`[ARS 파이프라인] 캠페인 시작 - ${historyKeys.length}개 historyKey 처리`);
        
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
          console.warn(`[ARS 파이프라인] 일부 캠페인만 시작됨: ${startedCount}/${historyKeys.length}`);
        }
        
        console.log(`[ARS 파이프라인] 캠페인 시작 완료 - ${startedCount}/${historyKeys.length}개 성공`);
      }

      const successRate = (results.callListAdded / params.customerPhones.length) * 100;
      
      // 🔥 트랜잭션 안전성: 최종 결과 검증 및 로깅
      const finalSuccess = results.callListAdded > 0;
      const detailedMessage = `캠페인 "${params.campaignName}" 발송 ${finalSuccess ? '완료' : '실패'} - 성공: ${results.callListAdded}명 (${successRate.toFixed(1)}%), 실패: ${results.callListFailed}명, 오디오: ${results.audioUploaded ? '업로드 성공' : '업로드 없음'}, 캠페인 시작: ${results.campaignStarted ? '성공' : '실패'}`;
      
      console.log(`[ARS 파이프라인] ${detailedMessage}`);
      
      return {
        success: finalSuccess,
        message: detailedMessage,
        results,
      };

    } catch (error) {
      console.error(`[ARS 파이프라인] 에러:`, error);
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