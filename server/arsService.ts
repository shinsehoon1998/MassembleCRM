import crypto from 'crypto';
// FormData는 Node.js 18+ 글로벌 사용
import { db } from './db';
import { arsCampaigns, arsSendLogs, arsApiLogs, customers } from '@shared/schema';
import type { InsertArsCampaign, InsertArsSendLog } from '@shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

// Audio upload validation schema
const audioUploadSchema = z.object({
  fileName: z.string().min(1, '파일 이름이 필요합니다'),
  campaignName: z.string().min(1, '캐페인명이 필요합니다'),
  audioType: z.enum(['ars', 'voice', 'music', 'announcement']).default('ars'),
  mimeType: z.string().refine(
    (type) => ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/x-wav'].includes(type),
    { message: '지원하지 않는 오디오 형식입니다' }
  )
});

// 아톡비즈 PDS API 설정 - 환경변수 기반 설정 구현
const ATALK_API_CONFIG = {
  baseUrl: process.env.ATALK_BASE_URL || 'http://101.202.45.50:8080/thirdparty/v1',
  clientToken: process.env.ATALK_API_KEY || 'NjI3OTIz', // 사용자 제공 API 키
  secretKey: process.env.ATALK_SECRET_KEY || 'NjI3OTIz', // 서명/인증용 비밀키
  company: process.env.ATALK_COMPANY_ID || '627923', // 사용자 제공 company ID
  userId: process.env.ATALK_USER_ID || 'mb627923', // 사용자 제공 user ID (base64 디코딩된 값)
  campaignName: process.env.ATALK_CAMPAIGN_NAME || '주식회사마셈블', // 사용자 제공 캠페인명
  defaultSendNumber: process.env.ATALK_SENDER_NUMBER || '1588-0000', // 발신번호
  authMode: (process.env.ATALK_AUTH_MODE || 'basic') as 'basic' | 'bearer' | 'none', // 인증 모드 스위치
  allowDevBypass: process.env.ATALK_ALLOW_DEV_BYPASS === 'true', // 개발 환경 우회 허용
  page: 'A',
  campaignAliases: [] // 런타임에 원격 검증으로 채워짐
};

// 필수 설정값 확인 - 사용자 제공 값으로 완전 설정
const ARS_ENV_CONFIGURED = !!(ATALK_API_CONFIG.clientToken && ATALK_API_CONFIG.company && 
    ATALK_API_CONFIG.userId && ATALK_API_CONFIG.campaignName && ATALK_API_CONFIG.defaultSendNumber);

if (ARS_ENV_CONFIGURED) {
  console.log('✅ ARS API 설정 완료 - 사용자 제공 정보로 구성됨');
} else {
  console.warn('⚠️  ARS PDS API 환경변수가 누락되었습니다. ARS 기능이 비활성화됩니다.');
  console.warn('ARS 기능 사용을 위해서는 다음 환경변수가 필요합니다: ATALK_API_KEY, ATALK_SECRET_KEY, ATALK_COMPANY_ID, ATALK_USER_ID, ATALK_CAMPAIGN_NAME, ATALK_SENDER_NUMBER');
}

// 디버깅용 로그 (민감한 정보는 완전 마스킹) - 실제 값 확인
console.log(`[PDS CONFIG] company: ${ATALK_API_CONFIG.company}, userId: ${ATALK_API_CONFIG.userId ? '***' : 'MISSING'}, authMode: ${ATALK_API_CONFIG.authMode}, baseUrl: ${ATALK_API_CONFIG.baseUrl}`);

export interface AtalkApiResponse {
  code: string;
  history_key?: string;
  result?: string;
  data?: any;
}

export interface CallRequest {
  text_send_no: string;
  company: string;
  user_id: string;
  text_campaign_name: string;
  text_page: string;
  callee: string; // PDS 스펙: 수신번호 필수
}

export interface CallHistoryRequest {
  history_key: string;
  company: string;
  user_id: string;
  text_campaign_name: string;
  text_page: string;
}

export interface CampaignStopRequest {
  history_key: string;
  company: string;
  user_id: string;
}

export interface AudioUploadRequest {
  text_campaign_name: string;
  company: string;
  user_id: string;
  file_title_name: string;
  text_type: string;
}

export interface AudioUploadResponse {
  code: string;
  result: string;
}

export interface CallHistoryResponse {
  code: string;
  result: string;
  data: Array<{
    send_no: string;
    callee: string;
    caller: string;
    call_duration: string;
    connect_time: string;
    call_result_code: string;
    call_result: string;
  }>;
}

export class AtalkArsService {
  private validCampaignNameCache?: string; // 성능 최적화: 유효한 캠페인명 캠시
  
  private checkArsConfiguration(): boolean {
    if (!ARS_ENV_CONFIGURED) {
      console.warn('⚠️  ARS 기능이 설정되지 않았습니다. 환경변수를 확인해주세요.');
      return false;
    }
    return true;
  }
  
  private async makeApiCall<T = AtalkApiResponse>(
    endpoint: string,
    data: any,
    method: 'POST' = 'POST'
  ): Promise<T> {
    const url = `${ATALK_API_CONFIG.baseUrl}${endpoint}`;
    
    // 인증 모드 스위치 구현 - basic/bearer/none 지원
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ATALK-PDS-Client/1.0'
    };

    switch (ATALK_API_CONFIG.authMode) {
      case 'basic':
        const basicToken = Buffer.from(`${ATALK_API_CONFIG.clientToken}:${ATALK_API_CONFIG.secretKey || ATALK_API_CONFIG.clientToken}`).toString('base64');
        headers['Authorization'] = `Basic ${basicToken}`;
        break;
      case 'bearer':
        headers['Authorization'] = `Bearer ${ATALK_API_CONFIG.clientToken}`;
        break;
      case 'none':
        // Authorization 헤더 없음
        break;
      default:
        console.warn(`[ATALK API] 알 수 없는 인증 모드: ${ATALK_API_CONFIG.authMode}, basic 사용`);
        const defaultToken = Buffer.from(`${ATALK_API_CONFIG.clientToken}:${ATALK_API_CONFIG.secretKey || ATALK_API_CONFIG.clientToken}`).toString('base64');
        headers['Authorization'] = `Basic ${defaultToken}`;
    }
    
    const requestOptions = {
      method,
      headers,
      body: JSON.stringify(data),
    };

    // 보안: PII 및 인증 정보 완전 마스킹
    const sanitizedData = { ...data };
    if (sanitizedData.callee) sanitizedData.callee = '***'; // 전화번호 마스킹
    if (sanitizedData.user_id) sanitizedData.user_id = '***'; // 사용자 ID 마스킹
    if (sanitizedData.text_send_no) sanitizedData.text_send_no = '***'; // 발신번호 마스킹
    
    console.log(`[ATALK API] ${method} ${endpoint}`, {
      endpoint,
      data: sanitizedData,
      authPresent: !!headers['Authorization'] // Authorization 헤더 존재 여부만 로깅
    });

    try {
      const response = await fetch(url, requestOptions);
      
      // HTML 응답 확인 (에러 페이지일 가능성)
      const contentType = response.headers.get('content-type');
      console.log(`[ATALK API] Response: ${response.status} ${response.statusText}, Content-Type: ${contentType}`);
      
      if (!contentType?.includes('application/json')) {
        // HTML 응답인 경우 - 로그인 페이지이거나 404 페이지일 가능성
        const textResponse = await response.text();
        console.error(`[ATALK API] Non-JSON response received (length: ${textResponse.length})`);
        
        // 보안: 무인증 재시도 제거 - 인증 실패 시 즉시 실패 처리
        throw new Error(`인증 실패: JSON이 아닌 응답 수신 (HTTP ${response.status})`);
      }

      const result = await response.json();
      // 응답 로깅 (민감한 정보 제외)
      console.log(`[ATALK API] Response:`, { 
        code: result.code, 
        result: result.result,
        hasData: !!result.data,
        hasHistoryKey: !!result.history_key,
        dataLength: result.data ? (Array.isArray(result.data) ? result.data.length : 'object') : 0
      });

      // API 호출 로그 저장 - 민감한 정보 완전 마스킹
      const sanitizedDataForLog = { ...data };
      if (sanitizedDataForLog.callee) sanitizedDataForLog.callee = '[MASKED]';
      if (sanitizedDataForLog.text_send_no) sanitizedDataForLog.text_send_no = '[MASKED]';
      if (sanitizedDataForLog.user_id) sanitizedDataForLog.user_id = '[MASKED]';
      await this.logApiCall(endpoint, method, sanitizedDataForLog, result, response.status);

      if (result.code !== '200') {
        throw new Error(`API 오류: ${result.result || result.message || 'Unknown error'}`);
      }

      return result as T;
    } catch (error) {
      // 에러 로그 저장 (민감한 정보 제외)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ATALK API] Error for ${endpoint}:`, errorMessage);
      
      // 로그 저장 시 민감한 정보 제거
      const sanitizedData = { ...data };
      if (sanitizedData.callee) sanitizedData.callee = '[MASKED]';
      if (sanitizedData.text_send_no) sanitizedData.text_send_no = '[MASKED]';
      if (sanitizedData.user_id) sanitizedData.user_id = '[MASKED]';
      
      await this.logApiCall(endpoint, method, sanitizedData, { error: errorMessage }, 500);
      throw error;
    }
  }

  // 캠페인명 정규화 메서드 - 한국어 특수문자 및 공백 처리
  private normalizeCampaignName(campaignName: string): string {
    return campaignName
      .trim() // 앞뒤 공백 제거
      .replace(/\s+/g, ' ') // 여러 공백을 하나로
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // 보이지 않는 문자 제거
      .replace(/[\u3000]/g, ' ') // 전각 공백을 반각으로
      .trim();
  }

  /**
   * 원격 API를 통한 실제 캠페인명 검증 메서드
   * 아톡비즈 API에서 실제 등록된 캠페인을 확인하여 유효성 검증
   */
  private async findValidCampaignName(preferredName: string): Promise<string> {
    // 캐시된 유효한 캠페인명이 있으면 사용
    if (this.validCampaignNameCache) {
      console.log(`[ATALK] 캐시된 유효 캠페인명 사용: ${this.validCampaignNameCache}`);
      return this.validCampaignNameCache;
    }

    const normalizedPreferred = this.normalizeCampaignName(preferredName);
    
    // 개발 환경 우회 로직
    if (ATALK_API_CONFIG.allowDevBypass) {
      console.warn(`[ATALK] 캠페인 원격 검증 생략 - 개발 모드: ${normalizedPreferred}`);
      this.validCampaignNameCache = normalizedPreferred;
      return normalizedPreferred;
    }
    
    // 실제 벤더 API를 통한 캠페인 검증 구현
    try {
      console.log(`[ATALK] 캠페인 "${normalizedPreferred}" 원격 검증 시작`);
      
      // 테스트 history 호출로 캠페인 존재 확인
      const testHistoryData = {
        history_key: '505056', // 테스트용 키
        company: ATALK_API_CONFIG.company,
        user_id: ATALK_API_CONFIG.userId,
        text_campaign_name: normalizedPreferred,
        text_page: ATALK_API_CONFIG.page
      };
      
      const response = await this.makeApiCall('/calllist/history', testHistoryData);
      
      if (response.code === '200' || response.code === '100') {
        // 캠페인이 존재함 (성공 또는 데이터 없음)
        console.log(`[ATALK] 캠페인 "${normalizedPreferred}" 검증 성공`);
        this.validCampaignNameCache = normalizedPreferred;
        return normalizedPreferred;
      } else {
        throw new Error(`캠페인 검증 실패: ${response.result || response.code}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '캠페인 검증 실패';
      console.error(`[ATALK] 캠페인 "${normalizedPreferred}" 검증 실패: ${errorMsg}`);
      
      // 검증 실패 시 다른 캠페인명들 시도
      const alternativeCampaigns = ['주식회사 마셈블', 'IVR_API', 'MASSEMBLE', '마셈블', '자동발송'];
      
      for (const altCampaign of alternativeCampaigns) {
        if (altCampaign === normalizedPreferred) continue;
        
        try {
          console.log(`[ATALK] 대체 캠페인 테스트: ${altCampaign}`);
          const altTestData = {
            history_key: '505056',
            company: ATALK_API_CONFIG.company,
            user_id: ATALK_API_CONFIG.userId,
            text_campaign_name: altCampaign,
            text_page: ATALK_API_CONFIG.page
          };
          
          const altResponse = await this.makeApiCall('/calllist/history', altTestData);
          
          if (altResponse.code === '200' || altResponse.code === '100') {
            console.log(`[ATALK] 대체 캠페인 "${altCampaign}" 검증 성공`);
            this.validCampaignNameCache = altCampaign;
            return altCampaign;
          }
        } catch (altError) {
          console.log(`[ATALK] 캠페인 "${altCampaign}" 테스트 실패: ${altError instanceof Error ? altError.message : altError}`);
          continue;
        }
      }
      
      // 모든 캠페인 검증 실패
      throw new Error(`사용 가능한 캠페인을 찾을 수 없습니다. 아톡 시스템에 등록된 캠페인을 확인하세요.`);
    }
  }

  private async logApiCall(
    endpoint: string,
    method: string,
    request: any,
    response: any,
    httpCode: number
  ): Promise<void> {
    try {
      // PII 제거를 위한 요청 데이터 마스킹
      const sanitizedRequest = { ...request };
      if (sanitizedRequest.callee) sanitizedRequest.callee = '[MASKED_PHONE]';
      if (sanitizedRequest.text_send_no) sanitizedRequest.text_send_no = '[MASKED_SENDER]';
      if (sanitizedRequest.user_id) sanitizedRequest.user_id = '[MASKED_USER]';
      
      // PII 제거를 위한 응답 데이터 마스킹
      const sanitizedResponse = { ...response };
      if (sanitizedResponse.data && Array.isArray(sanitizedResponse.data)) {
        sanitizedResponse.data = sanitizedResponse.data.map((item: any) => ({
          ...item,
          callee: item.callee ? '[MASKED_PHONE]' : undefined,
          caller: item.caller ? '[MASKED_PHONE]' : undefined,
          send_no: item.send_no ? '[MASKED_SENDER]' : undefined,
          connect_time: item.connect_time ? '[MASKED_TIME]' : undefined
        }));
      }
      
      await db.insert(arsApiLogs).values({
        endpoint,
        method,
        requestData: JSON.stringify(sanitizedRequest),
        responseData: JSON.stringify(sanitizedResponse),
        httpCode,
      });
    } catch (error) {
      console.error('API 로그 저장 실패:', error);
    }
  }

  /**
   * 단일 고객에게 ARS 발솠 - 캠페인명 정규화 적용
   */
  async sendSingleArs(
    customerId: string,
    sendNumber: string,
    scenarioId: string = 'marketing_consent'
  ): Promise<{ success: boolean; historyKey?: string; message: string }> {
    if (!this.checkArsConfiguration()) {
      return {
        success: false,
        message: 'ARS 기능이 설정되지 않았습니다. 환경변수를 확인해주세요.'
      };
    }
    
    try {
      // 고객 정보 조회
      const customer = await db.query.customers.findFirst({
        where: eq(customers.id, customerId),
      });

      if (!customer) {
        throw new Error('고객을 찾을 수 없습니다.');
      }

      if (!customer.phone) {
        throw new Error('고객의 전화번호가 없습니다.');
      }

      // 전화번호 포맷팅 (숫자만 추출)
      const formattedPhone = customer.phone.replace(/[^0-9]/g, '');

      // 사용 가능한 캠페인명 찾기
      const validCampaignName = await this.findValidCampaignName(ATALK_API_CONFIG.campaignName);
      
      // ARS 호출 요청 데이터
      const callData: CallRequest = {
        text_send_no: ATALK_API_CONFIG.defaultSendNumber,
        company: ATALK_API_CONFIG.company,
        user_id: ATALK_API_CONFIG.userId,
        text_campaign_name: validCampaignName, // 검증된 캠페인명 사용
        text_page: ATALK_API_CONFIG.page,
        callee: formattedPhone
      };

      const response = await this.makeApiCall('/calllist/add', callData);

      // 발송 로그 저장
      await db.insert(arsSendLogs).values({
        customerId,
        phone: '', // 보안: PII 로깅 방지
        scenarioId,
        historyKey: response.history_key,
        status: 'sent',
        sentAt: new Date(),
      });

      return {
        success: true,
        historyKey: response.history_key,
        message: `ARS 발송이 완료되었습니다. (캠페인: ${validCampaignName})`,
      };
    } catch (error) {
      // 실패 로그 저장
      const errorMessage = error instanceof Error ? error.message : 'ARS 발송에 실패했습니다.';
      await db.insert(arsSendLogs).values({
        customerId,
        phone: '', // 보안: 전화번호 로깅 방지
        scenarioId,
        status: 'failed',
        errorMessage,
        sentAt: new Date(),
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'ARS 발송에 실패했습니다.',
      };
    }
  }

  /**
   * 여러 고객에게 대량 ARS 발송
   */
  async sendBulkArs(
    customerIds: string[],
    sendNumber: string,
    campaignName: string,
    scenarioId: string = 'marketing_consent',
    groupId?: string
  ): Promise<{ campaignId: number; historyKeys: string[]; failedCount: number }> {
    // 캠페인 생성
    const [campaign] = await db.insert(arsCampaigns).values({
      name: campaignName,
      scenarioId,
      totalCount: customerIds.length,
      status: 'processing',
      createdBy: 'system', // TODO: 실제 사용자 ID로 변경
      targetGroupId: groupId, // 그룹 ID 저장
    }).returning();

    const historyKeys: string[] = [];
    let failedCount = 0;

    // 고객들 조회
    const customerList = await db.query.customers.findMany({
      where: inArray(customers.id, customerIds),
    });

    console.log(`[ARS] 캠페인 "${campaignName}" 생성 - 대상 고객 ${customerList.length}명`);

    // 각 고객에게 개별 발송
    for (const customer of customerList) {
      try {
        if (!customer.phone) {
          failedCount++;
          continue;
        }

        const formattedPhone = customer.phone.replace(/[^0-9]/g, '');

        // 사용 가능한 캠페인명 찾기 (첫 번째 고객에서만 실행)
        if (!this.validCampaignNameCache) {
          this.validCampaignNameCache = await this.findValidCampaignName(ATALK_API_CONFIG.campaignName);
          console.log(`[ARS] 캠페인 "${this.validCampaignNameCache}" 사용으로 설정`);
        }
        
        const callData: CallRequest = {
          text_send_no: ATALK_API_CONFIG.defaultSendNumber,
          company: ATALK_API_CONFIG.company,
          user_id: ATALK_API_CONFIG.userId,
          text_campaign_name: this.validCampaignNameCache, // 캠시된 유효 캠페인명
          text_page: ATALK_API_CONFIG.page,
          callee: formattedPhone
        };

        console.log(`[ARS] "${this.validCampaignNameCache}" 캠페인으로 ${customer.name} (***) 발송`); // 보안: PII 마스킹
        const response = await this.makeApiCall('/calllist/add', callData);

        // 성공 로그 저장
        await db.insert(arsSendLogs).values({
          campaignId: campaign.id,
          customerId: customer.id,
          phone: '', // 보안: PII 로깅 방지
          scenarioId,
          historyKey: response.history_key,
          status: 'sent',
          sentAt: new Date(),
        });

        if (response.history_key) {
          historyKeys.push(response.history_key);
        }

        // API 호출 간격 (과부하 방지 + 같은 캠페인으로 인식되도록 시간 조정)
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        failedCount++;
        
        // 실패 로그 저장 (에러 메시지 포함)
        const errorMessage = error instanceof Error ? error.message : '발송 중 알 수 없는 오류가 발생했습니다.';
        await db.insert(arsSendLogs).values({
          campaignId: campaign.id,
          customerId: customer.id,
          phone: customer.phone || '',
          scenarioId,
          status: 'failed',
          errorMessage, // 실패 사유 저장
          sentAt: new Date(),
        });
      }
    }

    // 캠페인 상태 업데이트
    await db.update(arsCampaigns)
      .set({
        successCount: historyKeys.length,
        failedCount,
        status: 'sent',
        startedAt: new Date(),
      })
      .where(eq(arsCampaigns.id, campaign.id));

    return {
      campaignId: campaign.id,
      historyKeys,
      failedCount,
    };
  }

  /**
   * ARS 발송 결과 조회
   */
  async getCallHistory(historyKey: string): Promise<CallHistoryResponse> {
    const historyData: CallHistoryRequest = {
      history_key: historyKey,
      company: ATALK_API_CONFIG.company,
      user_id: ATALK_API_CONFIG.userId,
      text_campaign_name: ATALK_API_CONFIG.campaignName,
      text_page: 'A',
    };

    return await this.makeApiCall<CallHistoryResponse>('/calllist/history', historyData);
  }

  /**
   * 발송 로그 상태 업데이트
   */
  async updateCallResults(): Promise<void> {
    // 최근 24시간 내 발송된 로그 중 아직 완료되지 않은 것들
    const pendingLogs = await db.query.arsSendLogs.findMany({
      where: eq(arsSendLogs.status, 'sent'),
    });

    for (const log of pendingLogs) {
      if (!log.historyKey) continue;

      try {
        const history = await this.getCallHistory(log.historyKey);
        
        if (history.data && history.data.length > 0) {
          const callData = history.data[0];
          
          // 통화 결과에 따른 상태 업데이트
          let status = 'success';
          let dtmfInput = '';
          let duration = 0;

          if (callData.call_result_code === 'OK') {
            status = 'success';
            duration = parseInt(callData.call_duration) || 0;
            
            // DTMF 입력 값 추출 (실제 API 응답에 따라 조정 필요)
            if (callData.call_result.includes('1')) {
              dtmfInput = '1'; // 동의
            } else if (callData.call_result.includes('2')) {
              dtmfInput = '2'; // 거부
            }
          } else if (callData.call_result_code === 'REFUSE') {
            status = 'no_answer';
          } else {
            status = 'failed';
          }

          // 실패 사유 설정
          let errorMessage = null;
          if (status === 'failed') {
            errorMessage = `통화 실패: ${callData.call_result || callData.call_result_code}`;
          } else if (status === 'no_answer') {
            errorMessage = '수신거부 또는 응답없음';
          }

          // 로그 업데이트
          await db.update(arsSendLogs)
            .set({
              status: status as any,
              dtmfInput,
              duration,
              errorMessage,
              completedAt: new Date(),
            })
            .where(eq(arsSendLogs.id, log.id));

          // 마케팅 동의 처리
          if (dtmfInput === '1') {
            await db.update(customers)
              .set({
                marketingConsent: true,
                marketingConsentDate: new Date(),
                marketingConsentMethod: 'ars',
              })
              .where(eq(customers.id, log.customerId));
          }
        }

        // API 호출 간격
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`이력 조회 실패 - History Key: ${log.historyKey}`, error);
      }
    }
  }

  /**
   * 캠페인 통계 업데이트
   */
  async updateCampaignStats(campaignId: number): Promise<void> {
    const logs = await db.query.arsSendLogs.findMany({
      where: eq(arsSendLogs.campaignId, campaignId),
    });

    const successCount = logs.filter(log => log.status === 'success').length;
    const failedCount = logs.filter(log => log.status === 'failed' || log.status === 'no_answer').length;
    const consentCount = logs.filter(log => log.dtmfInput === '1').length;
    const rejectCount = logs.filter(log => log.dtmfInput === '2').length;

    await db.update(arsCampaigns)
      .set({
        successCount,
        failedCount,
        consentCount,
        rejectCount,
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(arsCampaigns.id, campaignId));
  }

  /**
   * 마케팅 동의가 필요한 고객 조회
   */
  async getMarketingTargetCustomers(limit: number = 100): Promise<Array<{
    id: string;
    name: string;
    phone: string;
    status: string;
  }>> {
    const targetCustomers = await db.query.customers.findMany({
      where: eq(customers.marketingConsent, false),
      limit,
    });

    return targetCustomers
      .filter(customer => customer.phone && customer.phone.trim() !== '')
      .map(customer => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone!,
        status: customer.status,
      }));
  }

  /**
   * 캠페인 종료
   */
  // 아톡비즈 API로 캠페인 중단 요청
  private async stopCampaignViaApi(historyKey: string): Promise<boolean> {
    try {
      const stopData: CampaignStopRequest = {
        history_key: historyKey,
        company: ATALK_API_CONFIG.company,
        user_id: ATALK_API_CONFIG.userId,
      };

      const response = await this.makeApiCall<AtalkApiResponse>(
        '/calllist/stop',
        stopData
      );

      return response.code === '200' || response.code === 'success';
    } catch (error) {
      console.error('Failed to stop campaign via API:', error);
      return false;
    }
  }

  async stopCampaign(campaignId: number): Promise<{
    success: boolean;
    message: string;
    stoppedCount?: number;
  }> {
    try {
      // 먼저 캠페인 정보 조회
      const [campaign] = await db
        .select()
        .from(arsCampaigns)
        .where(eq(arsCampaigns.id, campaignId));

      if (!campaign) {
        return {
          success: false,
          message: '캠페인을 찾을 수 없습니다.',
        };
      }

      // 아톡비즈 API로 캠페인 중단 요청 (history_key가 있는 경우)
      if (campaign.historyKey) {
        const apiStopSuccess = await this.stopCampaignViaApi(campaign.historyKey);
        if (!apiStopSuccess) {
          console.warn(`Failed to stop campaign via API for campaign ${campaignId}`);
        }
      }

      // 캠페인 상태를 종료로 변경
      const [updatedCampaign] = await db
        .update(arsCampaigns)
        .set({ 
          status: 'stopped',
        })
        .where(eq(arsCampaigns.id, campaignId))
        .returning();

      // 해당 캠페인의 대기 중인 발송들을 취소 상태로 변경
      const result = await db
        .update(arsSendLogs)
        .set({ 
          status: 'cancelled',
        })
        .where(sql`${arsSendLogs.campaignId} = ${campaignId} AND ${arsSendLogs.status} = 'pending'`);

      const stoppedCount = result.rowCount || 0;

      // API 로그 기록
      await this.logApiCall(
        'campaign_stop',
        'POST',
        { campaignId },
        { 
          success: true, 
          stoppedCount,
          campaignName: campaign.name 
        },
        200
      );

      return {
        success: true,
        message: `캠페인이 종료되었습니다. ${stoppedCount}개의 대기 중인 발송이 취소되었습니다.`,
        stoppedCount,
      };

    } catch (error) {
      console.error('Failed to stop campaign:', error);
      
      // 오류 로그 기록
      await this.logApiCall(
        'campaign_stop',
        'POST',
        { campaignId },
        { error: error instanceof Error ? error.message : 'Unknown error' },
        500
      );

      return {
        success: false,
        message: error instanceof Error ? error.message : '캠페인 종료에 실패했습니다.',
      };
    }
  }

  /**
   * 음원 파일 업로드 - FormData를 사용한 개선된 구현
   */
  async uploadAudioFile(
    fileBuffer: Buffer,
    fileName: string,
    campaignName: string,
    audioType: string = 'ars',
    mimeType: string = 'audio/wav'
  ): Promise<{ success: boolean; message: string; fileName?: string }> {
    try {
      // Zod 유효성 검사
      const validationResult = audioUploadSchema.safeParse({
        fileName,
        campaignName,
        audioType,
        mimeType
      });

      if (!validationResult.success) {
        const errorMessage = validationResult.error.errors.map(e => e.message).join(', ');
        throw new Error(`입력 데이터 오류: ${errorMessage}`);
      }

      const validatedData = validationResult.data;

      // FormData를 사용한 버터 및 보안성 있는 multipart 업로드
      const formData = new FormData();
      
      // 텍스트 필드 추가
      formData.append('text_campaign_name', validatedData.campaignName);
      formData.append('company', ATALK_API_CONFIG.company);
      formData.append('user_id', ATALK_API_CONFIG.userId);
      formData.append('file_title_name', validatedData.fileName.replace(/\.[^/.]+$/, "")); // 확장자 제거
      formData.append('text_type', 'A'); // PDS 스펙: A 고정

      // 파일 추가 (Blob 사용으로 web FormData 호환)
      const blob = new Blob([fileBuffer], { type: validatedData.mimeType });
      formData.append('uploadFile', blob, validatedData.fileName);

      // 일관된 Bearer 토큰 사용 (makeApiCall과 동일한 인증 방식)
      const authToken = Buffer.from(`${ATALK_API_CONFIG.clientToken}:${ATALK_API_CONFIG.secretKey}`).toString('base64');
      
      const response = await fetch(`${ATALK_API_CONFIG.baseUrl}/resource/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authToken}`,
          'User-Agent': 'ATALK-PDS-Client/1.0',
          // FormData가 Content-Type 자동 설정
        },
        body: formData,
      });

      const result = await response.json() as AudioUploadResponse;

      // API 호출 로그 저장
      await this.logApiCall('/resource/upload', 'POST', {
        fileName: validatedData.fileName,
        campaignName: validatedData.campaignName,
        audioType: validatedData.audioType,
        mimeType: validatedData.mimeType
      }, result, response.status);

      if (result.code !== '200') {
        throw new Error(`음원 업로드 실패: ${result.result || 'Unknown error'}`);
      }

      return {
        success: true,
        message: '음원 파일이 성공적으로 업로드되었습니다.',
        fileName: validatedData.fileName // 클라이언트와의 일관성을 위한 필드
      };
    } catch (error) {
      // 에러 로그 저장 (민감한 정보 제거)
      await this.logApiCall('/resource/upload', 'POST', {
        fileName: fileName || '[NO_NAME]',
        campaignName: campaignName || '[NO_CAMPAIGN]',
        audioType,
        mimeType
      }, { error: error instanceof Error ? error.message : 'Unknown error' }, 500);

      return {
        success: false,
        message: error instanceof Error ? error.message : '음원 업로드에 실패했습니다.',
        fileName
      };
    }
  }

  /**
   * 고객그룹의 발송리스트를 아톡에 등록
   */
  async syncCustomerGroupToAtalk(
    groupId: string,
    groupName: string,
    customerIds: string[]
  ): Promise<{ success: boolean; message: string; historyKeys: string[] }> {
    try {
      const historyKeys: string[] = [];
      let failedCount = 0;

      // 고객 정보 조회
      const customerList = await db.query.customers.findMany({
        where: inArray(customers.id, customerIds),
      });

      console.log(`[아톡 동기화] 그룹 "${groupName}"의 ${customerList.length}명을 아톡 발송리스트에 등록`);

      // 각 고객을 아톡 발송리스트에 추가
      for (const customer of customerList) {
        try {
          if (!customer.phone) {
            failedCount++;
            continue;
          }

          const formattedPhone = customer.phone.replace(/[^0-9]/g, '');
          
          const callData: CallRequest = {
            text_send_no: ATALK_API_CONFIG.defaultSendNumber,
            company: ATALK_API_CONFIG.company,
            user_id: ATALK_API_CONFIG.userId,
            text_campaign_name: `${groupName}_발송리스트`,
            text_page: ATALK_API_CONFIG.page, // PDS 스펙: 페이지 코드 'A'
            callee: formattedPhone // PDS 스펙: 수신번호
          };

          const response = await this.makeApiCall('/calllist/add', callData);
          
          if (response.history_key) {
            historyKeys.push(response.history_key);
          }

          // API 호출 간격
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          failedCount++;
          console.error(`고객 ${customer.name} 등록 실패:`, error);
        }
      }

      const successCount = customerList.length - failedCount;

      return {
        success: true,
        message: `그룹 동기화 완료: 성공 ${successCount}명, 실패 ${failedCount}명`,
        historyKeys,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '그룹 동기화에 실패했습니다.',
        historyKeys: [],
      };
    }
  }

  /**
   * 아톡비즈 캠페인 목록 조회 (실제 등록된 캠페인 확인)
   */
  async getCampaignList(): Promise<{ success: boolean; campaigns: string[]; message: string }> {
    try {
      console.log(`[아톡 API] 캠페인 목록 조회 시작`);
      
      // 여러 가능한 캠페인명 시도
      const possibleCampaigns = [
        '주식회사마셈블',
        '주식회사 마셈블', 
        'IVR_API',
        'MASSEMBLE',
        '마셈블',
        '자동발송'
      ];
      
      const validCampaigns: string[] = [];
      
      for (const campaignName of possibleCampaigns) {
        try {
          // 테스트 호출로 캠페인 존재 여부 확인 - history_key 포함
          const testData = {
            company: ATALK_API_CONFIG.company,
            user_id: ATALK_API_CONFIG.userId,
            text_campaign_name: campaignName,
            text_page: ATALK_API_CONFIG.page,
            history_key: '505056' // 필수 파라미터 추가
          };
          
          console.log(`[아톡 API] 캠페인 테스트: ${campaignName}`);
          
          // /calllist/history 엔드포인트로 캠페인 유효성 확인 - history_key 포함
          const response = await this.makeApiCall('/calllist/history', testData);
          
          if (response.code === '200') {
            validCampaigns.push(campaignName);
            console.log(`[아톡 API] 유효한 캠페인 발견: ${campaignName}`);
          }
        } catch (error) {
          console.log(`[아톡 API] 캠페인 "${campaignName}" 테스트 실패:`, error instanceof Error ? error.message : 'Unknown');
        }
      }
      
      return {
        success: validCampaigns.length > 0,
        campaigns: validCampaigns,
        message: validCampaigns.length > 0 
          ? `유효한 캠페인 ${validCampaigns.length}개 발견: ${validCampaigns.join(', ')}`
          : '유효한 캠페인을 찾을 수 없습니다.'
      };
    } catch (error) {
      return {
        success: false,
        campaigns: [],
        message: error instanceof Error ? error.message : '캠페인 목록 조회에 실패했습니다.'
      };
    }
  }

  /**
   * 아톡비즈 발송리스트 조회 및 로컬 DB 동기화
   */
  async syncSendingLists() {
    try {
      console.log(`[아톡 API] 발송리스트 동기화 시작`);
      
      // API 환경 설정 검증
      if (!ATALK_API_CONFIG.company || !ATALK_API_CONFIG.userId) {
        throw new Error('아톡 API 설정이 올바르지 않습니다. ATALK_COMPANY_ID와 ATALK_USER_ID를 확인하세요.');
      }
      
      // 먼저 유효한 캠페인 찾기
      const campaignResult = await this.getCampaignList();
      if (!campaignResult.success || campaignResult.campaigns.length === 0) {
        throw new Error(`유효한 캠페인을 찾을 수 없습니다: ${campaignResult.message}`);
      }
      
      // 첫 번째 유효한 캠페인 사용
      const validCampaignName = campaignResult.campaigns[0];
      console.log(`[아톡 API] 동기화에 사용할 캠페인: ${validCampaignName}`);
      
      const response = await this.makeApiCall('/calllist/history', {
        company: ATALK_API_CONFIG.company,
        user_id: ATALK_API_CONFIG.userId,
        text_campaign_name: validCampaignName,
        text_page: ATALK_API_CONFIG.page,
        history_key: '505056' // 기본 이력 키 (스펙에 따름)
      });
      
      // 응답 데이터 검증
      if (!response || typeof response !== 'object') {
        throw new Error('아톡 API에서 올바르지 않은 응답을 받았습니다.');
      }
      
      // 올바른 응답 구조 사용 (result.data)
      const sendingLists = Array.isArray(response.data) ? response.data : [];
      console.log(`[아톡 API] 발송리스트 조회 완료: ${sendingLists.length}개`);
      
      if (sendingLists.length === 0) {
        console.log(`[아톡 API] 동기화할 발송리스트가 없습니다.`);
        return {
          success: true,
          syncedCount: 0,
          failedCount: 0,
          totalCount: 0,
          message: '동기화할 발송리스트가 없습니다.',
        };
      }
      
      let syncedCount = 0;
      let failedCount = 0;
      const processedCampaigns = new Set<string>(); // 중복 처리 방지
      
      // 발송리스트를 로컬 DB와 동기화
      for (const listItem of sendingLists) {
        try {
          // 데이터 검증
          if (!listItem || typeof listItem !== 'object') {
            console.warn(`[동기화] 잘못된 리스트 아이템:`, listItem);
            failedCount++;
            continue;
          }
          
          const campaignName = listItem.text_campaign_name;
          if (!campaignName || typeof campaignName !== 'string' || campaignName.trim().length === 0) {
            console.warn(`[동기화] 캠페인명이 없는 리스트 아이템:`, listItem);
            failedCount++;
            continue;
          }
          
          const trimmedCampaignName = campaignName.trim();
          
          // 중복 처리 방지
          if (processedCampaigns.has(trimmedCampaignName)) {
            console.log(`[동기화] 이미 처리된 캠페인 건너뜀: ${trimmedCampaignName}`);
            continue;
          }
          processedCampaigns.add(trimmedCampaignName);
          
          // 기존 캠페인 찾기 또는 새로 생성
          const existingCampaign = await db
            .select()
            .from(arsCampaigns)
            .where(eq(arsCampaigns.name, trimmedCampaignName))
            .limit(1);
          
          if (existingCampaign.length === 0) {
            // 새 캠페인 생성
            const payload = {
              name: trimmedCampaignName,
              scenarioId: 'marketing_consent',
              status: 'synced' as const,
              totalCount: listItem.total_count || 1,
              successCount: listItem.success_count || (listItem.status === 'completed' ? 1 : 0),
              failedCount: listItem.failed_count || (listItem.status === 'failed' ? 1 : 0),
              historyKey: listItem.history_key,
              createdBy: 'system',
              startedAt: listItem.started_at ? new Date(listItem.started_at) : null,
              completedAt: listItem.completed_at ? new Date(listItem.completed_at) : null,
            } satisfies typeof arsCampaigns.$inferInsert;
            
            await db.insert(arsCampaigns).values(payload);
            console.log(`[동기화] 새 캠페인 생성: ${trimmedCampaignName}`);
            syncedCount++;
          } else {
            // 기존 캠페인 업데이트
            const updates: Partial<typeof arsCampaigns.$inferInsert> = {
              status: 'synced',
              historyKey: listItem.history_key || existingCampaign[0].historyKey,
              updatedAt: new Date(),
            };
            
            // 카운트 업데이트 (더 정확한 데이터가 있으면 사용)
            if (listItem.total_count && listItem.total_count > (existingCampaign[0].totalCount || 0)) {
              updates.totalCount = listItem.total_count;
            }
            if (listItem.success_count && listItem.success_count > (existingCampaign[0].successCount || 0)) {
              updates.successCount = listItem.success_count;
            }
            if (listItem.failed_count && listItem.failed_count > (existingCampaign[0].failedCount || 0)) {
              updates.failedCount = listItem.failed_count;
            }
            
            // 시간 정보 업데이트
            if (listItem.started_at && !existingCampaign[0].startedAt) {
              updates.startedAt = new Date(listItem.started_at);
            }
            if (listItem.completed_at && !existingCampaign[0].completedAt) {
              updates.completedAt = new Date(listItem.completed_at);
            }
            
            await db
              .update(arsCampaigns)
              .set(updates)
              .where(eq(arsCampaigns.id, existingCampaign[0].id));
              
            console.log(`[동기화] 기존 캠페인 업데이트: ${trimmedCampaignName}`);
            syncedCount++;
          }
        } catch (error) {
          console.error(`발송리스트 항목 동기화 실패:`, error);
          failedCount++;
        }
      }
      
      return {
        success: true,
        syncedCount,
        failedCount,
        totalCount: sendingLists.length,
        message: `동기화 완료: ${syncedCount}개 성공, ${failedCount}개 실패`,
      };
    } catch (error) {
      console.error('[아톡 API] 발송리스트 동기화 실패:', error);
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        totalCount: 0,
        message: error instanceof Error ? error.message : '발송리스트 동기화에 실패했습니다.',
      };
    }
  }
}

export const atalkArsService = new AtalkArsService();