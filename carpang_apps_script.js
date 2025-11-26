/**
 * CarPang 구글 스프레드시트 연동 스크립트
 * 마셈블 CRM 통합 버전 + Cronjob 자동 재전송
 * 
 * 설정 방법:
 * 1) setupHeaders() 함수를 한 번 실행 (헤더 자동 생성)
 * 2) setupCronTrigger() 함수를 한 번 실행 (자동 재전송 트리거 설정)
 * 3) 웹앱으로 배포 (실행: 나, 액세스: 모든 사용자)
 * 4) 배포 URL을 Replit Secrets에 저장
 * 
 * 기능:
 * - 실시간 상담 신청 접수 및 CRM 전송
 * - 매 5분마다 실패한 건 자동 재전송
 * - 최대 3회 재시도
 * 
 * CRM 필드 매핑:
 * - info1: 차량명
 * - info2: 렌트타입
 * - info3: UTM Source
 * - info4: UTM Medium
 * - info5: UTM Campaign
 * - info6: UTM Term
 * - info7: UTM Content
 */

// ===== 설정 =====
const SHEET_NAME = '시트1';
const CRM_API_URL = 'https://massemble-crm-shinsehoona.replit.app/api/survey/import';
const CRM_API_KEY = 'crm_jJvVjcB2IfLvJQdqNbWKKRQvQtPEmMSX';
const CRM_TIMEOUT = 8000;
const MAX_RETRY_COUNT = 3;
const CRON_INTERVAL_MINUTES = 5;

// 헤더 정의
const HEADERS = [
  '접수일시', '차량명', '이름', '연락처', '렌트타입',
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content',
  'CRM전송상태', '재시도횟수', '마셈블고객ID'
];

/**
 * 초기 설정: 헤더 자동 생성
 */
function setupHeaders() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`시트를 찾을 수 없습니다: ${SHEET_NAME}`);
    }
    
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setFontWeight('bold')
               .setBackground('#FF6B35')
               .setFontColor('#FFFFFF');
    
    sheet.autoResizeColumns(1, HEADERS.length);
    
    Logger.log('✅ 헤더 설정 완료');
    return '헤더 설정 완료';
  } catch (error) {
    Logger.log('❌ 헤더 설정 오류: ' + error);
    throw error;
  }
}

/**
 * Cronjob 트리거 설정
 */
function setupCronTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'cronRetryFailedCRM') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    ScriptApp.newTrigger('cronRetryFailedCRM')
      .timeBased()
      .everyMinutes(CRON_INTERVAL_MINUTES)
      .create();
    
    Logger.log(`✅ Cronjob 트리거 설정 완료 (${CRON_INTERVAL_MINUTES}분마다 실행)`);
    return `Cronjob 설정 완료: ${CRON_INTERVAL_MINUTES}분마다 실행`;
  } catch (error) {
    Logger.log('❌ 트리거 설정 오류: ' + error);
    throw error;
  }
}

/**
 * Cronjob 트리거 삭제
 */
function removeCronTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let deleted = 0;
    
    triggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'cronRetryFailedCRM') {
        ScriptApp.deleteTrigger(trigger);
        deleted++;
      }
    });
    
    Logger.log(`✅ Cronjob 트리거 삭제 완료 (${deleted}개)`);
    return `트리거 삭제 완료: ${deleted}개`;
  } catch (error) {
    Logger.log('❌ 트리거 삭제 오류: ' + error);
    throw error;
  }
}

/**
 * 전화번호 정규화
 */
function normalizePhone(phone) {
  if (!phone) return '';
  
  let phoneStr = String(phone).trim().replace(/[^0-9+]/g, '');
  
  if (phoneStr.startsWith('+82')) {
    phoneStr = '0' + phoneStr.substring(3);
  } else if (phoneStr.startsWith('82') && phoneStr.length > 10) {
    phoneStr = '0' + phoneStr.substring(2);
  }
  
  phoneStr = phoneStr.replace(/\D/g, '');
  
  if (phoneStr.length === 10 && phoneStr.startsWith('10')) {
    phoneStr = '0' + phoneStr;
  }
  
  if (phoneStr.length === 11 && phoneStr.startsWith('010')) {
    return phoneStr.substring(0, 3) + '-' + phoneStr.substring(3, 7) + '-' + phoneStr.substring(7);
  } else if (phoneStr.length === 10) {
    return phoneStr.substring(0, 3) + '-' + phoneStr.substring(3, 6) + '-' + phoneStr.substring(6);
  }
  
  return phoneStr;
}

/**
 * CRM 전송 함수 (수정됨 - info1~info7 필드 사용)
 */
function sendToCRM(data) {
  try {
    Logger.log('📤 CRM 전송 데이터 준비: ' + JSON.stringify(data));
    
    // CRM API가 기대하는 형식으로 변환
    const crmPayload = {
      name: data.name || '미입력',
      phone: normalizePhone(data.phone),
      consultType: '차량상담',
      consultPath: '카팡',
      source: 'carpang_sheet',
      marketingConsent: false,
      
      // 차량 정보를 info 필드에 매핑
      info1: data.carName || '',           // 차량명
      info2: data.rentalType || '',        // 렌트타입 (장기렌트/리스)
      info3: data.utm_source || '',        // UTM Source
      info4: data.utm_medium || '',        // UTM Medium
      info5: data.utm_campaign || '',      // UTM Campaign
      info6: data.utm_term || '',          // UTM Term
      info7: data.utm_content || '',       // UTM Content
      
      // 메모에도 정보 저장 (가독성)
      memo1: `차량: ${data.carName || '-'} | 타입: ${data.rentalType || '-'} | UTM: ${data.utm_source || '-'}/${data.utm_medium || '-'}/${data.utm_campaign || '-'}`
    };
    
    Logger.log('📦 CRM 전송 페이로드: ' + JSON.stringify(crmPayload, null, 2));
    
    const response = UrlFetchApp.fetch(CRM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CRM_API_KEY
      },
      payload: JSON.stringify(crmPayload),
      muteHttpExceptions: true,
      timeout: CRM_TIMEOUT
    });
    
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`📥 CRM 응답 (${statusCode}): ${responseText}`);
    
    if (statusCode === 200) {
      try {
        const result = JSON.parse(responseText);
        if (result.success) {
          return { 
            success: true, 
            customerId: result.customerId,
            message: result.message 
          };
        } else {
          return { 
            success: false, 
            error: result.message || 'API 응답 실패' 
          };
        }
      } catch (parseError) {
        return { 
          success: false, 
          error: 'JSON 파싱 오류: ' + parseError.message 
        };
      }
    } else {
      return { 
        success: false, 
        error: `HTTP ${statusCode}: ${responseText.substring(0, 100)}` 
      };
    }
    
  } catch (error) {
    Logger.log('❌ CRM 전송 오류: ' + error);
    return { 
      success: false, 
      error: error.toString() 
    };
  }
}

/**
 * Cronjob: 실패한 CRM 전송 재시도
 */
function cronRetryFailedCRM() {
  const startTime = new Date();
  Logger.log('🔄 [CRON] CRM 재전송 작업 시작: ' + startTime.toISOString());
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log(`❌ [CRON] 시트를 찾을 수 없음: ${SHEET_NAME}`);
      return;
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      Logger.log('ℹ️ [CRON] 처리할 데이터 없음');
      return;
    }
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, HEADERS.length);
    const data = dataRange.getValues();
    
    let retryCount = 0;
    let successCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < data.length; i++) {
      const rowNumber = i + 2;
      const crmStatus = String(data[i][10] || '');
      const retryCountValue = parseInt(data[i][11] || 0);
      
      if (crmStatus.includes('pending') || crmStatus.includes('failed') || crmStatus.includes('error')) {
        
        if (retryCountValue >= MAX_RETRY_COUNT) {
          Logger.log(`⏭️ [CRON] 행 ${rowNumber}: 최대 재시도 횟수 초과 (${retryCountValue}회)`);
          skipCount++;
          continue;
        }
        
        Logger.log(`🔄 [CRON] 행 ${rowNumber}: CRM 재전송 시도 (${retryCountValue + 1}/${MAX_RETRY_COUNT})`);
        retryCount++;
        
        // 데이터 추출 (컬럼 인덱스: 0-based)
        const carName = data[i][1] || '';
        const name = data[i][2] || '';
        const phone = data[i][3] || '';
        const rentalType = data[i][4] || '';
        const utmSource = data[i][5] || '';
        const utmMedium = data[i][6] || '';
        const utmCampaign = data[i][7] || '';
        const utmTerm = data[i][8] || '';
        const utmContent = data[i][9] || '';
        
        const crmResult = sendToCRM({
          name: name,
          phone: phone,
          carName: carName,
          rentalType: rentalType,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_term: utmTerm,
          utm_content: utmContent
        });
        
        if (crmResult.success) {
          sheet.getRange(rowNumber, 11).setValue('success');
          sheet.getRange(rowNumber, 12).setValue(retryCountValue + 1);
          if (crmResult.customerId) {
            sheet.getRange(rowNumber, 13).setValue(crmResult.customerId);
          }
          successCount++;
          Logger.log(`✅ [CRON] 행 ${rowNumber}: 재전송 성공 (고객ID: ${crmResult.customerId})`);
        } else {
          const errorMsg = (crmResult.error || 'Unknown error').substring(0, 50);
          sheet.getRange(rowNumber, 11).setValue(`failed: ${errorMsg}`);
          sheet.getRange(rowNumber, 12).setValue(retryCountValue + 1);
          Logger.log(`❌ [CRON] 행 ${rowNumber}: 재전송 실패 - ${crmResult.error}`);
        }
        
        Utilities.sleep(500);
      }
    }
    
    const endTime = new Date();
    const processingTime = endTime - startTime;
    
    Logger.log('=== [CRON] 재전송 작업 완료 ===');
    Logger.log(`처리 시간: ${processingTime}ms`);
    Logger.log(`재시도 건수: ${retryCount}개`);
    Logger.log(`성공 건수: ${successCount}개`);
    Logger.log(`실패 건수: ${retryCount - successCount}개`);
    Logger.log(`스킵 건수: ${skipCount}개 (최대 재시도 초과)`);
    
  } catch (error) {
    Logger.log('❌ [CRON] 오류 발생: ' + error);
    Logger.log('스택 트레이스: ' + error.stack);
  }
}

/**
 * POST 요청 처리 (상담 신청 접수)
 */
function doPost(e) {
  const startTime = new Date();
  Logger.log('🔥 doPost 호출 시작: ' + startTime.toISOString());
  
  try {
    if (!e || !e.postData || !e.postData.contents) {
      Logger.log('❌ 요청 데이터 없음');
      return createResponse(false, '요청 데이터가 없습니다.');
    }
    
    let data;
    try {
      data = JSON.parse(e.postData.contents);
      Logger.log('📦 받은 데이터: ' + JSON.stringify(data));
    } catch (parseError) {
      Logger.log('❌ JSON 파싱 오류: ' + parseError);
      return createResponse(false, 'JSON 파싱 오류: ' + parseError.message);
    }
    
    if (!data.name || !data.phone) {
      Logger.log('❌ 필수 필드 누락');
      return createResponse(false, '필수 항목(이름, 연락처)이 누락되었습니다.');
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log(`❌ 시트를 찾을 수 없음: ${SHEET_NAME}`);
      return createResponse(false, `시트를 찾을 수 없습니다: ${SHEET_NAME}`);
    }
    
    const timestamp = new Date();
    const carName = data.carName || '';
    const name = data.name || '';
    const phone = data.phone || '';
    const rentalType = data.rentalType === 'longterm' ? '장기렌트' : (data.rentalType === 'lease' ? '리스' : data.rentalType || '');
    const utmSource = data.utm_source || '(직접 유입)';
    const utmMedium = data.utm_medium || '';
    const utmCampaign = data.utm_campaign || '';
    const utmTerm = data.utm_term || '';
    const utmContent = data.utm_content || '';
    
    Logger.log('📝 스프레드시트에 데이터 저장 시작');
    
    const newRow = [
      timestamp, carName, name, phone, rentalType,
      utmSource, utmMedium, utmCampaign, utmTerm, utmContent,
      'pending', 0, ''
    ];
    
    sheet.appendRow(newRow);
    const rowNumber = sheet.getLastRow();
    
    sheet.getRange(rowNumber, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    
    Logger.log(`✅ 행 ${rowNumber}에 데이터 저장 완료`);
    
    // CRM 전송 시도
    let crmStatus = 'pending';
    let crmErrorMsg = '';
    let customerId = '';
    
    try {
      Logger.log('📤 CRM 전송 시작');
      
      const crmResult = sendToCRM({
        name: name,
        phone: phone,
        carName: carName,
        rentalType: rentalType,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_term: utmTerm,
        utm_content: utmContent
      });
      
      Logger.log('📨 CRM 응답: ' + JSON.stringify(crmResult));
      
      if (crmResult.success) {
        sheet.getRange(rowNumber, 11).setValue('success');
        sheet.getRange(rowNumber, 12).setValue(1);
        if (crmResult.customerId) {
          sheet.getRange(rowNumber, 13).setValue(crmResult.customerId);
          customerId = crmResult.customerId;
        }
        crmStatus = 'success';
        Logger.log('✅ CRM 전송 성공');
      } else {
        const errorMsg = crmResult.error || 'Unknown error';
        sheet.getRange(rowNumber, 11).setValue('failed: ' + errorMsg.substring(0, 50));
        sheet.getRange(rowNumber, 12).setValue(1);
        crmStatus = 'failed';
        crmErrorMsg = errorMsg;
        Logger.log('⚠️ CRM 전송 실패 (Cronjob이 자동으로 재시도합니다): ' + errorMsg);
      }
    } catch (crmError) {
      const errorMsg = crmError.toString();
      sheet.getRange(rowNumber, 11).setValue('error: ' + errorMsg.substring(0, 50));
      sheet.getRange(rowNumber, 12).setValue(1);
      crmStatus = 'error';
      crmErrorMsg = errorMsg;
      Logger.log('❌ CRM 전송 오류 (Cronjob이 자동으로 재시도합니다): ' + errorMsg);
    }
    
    const endTime = new Date();
    const processingTime = endTime - startTime;
    Logger.log(`✅ doPost 완료 (처리 시간: ${processingTime}ms)`);
    
    return createResponse(true, '저장 완료', {
      row: rowNumber,
      timestamp: timestamp.toISOString(),
      crmStatus: crmStatus,
      crmError: crmErrorMsg,
      customerId: customerId,
      processingTime: processingTime,
      autoRetry: crmStatus !== 'success' ? 'Cronjob이 자동으로 재시도합니다' : null
    });
    
  } catch (error) {
    Logger.log('❌ doPost 오류: ' + error);
    Logger.log('스택 트레이스: ' + error.stack);
    return createResponse(false, '서버 오류: ' + error.message);
  }
}

/**
 * GET 요청 처리 (상태 확인)
 */
function doGet(e) {
  try {
    Logger.log('🔍 doGet 호출');
    
    const triggers = ScriptApp.getProjectTriggers();
    const cronTrigger = triggers.find(t => t.getHandlerFunction() === 'cronRetryFailedCRM');
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    let stats = {
      totalRows: 0,
      successCount: 0,
      failedCount: 0,
      pendingCount: 0
    };
    
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const statusColumn = sheet.getRange(2, 11, lastRow - 1, 1).getValues();
        stats.totalRows = statusColumn.length;
        
        statusColumn.forEach(function(row) {
          const status = String(row[0] || '').toLowerCase();
          if (status.includes('success')) {
            stats.successCount++;
          } else if (status.includes('failed') || status.includes('error')) {
            stats.failedCount++;
          } else if (status.includes('pending') || status === '') {
            stats.pendingCount++;
          }
        });
      }
    }
    
    return createResponse(true, 'CarPang CRM 연동 상태', {
      status: 'active',
      cronEnabled: !!cronTrigger,
      cronInterval: CRON_INTERVAL_MINUTES + '분',
      maxRetryCount: MAX_RETRY_COUNT,
      stats: stats,
      fieldMapping: {
        info1: '차량명',
        info2: '렌트타입',
        info3: 'UTM Source',
        info4: 'UTM Medium',
        info5: 'UTM Campaign',
        info6: 'UTM Term',
        info7: 'UTM Content'
      },
      lastCheck: new Date().toISOString()
    });
    
  } catch (error) {
    Logger.log('❌ doGet 오류: ' + error);
    return createResponse(false, '상태 확인 오류: ' + error.message);
  }
}

/**
 * 응답 생성 헬퍼
 */
function createResponse(success, message, data) {
  const response = {
    success: success,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  if (data) {
    response.data = data;
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 테스트: 단일 행 CRM 전송
 */
function testSingleRowCRM(rowNumber) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log(`❌ 시트를 찾을 수 없음: ${SHEET_NAME}`);
      return;
    }
    
    const row = rowNumber || 2;
    const lastCol = HEADERS.length;
    const data = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
    
    Logger.log('📋 테스트 행 데이터:');
    HEADERS.forEach((header, index) => {
      Logger.log(`  ${header}: ${data[index]}`);
    });
    
    const crmResult = sendToCRM({
      name: data[2] || '',
      phone: data[3] || '',
      carName: data[1] || '',
      rentalType: data[4] || '',
      utm_source: data[5] || '',
      utm_medium: data[6] || '',
      utm_campaign: data[7] || '',
      utm_term: data[8] || '',
      utm_content: data[9] || ''
    });
    
    Logger.log('📊 CRM 전송 결과: ' + JSON.stringify(crmResult, null, 2));
    
    if (crmResult.success) {
      sheet.getRange(row, 11).setValue('success');
      if (crmResult.customerId) {
        sheet.getRange(row, 13).setValue(crmResult.customerId);
      }
    }
    
    return crmResult;
    
  } catch (error) {
    Logger.log('❌ 테스트 오류: ' + error);
    throw error;
  }
}

/**
 * 테스트: 수동 재전송 실행
 */
function testManualRetry() {
  Logger.log('🧪 수동 재전송 테스트 시작');
  cronRetryFailedCRM();
  Logger.log('🧪 수동 재전송 테스트 완료');
}
