/**
 * 보탐정(https://botamjeong.replit.app) 구글 스프레드시트 연동 스크립트
 * 마셈블 CRM (https://massemble-crm-shinsehoona.replit.app) 통합
 * 스프레드시트 ID: 1YgaUh70gLugjYcIV_y6jN1R96aEbEcRNb4Sr5OSkOdw
 *
 * 설정:
 * 1) setupInitialSheet() 1회 실행
 * 2) 웹앱으로 배포(실행: 나, 액세스: 모든 사용자) → 보탐정에 URL 등록
 * 3) createCronTrigger() 1회 실행(1분 주기 크론 생성)
 */

// ===== 설정 =====
const SPREADSHEET_ID = '1YgaUh70gLugjYcIV_y6jN1R96aEbEcRNb4Sr5OSkOdw';
const BOTAMJEONG_URL = 'https://botamjeong.replit.app';

// 마셈블 CRM 설정
const MASSEMBLE_CRM_URL = 'https://massemble-crm-shinsehoona.replit.app';
const MASSEMBLE_API_KEY = 'your_survey_api_key_here'; // TODO: 실제 SURVEY_API_KEY로 교체 필요

// 시트 이름
const SHEETS = {
  SURVEY: '설문_응답',
  ANALYSIS: '분석_결과',
  PHONE_LOG: '전화_문의',
  CONSULTATION: '상담_신청'
};

/** 초기 스프레드시트 설정 */
function setupInitialSheet() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // 기존 시트 정리
    const existingSheets = ss.getSheets();
    if (existingSheets.length === 1 && existingSheets[0].getName() === 'Sheet1') {
      existingSheets[0].setName(SHEETS.SURVEY);
    }

    // 설문 응답 시트
    let surveySheet = ss.getSheetByName(SHEETS.SURVEY);
    if (!surveySheet) surveySheet = ss.insertSheet(SHEETS.SURVEY);

    const surveyHeaders = [
      '응답시간','ID','병원방문','성별','지역','보험료구간',
      '생년월일','보험종류','이름','전화번호','상담시간','점수','평균보험료',
      'CRM전송상태','CRM전송시간','마셈블고객ID'
    ];

    if (surveySheet.getLastRow() === 0) {
      surveySheet.getRange(1,1,1,surveyHeaders.length).setValues([surveyHeaders]);
      surveySheet.getRange(1,1,1,surveyHeaders.length)
        .setFontWeight('bold').setBackground('#4285F4').setFontColor('#FFFFFF');
    }

    // 분석 결과
    let analysisSheet = ss.getSheetByName(SHEETS.ANALYSIS);
    if (!analysisSheet) analysisSheet = ss.insertSheet(SHEETS.ANALYSIS);

    const analysisHeaders = [
      '분석시간','설문ID','점수','또래평균','차이','연령','연령그룹',
      '추천사항1','추천사항2','추천사항3','추천사항4'
    ];
    if (analysisSheet.getLastRow() === 0) {
      analysisSheet.getRange(1,1,1,analysisHeaders.length).setValues([analysisHeaders]);
      analysisSheet.getRange(1,1,1,analysisHeaders.length)
        .setFontWeight('bold').setBackground('#34A853').setFontColor('#FFFFFF');
    }

    // 전화 문의
    let phoneSheet = ss.getSheetByName(SHEETS.PHONE_LOG);
    if (!phoneSheet) phoneSheet = ss.insertSheet(SHEETS.PHONE_LOG);

    const phoneHeaders = ['문의시간','설문ID','이름','전화번호','문의방법','IP주소','페이지경로'];
    if (phoneSheet.getLastRow() === 0) {
      phoneSheet.getRange(1,1,1,phoneHeaders.length).setValues([phoneHeaders]);
      phoneSheet.getRange(1,1,1,phoneHeaders.length)
        .setFontWeight('bold').setBackground('#EA4335').setFontColor('#FFFFFF');
    }

    // 상담 신청
    let consultationSheet = ss.getSheetByName(SHEETS.CONSULTATION);
    if (!consultationSheet) consultationSheet = ss.insertSheet(SHEETS.CONSULTATION);

    const consultationHeaders = ['신청시간','상담ID','이름','전화번호','희망시간','개인정보동의','설문ID'];
    if (consultationSheet.getLastRow() === 0) {
      consultationSheet.getRange(1,1,1,consultationHeaders.length).setValues([consultationHeaders]);
      consultationSheet.getRange(1,1,1,consultationHeaders.length)
        .setFontWeight('bold').setBackground('#FF9900').setFontColor('#FFFFFF');
    }

    // 너비 자동
    surveySheet.autoResizeColumns(1, surveyHeaders.length);
    analysisSheet.autoResizeColumns(1, analysisHeaders.length);
    phoneSheet.autoResizeColumns(1, phoneHeaders.length);
    consultationSheet.autoResizeColumns(1, consultationHeaders.length);

    Logger.log('✅ 스프레드시트 초기 설정 완료');
    return '스프레드시트 초기 설정 완료';
  } catch (err) {
    Logger.log('❌ 초기 설정 오류: ' + err);
    throw err;
  }
}

/** 웹앱 POST */
function doPost(e) {
  try {
    Logger.log('🔥 doPost 호출됨');
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({success:false,error:'데이터가 없습니다.'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const { action, payload } = data || {};
    Logger.log('🎯 액션: ' + action);

    let result = { success:false, message:'알 수 없는 액션입니다.' };

    switch (action) {
      case 'survey_complete':      result = handleSurveyComplete(payload); break;
      case 'phone_inquiry':        result = handlePhoneInquiry(payload);   break;
      case 'consultation_request': result = handleConsultationRequest(payload); break;
      case 'get_stats':            result = getStatistics();               break;
      case 'send_crm':             result = sendToMassembleCRM(payload?.surveyId || null); break;
      case 'send_all_crm':         result = sendAllToMassembleCRM();        break;
      case 'check_crm':            result = checkMassembleCRMStatus();      break;
      default:                     result = { success:false, message:'지원하지 않는 액션: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('❌ doPost 오류: ' + error + '\n' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({success:false,error:'서버 오류: ' + error.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/** 웹앱 GET */
function doGet(e) {
  try {
    const action = e.parameter.action || 'stats';
    let result = {};
    if (action === 'stats')        result = getStatistics();
    else if (action === 'recent')  result = getRecentData(parseInt(e.parameter.limit) || 20);
    else if (action === 'export')  result = exportData();
    else                           result = { error: '알 수 없는 액션: ' + action };

    return ContentService.createTextOutput(JSON.stringify(result, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: '조회 오류: ' + error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/** 설문 완료 저장 + 즉시 마셈블 CRM 전송 */
function handleSurveyComplete(payload) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const surveySheet = ss.getSheetByName(SHEETS.SURVEY);
    const analysisSheet = ss.getSheetByName(SHEETS.ANALYSIS);
    if (!surveySheet || !analysisSheet) throw new Error('시트를 찾을 수 없습니다. 먼저 setupInitialSheet() 실행');

    const now = new Date();
    const surveyId = payload.surveyId || generateId();

    const surveyRow = [
      now, surveyId, payload.hospitalVisits || '', payload.gender || '', payload.region || '',
      payload.premiumRange || '', payload.birthDate || '',
      Array.isArray(payload.insuranceTypes) ? payload.insuranceTypes.join(', ') : '',
      payload.name || '', payload.phone || '', payload.consultationTime || '',
      payload.analysis?.score || 0, payload.analysis?.peerAverage || 0,
      'pending', '', '' // CRM전송상태, CRM전송시간, 마셈블고객ID
    ];
    surveySheet.appendRow(surveyRow);

    if (payload.analysis) {
      const r = payload.analysis.recommendations || [];
      const analysisRow = [
        now, surveyId, payload.analysis.score || 0, payload.analysis.peerAverage || 0,
        payload.analysis.difference || 0, payload.analysis.age || 0, payload.analysis.ageGroup || '',
        r[0] || '', r[1] || '', r[2] || '', r[3] || ''
      ];
      analysisSheet.appendRow(analysisRow);
    }

    const last = surveySheet.getLastRow();
    surveySheet.getRange(last,1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    surveySheet.getRange(last,12,1,2).setNumberFormat('#,##0');
    if (payload.analysis) {
      const la = analysisSheet.getLastRow();
      analysisSheet.getRange(la,1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      analysisSheet.getRange(la,3,1,3).setNumberFormat('#,##0');
    }

    // 즉시 마셈블 CRM 전송
    try { 
      sendToMassembleCRM(surveyId); 
    } catch (e) { 
      Logger.log('마셈블 CRM 자동 전송 실패: ' + e); 
    }

    return { success:true, message:'저장 완료', surveyId, timestamp: now.toISOString() };
  } catch (error) {
    return { success:false, error: error.message };
  }
}

/** 전화 문의 로그 */
function handlePhoneInquiry(payload) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(SHEETS.PHONE_LOG);
    if (!sh) throw new Error('전화 문의 시트를 찾을 수 없습니다.');

    const now = new Date();
    const row = [
      now, payload.surveyId || '', payload.name || '미제공', payload.phone || '1660-2426',
      payload.method || 'button_click', payload.ip || '', payload.page || ''
    ];
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(),1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    return { success:true, message:'전화 문의 기록됨', timestamp: now.toISOString() };
  } catch (e) {
    return { success:false, error: e.message };
  }
}

/** 상담 신청 저장 */
function handleConsultationRequest(payload) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(SHEETS.CONSULTATION);
    if (!sh) throw new Error('상담 신청 시트를 찾을 수 없습니다. setupInitialSheet() 실행');

    const now = new Date();
    const row = [
      now, payload.requestId || '', payload.name || '', payload.phone || '',
      payload.preferredTime || '', payload.privacyConsent ? '동의' : '거부',
      payload.surveyResponseId || ''
    ];
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(),1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    return { success:true, message:'상담 신청 저장', requestId: payload.requestId, timestamp: now.toISOString() };
  } catch (e) {
    return { success:false, error: e.message };
  }
}

/** 마셈블 CRM으로 설문조사 데이터 전송 */
function sendToMassembleCRM(surveyId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const surveySheet = ss.getSheetByName(SHEETS.SURVEY);
    const analysisSheet = ss.getSheetByName(SHEETS.ANALYSIS);
    
    if (!surveySheet) throw new Error('설문 응답 시트를 찾을 수 없습니다.');

    const data = surveySheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);

    // 특정 surveyId 찾기 (surveyId가 null이면 전송 안된 첫 번째 항목)
    let targetRow = null;
    let rowIndex = -1;

    if (surveyId) {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][1] === surveyId) { // ID 컬럼
          targetRow = rows[i];
          rowIndex = i + 2; // 헤더 행 때문에 +2
          break;
        }
      }
    } else {
      // 첫 번째 pending 항목 찾기
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][13] === 'pending' || !rows[i][13]) { // CRM전송상태 컬럼
          targetRow = rows[i];
          rowIndex = i + 2;
          surveyId = rows[i][1];
          break;
        }
      }
    }

    if (!targetRow) {
      return { success: false, message: '전송할 설문조사 데이터를 찾을 수 없습니다.' };
    }

    // 분석 데이터 조회
    let analysisData = null;
    if (analysisSheet) {
      const analysisRows = analysisSheet.getDataRange().getValues().slice(1);
      analysisData = analysisRows.find(row => row[1] === surveyId);
    }

    // 마셈블 CRM 형식으로 데이터 변환
    const crmPayload = {
      name: targetRow[8] || '',                    // 이름
      phone: targetRow[9] || '',                   // 전화번호  
      gender: mapGender(targetRow[3]),             // 성별 (M/F/N)
      birthDate: formatBirthDate(targetRow[6]),    // 생년월일 (YYYY-MM-DD)
      consultType: '보험상담',                     // 상담유형
      consultPath: '보탐정설문',                   // 상담경로
      source: 'botamjeong_survey',                 // 소스
      marketingConsent: false,                     // 마케팅 동의 (기본 false)
      surveyResults: {                             // 설문조사 결과
        surveyId: surveyId,
        hospitalVisits: targetRow[2] || '',
        region: targetRow[4] || '',
        premiumRange: targetRow[5] || '',
        insuranceTypes: targetRow[7] || '',
        consultationTime: targetRow[10] || '',
        score: targetRow[11] || 0,
        peerAverage: targetRow[12] || 0,
        analysisData: analysisData ? {
          age: analysisData[5] || 0,
          ageGroup: analysisData[6] || '',
          recommendations: [
            analysisData[7] || '',
            analysisData[8] || '',
            analysisData[9] || '',
            analysisData[10] || ''
          ].filter(r => r)
        } : null
      },
      memo: `보탐정 설문조사 응답 (ID: ${surveyId})`,
      surveyId: surveyId,
      surveyCompletedAt: targetRow[0] ? new Date(targetRow[0]).toISOString() : new Date().toISOString()
    };

    Logger.log('📤 마셈블 CRM 전송 데이터: ' + JSON.stringify(crmPayload, null, 2));

    // 마셈블 CRM API 호출
    const response = UrlFetchApp.fetch(`${MASSEMBLE_CRM_URL}/api/survey/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MASSEMBLE_API_KEY}`,
        'X-API-Key': MASSEMBLE_API_KEY
      },
      payload: JSON.stringify(crmPayload),
      muteHttpExceptions: true
    });

    const responseText = response.getContentText();
    const statusCode = response.getResponseCode();
    
    Logger.log(`📥 마셈블 CRM 응답 (${statusCode}): ${responseText}`);

    if (statusCode === 200) {
      const result = JSON.parse(responseText);
      
      if (result.success) {
        // 성공 상태 업데이트
        surveySheet.getRange(rowIndex, 14).setValue('success'); // CRM전송상태
        surveySheet.getRange(rowIndex, 15).setValue(new Date()); // CRM전송시간
        surveySheet.getRange(rowIndex, 16).setValue(result.customerId || ''); // 마셈블고객ID
        
        Logger.log(`✅ 마셈블 CRM 전송 성공: ${surveyId} → ${result.customerId}`);
        
        return {
          success: true,
          message: '마셈블 CRM 전송 성공',
          surveyId: surveyId,
          customerId: result.customerId,
          isNewCustomer: result.isNewCustomer
        };
      } else {
        // API는 성공했지만 비즈니스 로직 실패
        surveySheet.getRange(rowIndex, 14).setValue('api_error'); // CRM전송상태
        surveySheet.getRange(rowIndex, 15).setValue(new Date()); // CRM전송시간
        
        return {
          success: false,
          message: `마셈블 CRM API 오류: ${result.message}`,
          error: result.message
        };
      }
    } else {
      // HTTP 오류
      surveySheet.getRange(rowIndex, 14).setValue('http_error'); // CRM전송상태
      surveySheet.getRange(rowIndex, 15).setValue(new Date()); // CRM전송시간
      
      return {
        success: false,
        message: `마셈블 CRM HTTP 오류 (${statusCode}): ${responseText}`,
        error: `HTTP ${statusCode}`
      };
    }

  } catch (error) {
    Logger.log('❌ 마셈블 CRM 전송 오류: ' + error);
    return {
      success: false,
      message: '마셈블 CRM 전송 중 오류 발생: ' + error.message,
      error: error.message
    };
  }
}

/** 모든 미전송 데이터를 마셈블 CRM으로 전송 */
function sendAllToMassembleCRM() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const surveySheet = ss.getSheetByName(SHEETS.SURVEY);
    
    if (!surveySheet) throw new Error('설문 응답 시트를 찾을 수 없습니다.');

    const data = surveySheet.getDataRange().getValues();
    const rows = data.slice(1);

    let successCount = 0;
    let failCount = 0;
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const surveyId = row[1];
      const crmStatus = row[13];

      // pending 또는 빈 상태인 항목만 전송
      if (crmStatus === 'pending' || !crmStatus) {
        try {
          const result = sendToMassembleCRM(surveyId);
          results.push(result);
          
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
          
          // API 호출 간격 (Rate Limiting 방지)
          Utilities.sleep(1000);
          
        } catch (error) {
          failCount++;
          results.push({
            success: false,
            surveyId: surveyId,
            error: error.message
          });
        }
      }
    }

    return {
      success: true,
      message: `일괄 전송 완료: 성공 ${successCount}건, 실패 ${failCount}건`,
      successCount: successCount,
      failCount: failCount,
      results: results
    };

  } catch (error) {
    return {
      success: false,
      message: '일괄 전송 중 오류 발생: ' + error.message,
      error: error.message
    };
  }
}

/** 마셈블 CRM 연동 상태 확인 */
function checkMassembleCRMStatus() {
  try {
    const response = UrlFetchApp.fetch(`${MASSEMBLE_CRM_URL}/api/survey/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MASSEMBLE_API_KEY}`,
        'X-API-Key': MASSEMBLE_API_KEY
      },
      muteHttpExceptions: true
    });

    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (statusCode === 200) {
      const result = JSON.parse(responseText);
      return {
        success: true,
        message: '마셈블 CRM 연동 정상',
        data: result
      };
    } else {
      return {
        success: false,
        message: `마셈블 CRM 연결 실패 (${statusCode})`,
        error: responseText
      };
    }

  } catch (error) {
    return {
      success: false,
      message: '마셈블 CRM 상태 확인 오류: ' + error.message,
      error: error.message
    };
  }
}

/** 성별 매핑 함수 */
function mapGender(gender) {
  if (!gender) return 'N';
  const g = gender.toString().toLowerCase();
  if (g.includes('남') || g === 'm' || g === 'male') return 'M';
  if (g.includes('여') || g === 'f' || g === 'female') return 'F';
  return 'N';
}

/** 생년월일 형식 변환 */
function formatBirthDate(birthDate) {
  if (!birthDate) return null;
  
  try {
    // 다양한 형식 처리
    let date;
    if (birthDate instanceof Date) {
      date = birthDate;
    } else {
      const dateStr = birthDate.toString();
      // YYYYMMDD 형식
      if (/^\d{8}$/.test(dateStr)) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(birthDate);
      }
    }
    
    if (isNaN(date.getTime())) return null;
    
    // YYYY-MM-DD 형식으로 반환
    return date.getFullYear() + '-' + 
           String(date.getMonth() + 1).padStart(2, '0') + '-' + 
           String(date.getDate()).padStart(2, '0');
  } catch (error) {
    Logger.log('생년월일 변환 오류: ' + error);
    return null;
  }
}

/** 통계 */
function getStatistics() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const surveySheet = ss.getSheetByName(SHEETS.SURVEY);
    const phoneSheet  = ss.getSheetByName(SHEETS.PHONE_LOG);
    const consultationSheet = ss.getSheetByName(SHEETS.CONSULTATION);
    if (!surveySheet || !phoneSheet) return { error:'시트를 찾을 수 없습니다.' };

    const surveyData = surveySheet.getDataRange().getValues();
    const phoneData  = phoneSheet.getDataRange().getValues();
    const consultationData = consultationSheet ? consultationSheet.getDataRange().getValues() : [];

    const surveys = surveyData.slice(1);
    const phones  = phoneData.slice(1);
    const consultations = consultationData.slice(1);

    const totalSurveys = surveys.length;
    const totalPhoneCalls = phones.length;
    const totalConsultations = consultations.length;

    // CRM 전송 통계
    const crmSuccessCount = surveys.filter(r => r[13] === 'success').length;
    const crmPendingCount = surveys.filter(r => r[13] === 'pending' || !r[13]).length;
    const crmErrorCount = surveys.filter(r => r[13] && r[13] !== 'success' && r[13] !== 'pending').length;

    const scores = surveys.map(r => r[11]).filter(v => v > 0);
    const avgScore = scores.length ? (scores.reduce((a,b)=>a+b,0) / scores.length) : 0;

    const regionStats = {}, genderStats = {}, premiumStats = {};
    surveys.forEach(r => {
      regionStats[r[4] || '미지정']  = (regionStats[r[4] || '미지정']  || 0) + 1;
      genderStats[r[3] || '미지정']  = (genderStats[r[3] || '미지정']  || 0) + 1;
      premiumStats[r[5] || '미지정'] = (premiumStats[r[5] || '미지정'] || 0) + 1;
    });

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todaySurveys = surveys.filter(r => new Date(r[0]) >= start).length;
    const todayPhones  = phones.filter(r => new Date(r[0]) >= start).length;
    const todayCons    = consultations.filter(r => new Date(r[0]) >= start).length;

    const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
    const weekSurveys = surveys.filter(r => new Date(r[0]) >= weekAgo).length;
    const weekPhones  = phones.filter(r => new Date(r[0]) >= weekAgo).length;
    const weekCons    = consultations.filter(r => new Date(r[0]) >= weekAgo).length;

    return {
      success:true,
      data:{
        overview:{
          totalSurveys, totalPhoneCalls, totalConsultations,
          averageScore: Math.round(avgScore*10)/10,
          conversionRate: totalSurveys ? Math.round((totalConsultations/totalSurveys)*1000)/10 : 0
        },
        crm: {
          successCount: crmSuccessCount,
          pendingCount: crmPendingCount,
          errorCount: crmErrorCount,
          successRate: totalSurveys ? Math.round((crmSuccessCount/totalSurveys)*1000)/10 : 0
        },
        today: { surveys: todaySurveys, phones: todayPhones, consultations: todayCons },
        week:  { surveys: weekSurveys,  phones: weekPhones,  consultations: weekCons },
        demographics: { regions: regionStats, genders: genderStats, premiums: premiumStats }
      }
    };
  } catch (e) {
    return { success:false, error: e.message };
  }
}

/** 최근 데이터 조회 */
function getRecentData(limit = 20) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const surveySheet = ss.getSheetByName(SHEETS.SURVEY);
    if (!surveySheet) return { error:'설문 응답 시트를 찾을 수 없습니다.' };

    const data = surveySheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1).reverse().slice(0, limit);

    const recentData = rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });

    return { success:true, data: recentData, count: recentData.length };
  } catch (e) {
    return { success:false, error: e.message };
  }
}

/** 데이터 내보내기 */
function exportData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const result = {};

    Object.values(SHEETS).forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      if (sheet) {
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const rows = data.slice(1);
        
        result[sheetName] = rows.map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        });
      }
    });

    return { success:true, data: result };
  } catch (e) {
    return { success:false, error: e.message };
  }
}

/** ID 생성 */
function generateId() {
  return 'survey_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
}

/** 크론 트리거 생성 (1분마다 자동 CRM 전송) */
function createCronTrigger() {
  try {
    // 기존 트리거 삭제
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'autoSendToCRM') {
        ScriptApp.deleteTrigger(trigger);
      }
    });

    // 새 트리거 생성 (1분마다)
    ScriptApp.newTrigger('autoSendToCRM')
      .timeBased()
      .everyMinutes(1)
      .create();

    Logger.log('✅ 자동 CRM 전송 트리거 생성됨 (1분 간격)');
    return '자동 CRM 전송 트리거 생성 완료';
  } catch (error) {
    Logger.log('❌ 트리거 생성 오류: ' + error);
    throw error;
  }
}

/** 자동 CRM 전송 (트리거 함수) */
function autoSendToCRM() {
  try {
    Logger.log('🔄 자동 CRM 전송 시작');
    const result = sendToMassembleCRM(null); // null이면 첫 번째 pending 항목 전송
    Logger.log('🔄 자동 CRM 전송 결과: ' + JSON.stringify(result));
  } catch (error) {
    Logger.log('❌ 자동 CRM 전송 오류: ' + error);
  }
}

/** 수동 테스트 함수 */
function testMassembleCRM() {
  Logger.log('🧪 마셈블 CRM 연동 테스트 시작');
  
  // 1. 상태 확인
  const statusResult = checkMassembleCRMStatus();
  Logger.log('📊 상태 확인: ' + JSON.stringify(statusResult));
  
  // 2. 첫 번째 미전송 데이터 전송
  const sendResult = sendToMassembleCRM(null);
  Logger.log('📤 전송 테스트: ' + JSON.stringify(sendResult));
  
  return {
    status: statusResult,
    send: sendResult
  };
}