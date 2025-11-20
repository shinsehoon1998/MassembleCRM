/**
 * 페이스북 리드폼 → 마셈블 CRM 자동 연동 스크립트
 * CRM: https://massemble-crm-shinsehoona.replit.app
 * 
 * 구조: 페이스북 잠재고객 인스턴트 양식 → 구글 시트 → 마셈블 CRM
 * 
 * 설정 방법:
 * 1) createCronTrigger() 함수 1회 실행 (1분 주기 CRM 자동 전송)
 * 2) 테스트: testSingleRow(2) 또는 testManualSync() 실행
 */

// ===== 설정 =====
const CRM_API_URL = 'https://massemble-crm-shinsehoona.replit.app/api/car-inquiry/import';
const CRM_API_KEY = 'crm_dU3hRN2HQySafhf7vo14VrrH40jS9GD3';
const SHEET_NAME = '시트1';

/**
 * 시트 헤더를 읽어서 컬럼 인덱스 맵 생성
 * 페이스북 리드폼에서 자동 생성되는 컬럼명을 동적으로 매핑
 */
function getColumnMapping(sheet) {
  try {
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    const mapping = {};
    headers.forEach((header, index) => {
      const headerName = String(header).trim();
      mapping[headerName] = index;
    });
    
    Logger.log('📊 컬럼 매핑: ' + JSON.stringify(Object.keys(mapping)));
    return { mapping, headers };
    
  } catch (error) {
    Logger.log('❌ 컬럼 매핑 오류: ' + error);
    throw error;
  }
}

/**
 * CRM 전송 상태 컬럼 확인 및 생성
 */
function ensureCRMStatusColumns(sheet, currentHeaders) {
  try {
    const statusColumns = ['CRM전송상태', 'CRM전송시간', '마셈블고객ID'];
    const lastCol = sheet.getLastColumn();
    let addedCount = 0;
    
    statusColumns.forEach((colName, index) => {
      if (!currentHeaders.includes(colName)) {
        const newCol = lastCol + addedCount + 1;
        sheet.getRange(1, newCol).setValue(colName);
        sheet.getRange(1, newCol).setFontWeight('bold').setBackground('#FF9900').setFontColor('#FFFFFF');
        addedCount++;
        Logger.log(`✅ ${colName} 컬럼 추가됨 (열 ${newCol})`);
      }
    });
    
    if (addedCount > 0) {
      sheet.autoResizeColumns(lastCol + 1, addedCount);
      return true;
    }
    return false;
  } catch (error) {
    Logger.log('❌ 상태 컬럼 추가 오류: ' + error);
    return false;
  }
}

/**
 * 전화번호 정규화
 * +821012345678 → 010-1234-5678
 * 821012345678 → 010-1234-5678
 * 01012345678 → 010-1234-5678
 * 1012345678 → 010-1234-5678
 */
function normalizePhone(phone) {
  if (!phone) return '';
  
  let phoneStr = String(phone).trim().replace(/[^0-9+]/g, '');
  
  // +82 국가 코드 제거
  if (phoneStr.startsWith('+82')) {
    phoneStr = '0' + phoneStr.substring(3);
  } else if (phoneStr.startsWith('82') && phoneStr.length > 10) {
    phoneStr = '0' + phoneStr.substring(2);
  }
  
  // 숫자만 추출
  phoneStr = phoneStr.replace(/\D/g, '');
  
  // 010으로 시작하지 않는 10자리 → 010 추가
  if (phoneStr.length === 10 && phoneStr.startsWith('10')) {
    phoneStr = '0' + phoneStr;
  }
  
  // 010-1234-5678 형식으로 변환
  if (phoneStr.length === 11 && phoneStr.startsWith('010')) {
    return phoneStr.substring(0, 3) + '-' + phoneStr.substring(3, 7) + '-' + phoneStr.substring(7);
  } else if (phoneStr.length === 10) {
    return phoneStr.substring(0, 3) + '-' + phoneStr.substring(3, 6) + '-' + phoneStr.substring(6);
  }
  
  return phoneStr;
}

/**
 * 유연한 컬럼명 매칭 (점, 공백 등 무시)
 */
function findColumn(mapping, possibleNames) {
  // 정확한 매칭 먼저 시도
  for (const name of possibleNames) {
    if (mapping[name] !== undefined) {
      return mapping[name];
    }
  }
  
  // 키워드 포함 매칭 (유연한 검색)
  const keywords = possibleNames.map(n => n.replace(/[.\s_]/g, '').toLowerCase());
  
  for (const [headerName, index] of Object.entries(mapping)) {
    const normalized = headerName.replace(/[.\s_]/g, '').toLowerCase();
    for (const keyword of keywords) {
      if (normalized.includes(keyword) || keyword.includes(normalized)) {
        return index;
      }
    }
  }
  
  return undefined;
}

/**
 * CRM 전송 함수 (특정 행)
 */
function sendCarInquiryToCRMByRow(rowNumber) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`${SHEET_NAME} 시트를 찾을 수 없습니다.`);
    }
    
    // 헤더 및 컬럼 매핑 가져오기
    const { mapping, headers } = getColumnMapping(sheet);
    
    // CRM 상태 컬럼 확인
    ensureCRMStatusColumns(sheet, headers);
    
    // 컬럼 매핑 재로드 (상태 컬럼이 추가되었을 수 있음)
    const lastCol = sheet.getLastColumn();
    const allHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const finalMapping = {};
    allHeaders.forEach((header, index) => {
      finalMapping[String(header).trim()] = index;
    });
    
    // 행 데이터 읽기
    const rowData = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
    
    // CRM 전송 상태 확인
    const statusIdx = finalMapping['CRM전송상태'];
    const status = statusIdx !== undefined ? String(rowData[statusIdx] || '').trim().toLowerCase() : '';
    
    if (status === 'success' || status === 'sending') {
      return { success: false, message: `이미 처리됨: ${status}`, row: rowNumber };
    }
    
    // 전송 중 상태로 변경 (중복 방지)
    if (statusIdx !== undefined) {
      sheet.getRange(rowNumber, statusIdx + 1).setValue('sending');
    }
    
    // 데이터 추출 (페이스북 리드폼 컬럼명)
    const phoneIdx = finalMapping['phone_number'];
    const fullNameIdx = finalMapping['full_name'];
    
    // 전화번호 필수 확인
    if (phoneIdx === undefined || !rowData[phoneIdx]) {
      if (statusIdx !== undefined) {
        sheet.getRange(rowNumber, statusIdx + 1).setValue('validation_error: 전화번호 없음');
      }
      return {
        success: false,
        message: 'phone_number 컬럼 없음 또는 전화번호 누락',
        row: rowNumber
      };
    }
    
    let customerPhone = normalizePhone(rowData[phoneIdx]);
    
    if (!customerPhone || customerPhone.length < 10) {
      if (statusIdx !== undefined) {
        sheet.getRange(rowNumber, statusIdx + 1).setValue('validation_error: 전화번호 형식 오류');
      }
      return {
        success: false,
        message: '전화번호 형식 오류',
        row: rowNumber
      };
    }
    
    // 이름 추출 (full_name 또는 전화번호 마지막 4자리)
    let customerName = '';
    if (fullNameIdx !== undefined && rowData[fullNameIdx]) {
      customerName = String(rowData[fullNameIdx]).trim();
    }
    
    if (!customerName) {
      const digits = customerPhone.replace(/\D/g, '');
      customerName = `차량문의${digits.slice(-4)}`;
    }
    
    // 추가 정보 추출 (유연한 컬럼명 매칭)
    const inquiryTypeIdx = findColumn(finalMapping, [
      '유형을_선택해주세요',
      '유형을선택해주세요',
      '유형'
    ]);
    const inquiryType = inquiryTypeIdx !== undefined 
      ? String(rowData[inquiryTypeIdx] || '').trim() 
      : '';
    
    // 희망차종 컬럼 찾기 (점 있는 버전 포함)
    const carModelIdx = findColumn(finalMapping, [
      '(희망차종)_차량명을_입력해_주세요.',
      '(희망차종)_차량명을_입력해_주세요',
      '희망차종',
      '차량명'
    ]);
    const carModel = carModelIdx !== undefined
      ? String(rowData[carModelIdx] || '').trim()
      : '';
    
    const adsetNameIdx = finalMapping['adset_name'];
    const adsetName = adsetNameIdx !== undefined
      ? String(rowData[adsetNameIdx] || '').trim()
      : '';
    
    const formNameIdx = finalMapping['form_name'];
    const formName = formNameIdx !== undefined
      ? String(rowData[formNameIdx] || '').trim()
      : '';
    
    const campaignNameIdx = finalMapping['campaign_name'];
    const campaignName = campaignNameIdx !== undefined
      ? String(rowData[campaignNameIdx] || '').trim()
      : '';
    
    // CRM 전송 데이터 구성
    const crmPayload = {
      name: customerName,
      phone: customerPhone,
      consultType: '차량상담',
      consultPath: formName || '차량문의폼',
      source: 'facebook_lead_form',
      marketingConsent: false,
      
      info1: inquiryType,
      info2: carModel,
      info3: adsetName,
      
      memo: `페이스북 리드폼 차량 문의\n- 유형: ${inquiryType}\n- 희망차종: ${carModel}\n- 광고세트: ${adsetName}\n- 캠페인: ${campaignName}`
    };
    
    Logger.log('📤 CRM 전송 (Row ' + rowNumber + '): ' + JSON.stringify(crmPayload, null, 2));
    
    // CRM API 호출
    const response = UrlFetchApp.fetch(CRM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CRM_API_KEY
      },
      payload: JSON.stringify(crmPayload),
      muteHttpExceptions: true
    });
    
    const responseText = response.getContentText();
    const statusCode = response.getResponseCode();
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    
    Logger.log(`📥 CRM 응답 (${statusCode}): ${responseText}`);
    
    if (statusCode === 200) {
      const result = JSON.parse(responseText);
      
      if (result.success) {
        // 성공 상태 업데이트
        if (statusIdx !== undefined) {
          sheet.getRange(rowNumber, statusIdx + 1).setValue('success');
        }
        
        const sentTimeIdx = finalMapping['CRM전송시간'];
        if (sentTimeIdx !== undefined) {
          sheet.getRange(rowNumber, sentTimeIdx + 1).setValue(now);
        }
        
        const customerIdIdx = finalMapping['마셈블고객ID'];
        if (customerIdIdx !== undefined && result.customerId) {
          sheet.getRange(rowNumber, customerIdIdx + 1).setValue(result.customerId);
        }
        
        Logger.log(`✅ CRM 전송 성공: ${customerName} (${customerPhone}) → ${result.customerId}`);
        
        return {
          success: true,
          message: 'CRM 전송 성공',
          row: rowNumber,
          customerId: result.customerId
        };
      } else {
        // API 오류
        if (statusIdx !== undefined) {
          const errorMsg = result.message ? result.message.substring(0, 100) : 'API 오류';
          sheet.getRange(rowNumber, statusIdx + 1).setValue(`api_error: ${errorMsg}`);
        }
        
        const sentTimeIdx = finalMapping['CRM전송시간'];
        if (sentTimeIdx !== undefined) {
          sheet.getRange(rowNumber, sentTimeIdx + 1).setValue(now);
        }
        
        return {
          success: false,
          message: `CRM API 오류: ${result.message}`,
          row: rowNumber
        };
      }
    } else {
      // HTTP 오류
      if (statusIdx !== undefined) {
        sheet.getRange(rowNumber, statusIdx + 1).setValue(`http_error_${statusCode}`);
      }
      
      const sentTimeIdx = finalMapping['CRM전송시간'];
      if (sentTimeIdx !== undefined) {
        sheet.getRange(rowNumber, sentTimeIdx + 1).setValue(now);
      }
      
      return {
        success: false,
        message: `CRM HTTP 오류 (${statusCode})`,
        row: rowNumber
      };
    }
  } catch (error) {
    Logger.log('❌ CRM 전송 오류 (Row ' + rowNumber + '): ' + error);
    return {
      success: false,
      message: '전송 중 오류: ' + error.message,
      row: rowNumber
    };
  }
}

/**
 * Cron Job: 1분마다 자동 실행 (CRM 전송)
 */
function cronJob() {
  try {
    Logger.log('🔄 Cron Job 시작: ' + new Date().toLocaleString('ko-KR'));
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log(`⚠️ ${SHEET_NAME} 시트를 찾을 수 없습니다.`);
      return;
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      Logger.log('ℹ️ 처리할 데이터가 없습니다.');
      return;
    }
    
    // 헤더 매핑
    const { mapping } = getColumnMapping(sheet);
    const statusIdx = mapping['CRM전송상태'];
    
    if (statusIdx === undefined) {
      Logger.log('⚠️ CRM전송상태 컬럼이 없습니다. 첫 실행 시 자동 생성됩니다.');
    }
    
    let sentCount = 0;
    let errorCount = 0;
    const maxSendPerRun = 50;
    
    // 2번째 행부터 처리 (1번째 행은 헤더)
    for (let rowNumber = 2; rowNumber <= lastRow && sentCount < maxSendPerRun; rowNumber++) {
      // 상태 확인
      let status = '';
      if (statusIdx !== undefined) {
        const statusCell = sheet.getRange(rowNumber, statusIdx + 1).getValue();
        status = String(statusCell || '').trim().toLowerCase();
      }
      
      // pending이거나 빈 값이거나 에러 상태인 경우만 재전송
      if (status === '' || status === 'pending' || status.startsWith('http_error') || status.startsWith('validation_error')) {
        Logger.log(`📨 Row ${rowNumber} 전송 시도`);
        
        const result = sendCarInquiryToCRMByRow(rowNumber);
        
        if (result.success) {
          sentCount++;
          Logger.log(`  ✅ 성공`);
        } else {
          errorCount++;
          Logger.log(`  ❌ 실패: ${result.message}`);
        }
        
        // API 호출 간격 (Rate Limiting 방지)
        Utilities.sleep(200);
      }
    }
    
    Logger.log(`✅ Cron Job 완료: 성공 ${sentCount}건, 오류 ${errorCount}건`);
    
    return {
      success: true,
      sentCount: sentCount,
      errorCount: errorCount,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    Logger.log('❌ Cron Job 오류: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Cron Trigger 생성 (1분마다 자동 실행)
 */
function createCronTrigger() {
  try {
    // 기존 트리거 삭제
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'cronJob') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // 1분마다 실행되는 트리거 생성
    ScriptApp.newTrigger('cronJob')
      .timeBased()
      .everyMinutes(1)
      .create();
    
    Logger.log('✅ Cron Trigger 생성 완료 (1분 주기)');
    return '✅ Cron Trigger 생성 완료 (1분 주기)';
  } catch (error) {
    Logger.log('❌ Trigger 생성 오류: ' + error);
    throw error;
  }
}

/**
 * Cron Trigger 삭제
 */
function deleteCronTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let count = 0;
    
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'cronJob') {
        ScriptApp.deleteTrigger(trigger);
        count++;
      }
    });
    
    Logger.log(`✅ Cron Trigger ${count}개 삭제 완료`);
    return `✅ Cron Trigger ${count}개 삭제 완료`;
  } catch (error) {
    Logger.log('❌ Trigger 삭제 오류: ' + error);
    throw error;
  }
}

/**
 * Trigger 상태 확인
 */
function checkTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const cronTriggers = triggers.filter(t => t.getHandlerFunction() === 'cronJob');
  
  Logger.log(`📊 총 트리거 개수: ${triggers.length}`);
  Logger.log(`📊 CRM 동기화 트리거 개수: ${cronTriggers.length}`);
  
  cronTriggers.forEach((trigger, index) => {
    Logger.log(`  ${index + 1}. ${trigger.getHandlerFunction()} - ${trigger.getTriggerSource()}`);
  });
  
  return {
    total: triggers.length,
    cronTriggers: cronTriggers.length
  };
}

/**
 * 테스트: 수동으로 모든 pending 데이터 전송
 */
function testManualSync() {
  Logger.log('🧪 수동 전송 테스트 시작');
  return cronJob();
}

/**
 * 테스트: 단일 행 데이터 확인 및 전송
 */
function testSingleRow(rowNumber) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log(`❌ ${SHEET_NAME} 시트를 찾을 수 없습니다.`);
      return;
    }
    
    const row = rowNumber || 2;
    const { mapping, headers } = getColumnMapping(sheet);
    
    Logger.log('📋 시트 헤더: ' + headers.join(', '));
    Logger.log('\n📦 Row ' + row + ' 전송 테스트:');
    
    const result = sendCarInquiryToCRMByRow(row);
    Logger.log('\n📊 결과: ' + JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    Logger.log('❌ 테스트 오류: ' + error);
    throw error;
  }
}

/**
 * 테스트: 시트 구조 분석
 */
function analyzeSheetStructure() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log(`❌ ${SHEET_NAME} 시트를 찾을 수 없습니다.`);
      return;
    }
    
    const { mapping, headers } = getColumnMapping(sheet);
    
    Logger.log('📊 시트 구조 분석:');
    Logger.log('  시트명: ' + SHEET_NAME);
    Logger.log('  총 행: ' + sheet.getLastRow());
    Logger.log('  총 컬럼: ' + sheet.getLastColumn());
    Logger.log('\n📋 컬럼 목록:');
    
    headers.forEach((header, index) => {
      const letter = String.fromCharCode(65 + (index % 26));
      Logger.log(`  ${letter}${Math.floor(index / 26) || ''}: ${header}`);
    });
    
    Logger.log('\n🔍 주요 컬럼 확인:');
    Logger.log('  phone_number: ' + (mapping['phone_number'] !== undefined ? `컬럼 ${mapping['phone_number']}` : '❌ 없음'));
    Logger.log('  full_name: ' + (mapping['full_name'] !== undefined ? `컬럼 ${mapping['full_name']}` : '❌ 없음'));
    
    // 유연한 컬럼명 매칭 테스트
    const inquiryTypeIdx = findColumn(mapping, ['유형을_선택해주세요', '유형']);
    const carModelIdx = findColumn(mapping, ['(희망차종)_차량명을_입력해_주세요.', '(희망차종)_차량명을_입력해_주세요', '희망차종']);
    
    Logger.log('  유형: ' + (inquiryTypeIdx !== undefined ? `컬럼 ${inquiryTypeIdx} (${headers[inquiryTypeIdx]})` : '없음'));
    Logger.log('  희망차종: ' + (carModelIdx !== undefined ? `컬럼 ${carModelIdx} (${headers[carModelIdx]})` : '없음'));
    Logger.log('  adset_name: ' + (mapping['adset_name'] !== undefined ? `컬럼 ${mapping['adset_name']}` : '없음'));
    Logger.log('  CRM전송상태: ' + (mapping['CRM전송상태'] !== undefined ? `컬럼 ${mapping['CRM전송상태']}` : '없음 (자동 생성됨)'));
    
    return { mapping, headers };
  } catch (error) {
    Logger.log('❌ 분석 오류: ' + error);
    throw error;
  }
}
