/**
 * 차량 상담 구글 스프레드시트 연동 스크립트
 * 마셈블 CRM (https://massemble-crm-shinsehoona.replit.app) 통합
 * 
 * 설정:
 * 1) 이 스크립트를 Google Apps Script 에디터에 복사
 * 2) createCronTrigger() 1회 실행 (1분 주기 크론 생성)
 * 3) 수동 실행: syncToCRM() 실행하여 데이터 전송 테스트
 */

// ===== 설정 =====
const MASSEMBLE_CRM_URL = 'https://massemble-crm-shinsehoona.replit.app';
const MASSEMBLE_API_KEY = 'crm_dU3hRN2HQySafhf7vo14VrrH40jS9GD3'; // 차량 문의 API 키

// 컬럼 인덱스 (0부터 시작, 시트 구조에 맞게 조정)
const COLUMNS = {
  CREATED_TIME: 0,      // A: created_time
  AD_ID: 1,            // B: ad_id
  AD_NAME: 2,          // C: ad_name
  ADSET_ID: 3,         // D: adset_id
  DETAIL_NAME: 4,      // E: detail_name
  CAMPAIGN_ID: 5,      // F: campaign_id
  CAMPAIGN_NAME: 6,    // G: campaign_name_form_id
  FORM_NAME: 7,        // H: form_name
  IS_ORGANIC: 8,       // I: is_organic
  PLATFORM: 9,         // J: platform
  INQUIRY_TYPE: 10,    // K: 응원문_신청목적_직접 (info1: 유형을_선택해주세요)
  CAR_NAME: 11,        // L: (희망차종)_차_name (info2)
  PHONE_NUMBER: 12,    // M: phone_number
  LAST_STATUS: 13,     // N: last_status
  ADSET_NAME: 14,      // O: adset_name (info3) - 추가 컬럼일 수 있음
  // 추가 컬럼들...
  CRM_STATUS: null,    // CRM 전송 상태 컬럼 (나중에 추가)
  CRM_SENT_TIME: null, // CRM 전송 시간 컬럼 (나중에 추가)
  CRM_CUSTOMER_ID: null // CRM 고객 ID 컬럼 (나중에 추가)
};

// 상태 추적 컬럼 추가를 위한 함수
function ensureStatusColumns() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    // CRM 상태 컬럼이 없으면 추가
    if (!headers.includes('CRM전송상태')) {
      const statusCol = lastCol + 1;
      sheet.getRange(1, statusCol).setValue('CRM전송상태');
      COLUMNS.CRM_STATUS = statusCol - 1; // 0-based index
      Logger.log(`✅ CRM전송상태 컬럼 추가됨 (열 ${statusCol})`);
    } else {
      COLUMNS.CRM_STATUS = headers.indexOf('CRM전송상태');
    }
    
    if (!headers.includes('CRM전송시간')) {
      const timeCol = lastCol + (headers.includes('CRM전송상태') ? 1 : 2);
      sheet.getRange(1, timeCol).setValue('CRM전송시간');
      COLUMNS.CRM_SENT_TIME = timeCol - 1;
      Logger.log(`✅ CRM전송시간 컬럼 추가됨 (열 ${timeCol})`);
    } else {
      COLUMNS.CRM_SENT_TIME = headers.indexOf('CRM전송시간');
    }
    
    if (!headers.includes('마셈블고객ID')) {
      const customerCol = lastCol + (headers.includes('CRM전송상태') ? 1 : 0) + (headers.includes('CRM전송시간') ? 1 : 0) + 1;
      sheet.getRange(1, customerCol).setValue('마셈블고객ID');
      COLUMNS.CRM_CUSTOMER_ID = customerCol - 1;
      Logger.log(`✅ 마셈블고객ID 컬럼 추가됨 (열 ${customerCol})`);
    } else {
      COLUMNS.CRM_CUSTOMER_ID = headers.indexOf('마셈블고객ID');
    }
    
  } catch (error) {
    Logger.log('❌ 상태 컬럼 추가 오류: ' + error);
  }
}

/**
 * 전화번호 형식 정규화
 * +821012345678 → 010-1234-5678
 * 01012345678 → 010-1234-5678
 */
function normalizePhone(phone) {
  if (!phone) return '';
  
  let phoneStr = phone.toString().trim();
  
  // +82 국가 코드 제거
  if (phoneStr.startsWith('+82')) {
    phoneStr = '0' + phoneStr.substring(3);
  } else if (phoneStr.startsWith('82')) {
    phoneStr = '0' + phoneStr.substring(2);
  }
  
  // 숫자만 추출
  phoneStr = phoneStr.replace(/\D/g, '');
  
  // 010-1234-5678 형식으로 변환
  if (phoneStr.length === 11 && phoneStr.startsWith('010')) {
    return phoneStr.substring(0, 3) + '-' + phoneStr.substring(3, 7) + '-' + phoneStr.substring(7);
  } else if (phoneStr.length === 10) {
    return phoneStr.substring(0, 3) + '-' + phoneStr.substring(3, 6) + '-' + phoneStr.substring(6);
  }
  
  return phoneStr;
}

/**
 * 시트 데이터를 CRM으로 동기화
 */
function syncToCRM() {
  try {
    Logger.log('🚀 차량 상담 CRM 동기화 시작');
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // 상태 컬럼 확인 및 추가
    ensureStatusColumns();
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1); // 헤더 제외
    
    if (rows.length === 0) {
      Logger.log('⚠️ 전송할 데이터가 없습니다.');
      return { success: true, message: '전송할 데이터가 없습니다.', count: 0 };
    }
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2; // 헤더 행 때문에 +2
      
      // 전화번호가 없으면 스킵
      const phone = row[COLUMNS.PHONE_NUMBER];
      if (!phone) {
        Logger.log(`⏭️ Row ${rowIndex}: 전화번호 없음, 스킵`);
        skipCount++;
        continue;
      }
      
      // 이미 전송된 항목은 스킵 (CRM_STATUS 컬럼이 있고 'success'인 경우)
      if (COLUMNS.CRM_STATUS !== null && row[COLUMNS.CRM_STATUS] === 'success') {
        Logger.log(`⏭️ Row ${rowIndex}: 이미 전송됨, 스킵`);
        skipCount++;
        continue;
      }
      
      try {
        // CRM 페이로드 생성
        const payload = createCRMPayload(row);
        
        Logger.log(`📤 Row ${rowIndex} 전송 중: ${payload.name || '이름없음'} (${payload.phone})`);
        
        // CRM API 호출
        const response = UrlFetchApp.fetch(`${MASSEMBLE_CRM_URL}/api/car-inquiry/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MASSEMBLE_API_KEY}`,
            'X-API-Key': MASSEMBLE_API_KEY
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        
        const statusCode = response.getResponseCode();
        const responseText = response.getContentText();
        
        Logger.log(`📥 Row ${rowIndex} 응답 (${statusCode}): ${responseText}`);
        
        if (statusCode === 200) {
          const result = JSON.parse(responseText);
          
          if (result.success) {
            // 성공 상태 업데이트
            if (COLUMNS.CRM_STATUS !== null) {
              sheet.getRange(rowIndex, COLUMNS.CRM_STATUS + 1).setValue('success');
            }
            if (COLUMNS.CRM_SENT_TIME !== null) {
              sheet.getRange(rowIndex, COLUMNS.CRM_SENT_TIME + 1).setValue(new Date());
            }
            if (COLUMNS.CRM_CUSTOMER_ID !== null && result.customerId) {
              sheet.getRange(rowIndex, COLUMNS.CRM_CUSTOMER_ID + 1).setValue(result.customerId);
            }
            
            successCount++;
            Logger.log(`✅ Row ${rowIndex} 전송 성공`);
          } else {
            // API 오류
            if (COLUMNS.CRM_STATUS !== null) {
              sheet.getRange(rowIndex, COLUMNS.CRM_STATUS + 1).setValue('api_error');
            }
            errorCount++;
            Logger.log(`❌ Row ${rowIndex} API 오류: ${result.message}`);
          }
        } else {
          // HTTP 오류
          if (COLUMNS.CRM_STATUS !== null) {
            sheet.getRange(rowIndex, COLUMNS.CRM_STATUS + 1).setValue(`http_${statusCode}`);
          }
          errorCount++;
          Logger.log(`❌ Row ${rowIndex} HTTP 오류 (${statusCode}): ${responseText}`);
        }
        
        // API 호출 간격 (Rate Limiting 방지)
        Utilities.sleep(500);
        
      } catch (error) {
        // 전송 오류
        if (COLUMNS.CRM_STATUS !== null) {
          sheet.getRange(rowIndex, COLUMNS.CRM_STATUS + 1).setValue('error');
        }
        errorCount++;
        Logger.log(`❌ Row ${rowIndex} 전송 오류: ${error.message}`);
      }
    }
    
    const summary = `✅ 동기화 완료: 성공 ${successCount}건, 스킵 ${skipCount}건, 오류 ${errorCount}건`;
    Logger.log(summary);
    
    return {
      success: true,
      message: summary,
      successCount: successCount,
      skipCount: skipCount,
      errorCount: errorCount
    };
    
  } catch (error) {
    Logger.log('❌ CRM 동기화 오류: ' + error.message);
    return {
      success: false,
      message: 'CRM 동기화 중 오류 발생: ' + error.message,
      error: error.message
    };
  }
}

/**
 * CRM 페이로드 생성
 */
function createCRMPayload(row) {
  const phone = normalizePhone(row[COLUMNS.PHONE_NUMBER]);
  const createdTime = row[COLUMNS.CREATED_TIME];
  
  // 이름 추출 (전화번호에서 추출하거나 기본값 사용)
  const name = extractNameFromPhone(phone);
  
  // info 필드 매핑
  const info1 = row[COLUMNS.INQUIRY_TYPE] || ''; // 유형을_선택해주세요
  const info2 = row[COLUMNS.CAR_NAME] || '';     // (희망차종)_차량명을_입력해_주세요
  const info3 = row[COLUMNS.ADSET_NAME] || '';   // adset_name
  
  const payload = {
    name: name,
    phone: phone,
    consultType: '차량상담',
    consultPath: '차량문의폼',
    source: 'car_inquiry_sheet',
    marketingConsent: false,
    info1: info1,
    info2: info2,
    info3: info3,
    memo: `차량 상담 문의\n- 유형: ${info1}\n- 희망차종: ${info2}\n- 광고세트: ${info3}`,
    sheetData: {
      createdTime: createdTime ? new Date(createdTime).toISOString() : new Date().toISOString(),
      adId: row[COLUMNS.AD_ID] || '',
      adName: row[COLUMNS.AD_NAME] || '',
      adsetId: row[COLUMNS.ADSET_ID] || '',
      adsetName: row[COLUMNS.ADSET_NAME] || '',
      detailName: row[COLUMNS.DETAIL_NAME] || '',
      campaignId: row[COLUMNS.CAMPAIGN_ID] || '',
      campaignName: row[COLUMNS.CAMPAIGN_NAME] || '',
      formName: row[COLUMNS.FORM_NAME] || '',
      isOrganic: row[COLUMNS.IS_ORGANIC] || '',
      platform: row[COLUMNS.PLATFORM] || '',
      lastStatus: row[COLUMNS.LAST_STATUS] || ''
    }
  };
  
  return payload;
}

/**
 * 전화번호에서 이름 추출 (기본값 사용)
 */
function extractNameFromPhone(phone) {
  if (!phone) return '차량문의고객';
  
  // 전화번호 마지막 4자리 사용
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `차량문의${digits.slice(-4)}`;
  }
  
  return '차량문의고객';
}

/**
 * 1분마다 자동 실행되는 크론 트리거 생성
 */
function createCronTrigger() {
  try {
    // 기존 트리거 삭제
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'syncToCRM') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // 1분마다 실행되는 트리거 생성
    ScriptApp.newTrigger('syncToCRM')
      .timeBased()
      .everyMinutes(1)
      .create();
    
    Logger.log('✅ 크론 트리거 생성 완료 (1분 주기)');
    return '크론 트리거 생성 완료';
  } catch (error) {
    Logger.log('❌ 크론 트리거 생성 오류: ' + error);
    throw error;
  }
}

/**
 * 크론 트리거 삭제
 */
function deleteCronTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let count = 0;
    
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'syncToCRM') {
        ScriptApp.deleteTrigger(trigger);
        count++;
      }
    });
    
    Logger.log(`✅ 크론 트리거 ${count}개 삭제 완료`);
    return `크론 트리거 ${count}개 삭제 완료`;
  } catch (error) {
    Logger.log('❌ 크론 트리거 삭제 오류: ' + error);
    throw error;
  }
}

/**
 * 현재 트리거 상태 확인
 */
function checkTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const crmTriggers = triggers.filter(t => t.getHandlerFunction() === 'syncToCRM');
  
  Logger.log(`📊 총 트리거 개수: ${triggers.length}`);
  Logger.log(`📊 CRM 동기화 트리거 개수: ${crmTriggers.length}`);
  
  crmTriggers.forEach((trigger, index) => {
    Logger.log(`  ${index + 1}. ${trigger.getHandlerFunction()} - ${trigger.getTriggerSource()}`);
  });
  
  return {
    total: triggers.length,
    crmTriggers: crmTriggers.length
  };
}

/**
 * 테스트: 단일 행 전송
 */
function testSingleRow() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    ensureStatusColumns();
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const firstRow = data[1]; // 첫 번째 데이터 행
    
    if (!firstRow) {
      Logger.log('❌ 테스트할 데이터가 없습니다.');
      return;
    }
    
    const payload = createCRMPayload(firstRow);
    Logger.log('📦 테스트 페이로드:');
    Logger.log(JSON.stringify(payload, null, 2));
    
    Logger.log('\n전화번호 정규화 테스트:');
    Logger.log(`원본: ${firstRow[COLUMNS.PHONE_NUMBER]}`);
    Logger.log(`정규화: ${normalizePhone(firstRow[COLUMNS.PHONE_NUMBER])}`);
    
    return payload;
  } catch (error) {
    Logger.log('❌ 테스트 오류: ' + error);
    throw error;
  }
}
