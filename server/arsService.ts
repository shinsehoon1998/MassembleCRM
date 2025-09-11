import crypto from 'crypto';
import { db } from './db';
import { arsCampaigns, arsSendLogs, arsApiLogs, customers } from '@shared/schema';
import type { InsertArsCampaign, InsertArsSendLog } from '@shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';

// 아톡비즈 API 설정 (환경변수에서 로드)
const ATALK_API_CONFIG = {
  baseUrl: 'http://101.202.45.50:8080/thirdparty/v1',
  token: process.env.ATALK_API_KEY || '',
  company: process.env.ATALK_SECRET_KEY || '',
  userId: process.env.ATALK_SENDER_NUMBER || '',
  campaignName: '주식회사마셈블',
  defaultSendNumber: '16602426', // 고정 발신번호 (하이픈 제거)
};

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
  private async makeApiCall<T = AtalkApiResponse>(
    endpoint: string,
    data: any,
    method: 'POST' = 'POST'
  ): Promise<T> {
    const url = `${ATALK_API_CONFIG.baseUrl}${endpoint}`;
    
    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ATALK_API_CONFIG.token}`,
      },
      body: JSON.stringify(data),
    };

    try {
      const response = await fetch(url, requestOptions);
      const result = await response.json();

      // API 호출 로그 저장
      await this.logApiCall(endpoint, method, data, result, response.status);

      if (result.code !== '200') {
        throw new Error(`API 오류: ${result.result || 'Unknown error'}`);
      }

      return result as T;
    } catch (error) {
      // 에러 로그 저장
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.logApiCall(endpoint, method, data, { error: errorMessage }, 500);
      throw error;
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
   * 단일 고객에게 ARS 발송
   */
  async sendSingleArs(
    customerId: string,
    sendNumber: string,
    scenarioId: string = 'marketing_consent'
  ): Promise<{ success: boolean; historyKey?: string; message: string }> {
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

      // ARS 호출 요청 데이터
      const callData: CallRequest = {
        text_send_no: ATALK_API_CONFIG.defaultSendNumber, // 고정 발신번호 사용
        company: ATALK_API_CONFIG.company,
        user_id: ATALK_API_CONFIG.userId,
        text_campaign_name: ATALK_API_CONFIG.campaignName,
        text_page: formattedPhone,
      };

      const response = await this.makeApiCall('/calllist/add', callData);

      // 발송 로그 저장
      await db.insert(arsSendLogs).values({
        customerId,
        phone: formattedPhone,
        scenarioId,
        historyKey: response.history_key,
        status: 'sent',
        sentAt: new Date(),
      });

      return {
        success: true,
        historyKey: response.history_key,
        message: 'ARS 발송이 완료되었습니다.',
      };
    } catch (error) {
      // 실패 로그 저장
      await db.insert(arsSendLogs).values({
        customerId,
        phone: '',
        scenarioId,
        status: 'failed',
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

    // 각 고객에게 개별 발송
    for (const customer of customerList) {
      try {
        if (!customer.phone) {
          failedCount++;
          continue;
        }

        const formattedPhone = customer.phone.replace(/[^0-9]/g, '');

        const callData: CallRequest = {
          text_send_no: ATALK_API_CONFIG.defaultSendNumber, // 고정 발신번호 사용
          company: ATALK_API_CONFIG.company,
          user_id: ATALK_API_CONFIG.userId,
          text_campaign_name: ATALK_API_CONFIG.campaignName,
          text_page: formattedPhone,
        };

        const response = await this.makeApiCall('/calllist/add', callData);

        // 성공 로그 저장
        await db.insert(arsSendLogs).values({
          campaignId: campaign.id,
          customerId: customer.id,
          phone: formattedPhone,
          scenarioId,
          historyKey: response.history_key,
          status: 'sent',
          sentAt: new Date(),
        });

        if (response.history_key) {
          historyKeys.push(response.history_key);
        }

        // API 호출 간격 (과부하 방지)
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failedCount++;
        
        // 실패 로그 저장
        await db.insert(arsSendLogs).values({
          campaignId: campaign.id,
          customerId: customer.id,
          phone: customer.phone || '',
          scenarioId,
          status: 'failed',
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

          // 로그 업데이트
          await db.update(arsSendLogs)
            .set({
              status: status as any,
              dtmfInput,
              duration,
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
}

export const atalkArsService = new AtalkArsService();