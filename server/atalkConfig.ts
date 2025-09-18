/**
 * ATALK API 중앙화된 설정 관리
 * 모든 ATALK 관련 설정의 단일 진실 공급원(Single Source of Truth)
 */

import { secureLog, LogLevel } from './securityUtils';

// ATALK API 고정 상수 (API 문서 기준)
const ATALK_CONSTANTS = {
  // API 문서에서 제공된 고정값들
  COMPANY: '627923',
  USER_ID: 'bWI2Mjc5MjM=',
  PAGE: 'A',
  BASE_HOST: '101.202.45.50',
  BASE_PORT: '8080',
  BASE_PATH: '/thirdparty/v1'
} as const;

// ATALK API 설정 인터페이스
export interface AtalkConfig {
  baseUrl: string;
  token: string;
  company: string;
  userId: string;
  campaignName: string;
  page: string;
  protocol: 'http' | 'https';
}

// 환경변수 검증 결과 캐시
let configCache: AtalkConfig | null = null;
let configValidationError: string | null = null;

/**
 * 프로토콜 결정 로직 (ATALK 서버 HTTPS 미지원 대응)
 */
function determineProtocol(): { protocol: 'http' | 'https'; baseUrl: string; reason: string } {
  const isProduction = process.env.NODE_ENV === 'production';
  const forceHttp = process.env.ATALK_FORCE_HTTP === 'true';
  const allowInsecure = process.env.ALLOW_INSECURE_ATALK === 'true';

  if (forceHttp) {
    return {
      protocol: 'http',
      baseUrl: `http://${ATALK_CONSTANTS.BASE_HOST}:${ATALK_CONSTANTS.BASE_PORT}${ATALK_CONSTANTS.BASE_PATH}`,
      reason: 'ATALK_FORCE_HTTP 환경변수 설정'
    };
  }

  if (isProduction && !forceHttp) {
    // 프로덕션에서 HTTP를 명시적으로 허용하지 않은 경우 HTTPS 시도 (실패 예상)
    return {
      protocol: 'https',
      baseUrl: `https://${ATALK_CONSTANTS.BASE_HOST}:${ATALK_CONSTANTS.BASE_PORT}${ATALK_CONSTANTS.BASE_PATH}`,
      reason: '프로덕션 환경 - HTTPS 시도 (ATALK 서버 제약으로 실패 예상)'
    };
  }

  if (allowInsecure) {
    return {
      protocol: 'http',
      baseUrl: `http://${ATALK_CONSTANTS.BASE_HOST}:${ATALK_CONSTANTS.BASE_PORT}${ATALK_CONSTANTS.BASE_PATH}`,
      reason: 'ALLOW_INSECURE_ATALK 환경변수 설정'
    };
  }

  // 기본값: HTTPS 시도 (실패할 가능성 높음)
  return {
    protocol: 'https',
    baseUrl: `https://${ATALK_CONSTANTS.BASE_HOST}:${ATALK_CONSTANTS.BASE_PORT}${ATALK_CONSTANTS.BASE_PATH}`,
    reason: '기본 HTTPS 설정 (실패 시 ATALK_FORCE_HTTP=true 필요)'
  };
}

/**
 * 환경별 캠페인명 기본값 결정
 */
function getDefaultCampaignName(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // 프로덕션에서는 명시적 설정을 강제
    throw new Error(
      '프로덕션 환경에서는 ATALK_CAMPAIGN_NAME 환경변수 설정이 필수입니다. ' +
      '예: ATALK_CAMPAIGN_NAME=실제캠페인명'
    );
  }

  // 개발환경 기본값 - 테스트 확인된 값
  return '테스트4';
}

/**
 * ATALK API 설정 생성 및 검증
 */
function createAtalkConfig(): AtalkConfig {
  // 환경변수에서 토큰 획득
  const token = process.env.ATALK_API_TOKEN || process.env.ATALK_API_KEY;
  if (!token) {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const errorMessage = isDevelopment
      ? '🛠️ ARS 기능을 사용하려면 ATALK_API_TOKEN 환경변수를 설정해주세요.\n' +
        '예시: ATALK_API_TOKEN=your_token_here\n' +
        '관리자에게 문의하여 정확한 토큰 값을 받으세요.'
      : 'ARS 서비스 설정 오류: ATALK API 토큰이 누락되었습니다. 관리자에게 문의하세요.';
    
    throw new Error(errorMessage);
  }

  // 프로토콜 및 URL 결정
  const protocolInfo = determineProtocol();

  // 캠페인명 결정 (환경변수 우선, 없으면 환경별 기본값)
  let campaignName: string;
  if (process.env.ATALK_CAMPAIGN_NAME) {
    campaignName = process.env.ATALK_CAMPAIGN_NAME;
  } else {
    campaignName = getDefaultCampaignName();
  }

  const config: AtalkConfig = {
    baseUrl: protocolInfo.baseUrl,
    token,
    company: ATALK_CONSTANTS.COMPANY,
    userId: ATALK_CONSTANTS.USER_ID,
    campaignName,
    page: ATALK_CONSTANTS.PAGE,
    protocol: protocolInfo.protocol
  };

  // 설정 완료 로그
  secureLog(LogLevel.INFO, 'ATALK_CONFIG', '중앙화된 ATALK 설정 생성 완료', {
    protocol: protocolInfo.protocol,
    environment: process.env.NODE_ENV || 'development',
    campaignName,
    protocolReason: protocolInfo.reason,
    configSource: 'atalkConfig.ts (중앙화됨)'
  });

  return config;
}

/**
 * ATALK 설정 가져오기 (캐시 사용)
 */
export function getAtalkConfig(): AtalkConfig {
  // 이전에 검증 실패한 경우 즉시 에러 throw
  if (configValidationError) {
    throw new Error(configValidationError);
  }

  // 캐시된 설정이 있으면 반환
  if (configCache) {
    return configCache;
  }

  try {
    // 새로운 설정 생성 및 캐시
    configCache = createAtalkConfig();
    return configCache;
  } catch (error) {
    // 검증 실패 결과를 캐시하여 반복적인 에러 방지
    const errorMessage = error instanceof Error ? error.message : 'ATALK 설정 생성 실패';
    configValidationError = errorMessage;
    
    secureLog(LogLevel.ERROR, 'ATALK_CONFIG', '설정 생성 실패', {
      error: errorMessage
    });
    
    throw error;
  }
}

/**
 * 개발용 설정 상태 확인 함수
 */
export function getConfigStatus(): {
  isConfigured: boolean;
  environment: string;
  protocol: string;
  campaignName: string;
  hasToken: boolean;
  configSource: string;
  issues?: string[];
} {
  try {
    const config = getAtalkConfig();
    return {
      isConfigured: true,
      environment: process.env.NODE_ENV || 'development',
      protocol: config.protocol,
      campaignName: config.campaignName,
      hasToken: !!config.token,
      configSource: 'atalkConfig.ts (중앙화)'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const issues = [];
    
    if (errorMessage.includes('ATALK_API_TOKEN')) {
      issues.push('ATALK_API_TOKEN 환경변수 누락');
    }
    if (errorMessage.includes('ATALK_CAMPAIGN_NAME')) {
      issues.push('프로덕션에서 ATALK_CAMPAIGN_NAME 설정 필요');
    }

    return {
      isConfigured: false,
      environment: process.env.NODE_ENV || 'development',
      protocol: 'unknown',
      campaignName: 'unknown',
      hasToken: false,
      configSource: 'atalkConfig.ts (중앙화)',
      issues
    };
  }
}

/**
 * 설정 캐시 초기화 (테스트용)
 */
export function resetConfigCache(): void {
  configCache = null;
  configValidationError = null;
}

/**
 * 실제 필요한 환경변수 목록
 */
export const REQUIRED_ENV_VARS = {
  // 항상 필요한 환경변수
  always: ['ATALK_API_TOKEN'],
  
  // 프로덕션에서만 필요한 환경변수
  production: ['ATALK_CAMPAIGN_NAME'],
  
  // 선택적 환경변수 (기본값 있음)
  optional: [
    'ATALK_FORCE_HTTP',      // HTTP 강제 사용
    'ALLOW_INSECURE_ATALK',  // 개발환경에서 HTTP 허용
    'ATALK_SECRET_KEY'       // API 서명용 (있으면 사용)
  ]
} as const;

// 모듈 로드 시점에 설정 상태 로그
secureLog(LogLevel.INFO, 'ATALK_CONFIG', 'ATALK 설정 모듈 로드됨', {
  moduleName: 'atalkConfig.ts',
  purpose: 'ATALK API 설정 중앙화',
  constants: {
    company: ATALK_CONSTANTS.COMPANY,
    userId: ATALK_CONSTANTS.USER_ID,
    baseHost: ATALK_CONSTANTS.BASE_HOST
  }
});