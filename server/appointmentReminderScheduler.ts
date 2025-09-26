/**
 * 예약 리마인드 자동 발송 스케줄러
 * 매분마다 실행되어 10분 후에 시작하는 예약들에 대해 SMS 알림을 발송합니다.
 */

import cron from 'node-cron';
import { storage } from './storage';
import { solapiSmsService } from './solapiService';
import { secureLog, LogLevel, generateRequestId } from './securityUtils';

class AppointmentReminderScheduler {
  private isRunning = false;
  private lastProcessedTime: Date | null = null;

  constructor() {
    // 매분마다 실행 (0초에 실행)
    cron.schedule('0 * * * * *', () => {
      this.processReminders();
    });
    
    console.log('📅 예약 리마인드 스케줄러가 시작되었습니다.');
  }

  private async processReminders() {
    // 중복 실행 방지
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const requestId = generateRequestId();
    
    try {
      const now = new Date();
      
      secureLog(LogLevel.INFO, 'APPOINTMENT_REMINDER', '예약 리마인드 스케줄러 실행', {
        currentTime: now.toISOString(),
        lastProcessedTime: this.lastProcessedTime?.toISOString()
      }, requestId);

      // 10분 후에 시작하는 예약들 조회
      const reminders = await storage.getAppointmentReminders(10);
      
      if (reminders.length === 0) {
        secureLog(LogLevel.DEBUG, 'APPOINTMENT_REMINDER', '리마인드 발송 대상 예약 없음', {
          reminderCount: 0
        }, requestId);
        return;
      }

      secureLog(LogLevel.INFO, 'APPOINTMENT_REMINDER', '리마인드 발송 대상 예약 발견', {
        reminderCount: reminders.length,
        appointmentIds: reminders.map(r => r.id)
      }, requestId);

      let successCount = 0;
      let failureCount = 0;

      for (const appointment of reminders) {
        try {
          // 이미 SMS를 발송한 예약인지 확인
          const timeDiff = Math.abs(appointment.startAt.getTime() - now.getTime());
          const minutesDiff = Math.floor(timeDiff / (1000 * 60));
          
          // 정확히 10분 전후 1분 범위에서만 발송 (중복 발송 방지)
          if (minutesDiff < 9 || minutesDiff > 11) {
            continue;
          }

          // 고객 정보와 상담사 정보 조회
          const customer = await storage.getCustomer(appointment.customerId);
          const counselor = await storage.getUser(appointment.counselorId);

          if (!customer || !counselor || !customer.phone) {
            secureLog(LogLevel.WARNING, 'APPOINTMENT_REMINDER', '리마인드 SMS 발송 실패 - 정보 부족', {
              appointmentId: appointment.id,
              hasCustomer: !!customer,
              hasCounselor: !!counselor,
              hasPhone: !!(customer?.phone)
            }, requestId);
            failureCount++;
            continue;
          }

          // SMS 데이터 준비
          const appointmentSmsData = {
            customerName: customer.name,
            customerPhone: customer.phone,
            appointmentDate: appointment.startAt.toLocaleDateString('ko-KR'),
            appointmentTime: appointment.startAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            counselorName: `${counselor.lastName || ''} ${counselor.firstName || ''}`.trim() || counselor.username,
            consultationType: appointment.location === 'visit' ? '방문상담' : 
                            appointment.location === 'video' ? '화상상담' : '전화상담'
          };

          // SMS 발송
          const result = await solapiSmsService.sendAppointmentReminderNotification(
            customer.phone,
            appointmentSmsData
          );

          if (result.success) {
            successCount++;
            secureLog(LogLevel.INFO, 'APPOINTMENT_REMINDER', '리마인드 SMS 발송 성공', {
              appointmentId: appointment.id,
              customerName: customer.name,
              customerPhone: customer.phone,
              appointmentTime: appointmentSmsData.appointmentTime
            }, requestId);
          } else {
            failureCount++;
            secureLog(LogLevel.ERROR, 'APPOINTMENT_REMINDER', '리마인드 SMS 발송 실패', {
              appointmentId: appointment.id,
              customerName: customer.name,
              error: result.message
            }, requestId);
          }

        } catch (error) {
          failureCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          secureLog(LogLevel.ERROR, 'APPOINTMENT_REMINDER', '리마인드 SMS 발송 예외', {
            appointmentId: appointment.id,
            error: errorMessage
          }, requestId);
        }
      }

      secureLog(LogLevel.INFO, 'APPOINTMENT_REMINDER', '리마인드 스케줄러 완료', {
        totalReminders: reminders.length,
        successCount,
        failureCount,
        processingTime: new Date().getTime() - now.getTime()
      }, requestId);

      this.lastProcessedTime = now;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      secureLog(LogLevel.ERROR, 'APPOINTMENT_REMINDER', '리마인드 스케줄러 실행 오류', {
        error: errorMessage
      }, requestId);
      console.error('예약 리마인드 스케줄러 오류:', error);
    } finally {
      this.isRunning = false;
    }
  }

  public stop() {
    cron.destroy();
    console.log('📅 예약 리마인드 스케줄러가 중지되었습니다.');
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      lastProcessedTime: this.lastProcessedTime
    };
  }
}

// 스케줄러 인스턴스 생성 및 내보내기
export const appointmentReminderScheduler = new AppointmentReminderScheduler();