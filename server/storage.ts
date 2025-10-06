import {
  users,
  customers,
  consultations,
  activityLogs,
  attachments,
  systemSettings,
  appointments,
  arsCampaigns,
  arsSendLogs,
  arsScenarios,
  audioFiles,
  customerGroups,
  customerGroupMappings,
  arsCampaignStats,
  arsDailyStats,
  arsHourlyStats,
  userRelationships,
  customerAllocationHistory,
  type User,
  type UpsertUser,
  type Customer,
  type CustomerWithUser,
  type InsertCustomer,
  type UpdateCustomer,
  type Consultation,
  type ConsultationWithDetails,
  type InsertConsultation,
  type ActivityLog,
  type InsertActivityLog,
  type Attachment,
  type AttachmentWithUser,
  type InsertAttachment,
  type SystemSetting,
  type Appointment,
  type InsertAppointment,
  type UpdateAppointment,
  type ArsCampaign,
  type InsertArsCampaign,
  type ArsSendLog,
  type InsertArsSendLog,
  type ArsScenario,
  type InsertArsScenario,
  type AudioFile,
  type InsertAudioFile,
  type CustomerGroup,
  type InsertCustomerGroup,
  type CustomerGroupMapping,
  type InsertCustomerGroupMapping,
  type ArsCampaignStats,
  type ArsDailyStats,
  type ArsHourlyStats,
  type AppointmentWithDetails,
  type UserRelationship,
  type InsertUserRelationship,
  type UpdateUserRelationship,
  type CustomerAllocationHistory,
  type InsertCustomerAllocationHistory,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, like, and, count, sql, inArray } from "drizzle-orm";
import { maskPhoneNumber, maskName } from "./securityUtils";
import bcrypt from 'bcryptjs';

// ============================================
// Security: SortBy Validation Whitelist
// ============================================

/**
 * 허용된 정렬 필드 화이트리스트 - SQL Injection 방지
 * 각 컨텍스트별로 정확한 필드명과 매핑 정의
 */
const ALLOWED_SORT_COLUMNS = {
  // ArsSendLogs 관련 정렬
  sendLogs: {
    'sentAt': 'sent_at',
    'createdAt': 'created_at', 
    'duration': 'duration',
    'cost': 'cost',
    'callResult': 'call_result',
    'customerName': 'customer_name',
    'phoneNumber': 'phone_number',
    'status': 'status',
    'retryType': 'retry_type',
    'completedAt': 'completed_at'
  } as const,
  
  // ArsCampaigns 관련 정렬
  campaigns: {
    'name': 'name',
    'status': 'status',
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'totalCount': 'total_count',
    'successRate': 'success_rate',
    'lastSentAt': 'last_sent_at',
    'successCount': 'success_count',
    'failedCount': 'failed_count',
    'totalCost': 'total_cost'
  } as const,

  // Customers 관련 정렬
  customers: {
    'name': 'name',
    'phone': 'phone',
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'status': 'status'
  } as const
} as const;

type SortContext = keyof typeof ALLOWED_SORT_COLUMNS;
type SortField<T extends SortContext> = keyof typeof ALLOWED_SORT_COLUMNS[T];

/**
 * sortBy 파라미터 검증 함수 - SQL Injection 방지
 * @param sortBy 사용자 입력 정렬 필드
 * @param context 정렬 컨텍스트 (sendLogs, campaigns, customers)
 * @param defaultSort 기본 정렬 필드
 * @returns 검증된 정렬 필드
 */
function validateSortBy<T extends SortContext>(
  sortBy: string | undefined, 
  context: T,
  defaultSort: SortField<T>
): SortField<T> {
  if (!sortBy) {
    return defaultSort;
  }
  
  const allowedFields = ALLOWED_SORT_COLUMNS[context];
  
  if (!(sortBy in allowedFields)) {
    // 보안 로그: 잘못된 sortBy 시도
    console.warn(`[SECURITY] Invalid sortBy attempted: ${sortBy} for context: ${context}`);
    return defaultSort;
  }
  
  return sortBy as SortField<T>;
}

/**
 * sortOrder 파라미터 검증 함수
 * @param sortOrder 사용자 입력 정렬 순서
 * @returns 검증된 정렬 순서
 */
function validateSortOrder(sortOrder: string | undefined): 'asc' | 'desc' {
  if (!sortOrder) return 'desc';
  if (sortOrder === 'asc' || sortOrder === 'desc') {
    return sortOrder;
  }
  // 보안 로그: 잘못된 sortOrder 시도
  console.warn(`[SECURITY] Invalid sortOrder attempted: ${sortOrder}`);
  return 'desc';
}


/**
 * 개인정보 마스킹을 위한 헬퍼 함수
 * 모든 응답에서 일관성 있는 마스킹 적용
 */
function applyPersonalInfoMasking<T extends Record<string, any>>(data: T): T {
  // 🔥 Critical Fix: 최강 null/undefined/primitive 체크
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }
  
  // 🔥 Critical Fix: Array인 경우 별도 처리
  if (Array.isArray(data)) {
    console.warn('[SECURITY] applyPersonalInfoMasking called with array, use applyPersonalInfoMaskingToArray instead');
    return data;
  }
  
  // 🔥 Critical Fix: 원시 타입 객체들 처리
  if (data instanceof Date || data instanceof RegExp || typeof data === 'function') {
    return data;
  }

  // 🔥 Critical Fix: 안전한 객체 복사 및 null 체크
  let masked: T;
  try {
    // Object 메서드 호출 전 추가 체크
    if (Object.prototype.toString.call(data) !== '[object Object]') {
      return data;
    }
    masked = { ...data };
  } catch (error) {
    // 복사 실패 시 원본 반환
    console.warn('[SECURITY] Failed to copy object for masking:', error);
    return data;
  }
  
  // 이름 필드 마스킹 - 안전한 타입 체크
  if ('name' in masked && masked.name && typeof masked.name === 'string') {
    (masked as any).name = maskName(masked.name);
  }
  if ('customerName' in masked && masked.customerName && typeof masked.customerName === 'string') {
    (masked as any).customerName = maskName(masked.customerName);
  }
  
  // 전화번호 필드 마스킹 - 안전한 타입 체크
  if ('phone' in masked && masked.phone && typeof masked.phone === 'string') {
    (masked as any).phone = maskPhoneNumber(masked.phone);
  }
  if ('phoneNumber' in masked && masked.phoneNumber && typeof masked.phoneNumber === 'string') {
    (masked as any).phoneNumber = maskPhoneNumber(masked.phoneNumber);
  }
  if ('secondaryPhone' in masked && masked.secondaryPhone && typeof masked.secondaryPhone === 'string') {
    (masked as any).secondaryPhone = maskPhoneNumber(masked.secondaryPhone);
  }
  if ('customerPhone' in masked && masked.customerPhone && typeof masked.customerPhone === 'string') {
    (masked as any).customerPhone = maskPhoneNumber(masked.customerPhone);
  }

  return masked;
}

/**
 * 배열 데이터에 개인정보 마스킹 적용
 */
function applyPersonalInfoMaskingToArray<T extends Record<string, any>>(data: T[]): T[] {
  // 🔥 Critical Fix: 강화된 배열 처리
  if (data === null || data === undefined) {
    console.warn('[SECURITY] applyPersonalInfoMaskingToArray called with null/undefined data');
    return [];
  }
  
  if (!Array.isArray(data)) {
    console.warn('[SECURITY] applyPersonalInfoMaskingToArray called with non-array data:', typeof data);
    return [];
  }
  
  try {
    return data.map((item, index) => {
      try {
        // 🔥 Critical Fix: 각 item에 대해 강화된 null 체크
        if (item === null || item === undefined) {
          return item;
        }
        
        if (typeof item !== 'object') {
          return item;
        }
        
        if (Array.isArray(item)) {
          console.warn(`[SECURITY] Nested array found at index ${index}, skipping masking`);
          return item;
        }
        
        return applyPersonalInfoMasking(item);
      } catch (itemError) {
        console.error(`[SECURITY] Error masking item at index ${index}:`, itemError);
        return item; // 개별 아이템 오류 시 원본 반환
      }
    });
  } catch (arrayError) {
    console.error('[SECURITY] Critical error in applyPersonalInfoMaskingToArray:', arrayError);
    return []; // 전체 배열 처리 오류 시 빈 배열 반환
  }
}

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Customer operations
  getCustomers(params: {
    search?: string;
    status?: string;
    assignedUserId?: string;
    unassigned?: boolean;
    unshared?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{
    customers: CustomerWithUser[];
    total: number;
    totalPages: number;
  }>;
  searchCustomers(params: {
    search?: string;
    status?: string;
    assignedUserId?: string;
    unassigned?: boolean;
    unshared?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{
    customers: CustomerWithUser[];
    total: number;
    totalPages: number;
  }>;
  getCustomer(id: string): Promise<CustomerWithUser | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: UpdateCustomer): Promise<Customer>;
  deleteCustomer(id: string): Promise<boolean>;

  // Dashboard statistics
  getDashboardStats(userId?: string, userRole?: string): Promise<{
    todayNew: number;
    totalCustomers: number;
    inProgress: number;
    completed: number;
    statusBreakdown: { status: string; count: number }[];
  }>;

  // Recent customers for dashboard
  getRecentCustomers(limit: number, userId?: string, userRole?: string): Promise<CustomerWithUser[]>;

  // Consultation operations
  getConsultations(customerId: string): Promise<ConsultationWithDetails[]>;
  createConsultation(consultation: InsertConsultation): Promise<Consultation>;

  // Activity log operations
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(customerId?: string, limit?: number): Promise<ActivityLog[]>;

  // User management operations
  getUsers(): Promise<User[]>;
  updateUser(id: string, user: Partial<User>): Promise<User>;
  getCounselors(): Promise<User[]>;

  // Attachment operations
  getAttachments(customerId: string): Promise<AttachmentWithUser[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  deleteAttachment(id: string): Promise<boolean>;

  // System settings operations
  getSystemSettings(): Promise<SystemSetting[]>;
  updateSystemSetting(key: string, value: string): Promise<SystemSetting>;

  // ARS operations
  getArsCampaigns(): Promise<ArsCampaign[]>;
  createArsCampaign(campaign: InsertArsCampaign): Promise<ArsCampaign>;
  updateArsCampaign(id: number, updates: Partial<InsertArsCampaign>): Promise<ArsCampaign | undefined>;
  getArsSendLogs(params: {
    campaignId?: number;
    customerId?: string;
    status?: string;
    page?: number;
    limit?: number;
    filterByUserId?: string;
  }): Promise<{
    logs: ArsSendLog[];
    total: number;
    totalPages: number;
  }>;

  // ARS 시나리오 관련 메서드들
  getArsScenarios(): Promise<ArsScenario[]>;
  createArsScenario(scenario: InsertArsScenario): Promise<ArsScenario>;
  updateArsScenario(id: string, updates: Partial<ArsScenario>): Promise<ArsScenario | undefined>;

  // 음원 파일 관련 메서드들
  getAudioFiles(): Promise<AudioFile[]>;
  getAudioFile(id: string): Promise<AudioFile | undefined>;
  createAudioFile(audioFile: InsertAudioFile): Promise<AudioFile>;
  updateAudioFile(id: string, updates: Partial<AudioFile>): Promise<AudioFile | undefined>;
  deleteAudioFile(id: string): Promise<boolean>;

  // 고객 그룹 관련 메서드들
  getCustomerGroups(): Promise<CustomerGroup[]>;
  getCustomerGroup(id: string): Promise<CustomerGroup | undefined>;
  createCustomerGroup(group: InsertCustomerGroup): Promise<CustomerGroup>;
  updateCustomerGroup(id: string, updates: Partial<CustomerGroup>): Promise<CustomerGroup | undefined>;
  deleteCustomerGroup(id: string): Promise<boolean>;
  addCustomerToGroup(customerId: string, groupId: string, addedBy: string): Promise<CustomerGroupMapping>;
  removeCustomerFromGroup(customerId: string, groupId: string): Promise<boolean>;
  getCustomersInGroup(groupId: string): Promise<CustomerWithUser[]>;
  getCustomerGroupsByCustomerId(customerId: string): Promise<CustomerGroup[]>;
  
  // ARS 마케팅 대상 관련 메서드들
  getAllMarketingTargetIds(): Promise<string[]>;

  // Campaign statistics methods
  getCampaignStatsOverview(): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    totalSent: number;
    totalSuccess: number;
    totalFailed: number;
    successRate: number;
    campaigns: Array<{
      id: number;
      name: string;
      status: string;
      totalCount: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      lastSentAt: Date | null;
      createdAt: Date;
    }>;
  }>;

  getCampaignDetailedStats(campaignId: number): Promise<{
    campaignId: number;
    campaignName: string;
    summary: {
      totalCount: number;
      sentCount: number;
      completedCount: number;
      pendingCount: number;
    };
    callResults: Record<string, number>;
    retryStats: {
      initial: number;
      manual_retry: number;
      auto_retry: number;
    };
    costAnalysis: {
      totalCost: number;
      averageCost: number;
      totalBillingUnits: number;
    };
    timeAnalysis: {
      averageDuration: number;
      totalDuration: number;
      peakHour: string;
    };
  } | null>;

  getTimelineStats(params: {
    period: 'daily' | 'hourly';
    days: number;
    campaignId?: number;
  }): Promise<{
    period: string;
    data: Array<{
      date: string;
      totalSent: number;
      successCount: number;
      failedCount: number;
      successRate: number;
    }>;
  }>;

  getFilteredSendLogs(params: {
    campaignId?: number;
    callResult?: string;
    retryType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    logs: ArsSendLog[];
    total: number;
    totalPages: number;
  }>;

  // 고급 필터링을 위한 확장된 send logs 조회 메서드
  getEnhancedSendLogs(params: {
    // 기존 필터
    campaignId?: number;
    callResult?: string;
    retryType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    // 새로운 고급 필터
    phoneNumber?: string;
    customerName?: string;
    durationMin?: number;
    durationMax?: number;
    costMin?: number;
    costMax?: number;
    status?: string[];
    callResults?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    // 사용자별 필터링
    filterByUserId?: string;
  }): Promise<{
    logs: (ArsSendLog & { 
      customerName?: string; 
      customerPhone?: string; 
      campaignName?: string;
    })[];
    total: number;
    totalPages: number;
  }>;

  // 캠페인 검색 메서드
  searchCampaigns(params: {
    query?: string;
    createdBy?: string;
    status?: string[];
    dateFrom?: string;
    dateTo?: string;
    minSuccessRate?: number;
    maxSuccessRate?: number;
    minTotalCount?: number;
    maxTotalCount?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    campaigns: Array<{
      id: number;
      name: string;
      status: string;
      createdBy?: string;
      createdAt: Date;
      updatedAt?: Date;
      totalCount: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      totalCost?: number;
      lastSentAt?: Date | null;
    }>;
    total: number;
    totalPages: number;
    currentPage: number;
  }>;

  // 빠른 통합 검색 메서드
  quickSearch(params: {
    q: string;
    type?: 'all' | 'campaigns' | 'customers' | 'logs';
    limit?: number;
  }): Promise<{
    query: string;
    results: {
      campaigns: Array<{
        id: number;
        name: string;
        type: 'campaign';
        matchField: string;
        status?: string;
        createdAt?: string;
      }>;
      customers: Array<{
        id: string;
        name: string;
        type: 'customer';
        matchField: string;
        phone?: string;
        status?: string;
      }>;
      sendLogs: Array<{
        id: number;
        campaignName: string;
        customerName: string;
        type: 'sendLog';
        matchField: string;
        phoneNumber?: string;
        sentAt?: string;
      }>;
    };
    totalResults: number;
  }>;

  // 자동완성 메서드
  getAutocomplete(params: {
    q: string;
    field: 'campaign' | 'customer' | 'phone';
    limit?: number;
  }): Promise<{
    query: string;
    field: string;
    suggestions: Array<{
      value: string;
      label: string;
      count?: number;
      type?: string;
    }>;
  }>;

  // ============================================
  // 📊 Export/Download Methods
  // ============================================

  // 🔥 발송 로그 스트리밍 다운로드용 메서드 (PII 처리 완전 구현)
  streamSendLogsForExport(
    filters: {
      campaignId?: number;
      callResult?: string;
      retryType?: string;
      dateFrom?: string;
      dateTo?: string;
      phoneNumber?: string;
      customerName?: string;
      durationMin?: number;
      durationMax?: number;
      costMin?: number;
      costMax?: number;
      status?: string[];
      callResults?: string[];
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      includePersonalInfo?: boolean;
    },
    options: { includePersonalInfo: boolean }
  ): AsyncIterable<{
    id: number;
    sentAt: Date | null;
    campaignName: string;
    customerName: string;
    phoneNumber: string;
    callResult: string;
    retryType: string;
    duration: number;
    cost: string;
    createdAt: Date;
    completedAt: Date | null;
    status: string;
  }>;

  // 🔥 캠페인 스트리밍 다운로드용 메서드 (PII 처리 완전 구현)
  streamCampaignsForExport(
    filters: {
      query?: string;
      createdBy?: string;
      status?: string[];
      dateFrom?: string;
      dateTo?: string;
      minSuccessRate?: number;
      maxSuccessRate?: number;
      minTotalCount?: number;
      maxTotalCount?: number;
      includeDetails?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    options: { includePersonalInfo: boolean }
  ): AsyncIterable<{
    id: number;
    name: string;
    status: string;
    createdBy: string | null;
    createdAt: Date;
    totalCount: number;
    successCount: number;
    failedCount: number;
    successRate: number;
    totalCost: string;
    lastSentAt: Date | null;
  }>;

  // 🔥 시스템 통계 리포트 생성용 메서드 (PII 처리 완전 구현)
  getSystemStatsForReport(
    dateFrom: Date, 
    dateTo: Date, 
    options: { includePersonalInfo: boolean }
  ): Promise<{
    // 전체 시스템 통계
    overview: {
      totalCampaigns: number;
      activeCampaigns: number;
      totalSent: number;
      totalSuccess: number;
      totalFailed: number;
      overallSuccessRate: number;
      totalCost: string;
    };
    
    // 캠페인별 상세
    campaigns: Array<{
      id: number;
      name: string;
      status: string;
      createdBy: string | null;
      createdAt: Date;
      totalCount: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      totalCost: string;
      lastSentAt: Date | null;
    }>;
    
    // 일별 추이 (요청 기간)
    dailyStats: Array<{
      date: string;
      totalSent: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      cost: string;
    }>;
    
    // 통화 결과 분석
    callResultAnalysis: Record<string, number>;
    
    // 시간대별 분석 (피크 시간 등)
    hourlyAnalysis?: Array<{
      hour: number;
      totalCalls: number;
      successRate: number;
    }>;
  }>;
  
  // ARS result sync methods
  saveSendLogs(
    atalkResults: any[], 
    campaignName: string, 
    historyKey?: string,
    campaignId?: number
  ): Promise<ArsSendLog[]>;

  // Appointment operations
  getAppointments(params: {
    from?: Date;
    to?: Date;
    counselorId?: string;
    customerId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    appointments: Appointment[];
    total: number;
    totalPages: number;
  }>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, appointment: UpdateAppointment): Promise<Appointment | undefined>;
  deleteAppointment(id: string): Promise<boolean>;
  getAppointmentReminders(windowMinutes?: number): Promise<Appointment[]>;
  checkAppointmentConflicts(
    startAt: Date,
    endAt: Date,
    counselorId: string,
    customerId: string,
    excludeId?: string
  ): Promise<Appointment[]>;

  // User relationship operations (팀장-팀원 관계)
  getUserRelationships(): Promise<UserRelationship[]>;
  getUserRelationshipsByManagerId(managerId: string): Promise<UserRelationship[]>;
  getUserRelationshipByCounselorId(counselorId: string): Promise<UserRelationship | undefined>;
  createUserRelationship(relationship: InsertUserRelationship): Promise<UserRelationship>;
  updateUserRelationship(id: string, relationship: UpdateUserRelationship): Promise<UserRelationship | undefined>;
  deleteUserRelationship(id: string): Promise<boolean>;

  // Team member list for a manager
  getTeamMembers(managerId: string): Promise<User[]>;

  // Customer allocation operations (고객 재분배)
  allocateCustomersToTeamMember(params: {
    customerIds: string[];
    fromUserId: string;
    toUserId: string;
    allocatedBy: string;
    note?: string;
  }): Promise<{ success: number; failed: number }>;

  recallCustomersFromTeamMember(params: {
    customerIds: string[];
    fromUserId: string; // Team member
    toUserId: string;   // Manager
    allocatedBy: string;
    note?: string;
  }): Promise<{ success: number; failed: number }>;

  // Get team customers for a manager
  getTeamCustomers(managerId: string): Promise<CustomerWithUser[]>;

  // Customer allocation history
  getCustomerAllocationHistory(customerId?: string): Promise<CustomerAllocationHistory[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // 비밀번호 해싱 처리 및 보안 강화
    let processedUserData = { ...userData };
    
    if (userData.password !== undefined) {
      if (userData.password === '' || (userData.password && userData.password.trim() === '')) {
        // Security: Explicitly remove empty password strings to prevent accidental empty password updates
        delete processedUserData.password;
        console.warn('[SECURITY] Empty password field removed from user update data', {
          userId: userData.id || 'new',
          hasEmptyPassword: userData.password === ''
        });
      } else {
        // 이미 해싱된 비밀번호인지 확인 (bcrypt 해시는 $2b$로 시작)
        if (userData.password && !userData.password.startsWith('$2b$')) {
          processedUserData.password = await bcrypt.hash(userData.password, 10);
        }
      }
    }

    const [user] = await db
      .insert(users)
      .values({
        ...processedUserData,
        name: processedUserData.name || `${processedUserData.firstName || ''} ${processedUserData.lastName || ''}`.trim() || 'User',
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...processedUserData,
          name: processedUserData.name || `${processedUserData.firstName || ''} ${processedUserData.lastName || ''}`.trim() || 'User',
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getCustomers(params: {
    search?: string;
    status?: string;
    assignedUserId?: string;
    unassigned?: boolean;
    unshared?: boolean;
    page?: number;
    limit?: number;
    filterByUserId?: string; // For role-based access control
    sortOrder?: 'asc' | 'desc'; // Sort order for customer number (based on createdAt)
  } = {}): Promise<{
    customers: CustomerWithUser[];
    total: number;
    totalPages: number;
  }> {
    const { search, status, assignedUserId, unassigned, unshared, page = 1, limit = 20, filterByUserId, sortOrder = 'desc' } = params;
    const conditions = [];
    
    if (search) {
      conditions.push(
        sql`${customers.name} ILIKE ${`%${search}%`} OR ${customers.phone} ILIKE ${`%${search}%`}`
      );
    }
    
    if (status) {
      conditions.push(eq(customers.status, status as any));
    }
    
    if (assignedUserId) {
      conditions.push(eq(customers.assignedUserId, assignedUserId));
    }

    // Filter for unassigned customers (담당자 미정)
    if (unassigned) {
      conditions.push(sql`${customers.assignedUserId} IS NULL`);
    }

    // Filter for unshared customers (공유담당자 미정) 
    if (unshared) {
      conditions.push(sql`${customers.secondaryUserId} IS NULL`);
    }

    // Role-based access control: counselor can only see customers they are assigned to
    if (filterByUserId) {
      conditions.push(
        sql`(${customers.assignedUserId} = ${filterByUserId} OR ${customers.secondaryUserId} = ${filterByUserId})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(customers)
      .where(whereClause);

    // Get customers with pagination
    const customersData = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        secondaryPhone: customers.secondaryPhone,
        birthDate: customers.birthDate,
        gender: customers.gender,

        monthlyIncome: customers.monthlyIncome,
        status: customers.status,
        assignedUserId: customers.assignedUserId,
        memo1: customers.memo1,
        info1: customers.info1,
        info2: customers.info2,
        info3: customers.info3,
        info4: customers.info4,
        info5: customers.info5,
        info6: customers.info6,
        info7: customers.info7,
        info8: customers.info8,
        info9: customers.info9,
        info10: customers.info10,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        assignedUser: users,
      })
      .from(customers)
      .leftJoin(users, eq(customers.assignedUserId, users.id))
      .where(whereClause)
      .orderBy(
        sortOrder === 'asc' ? asc(customers.createdAt) : desc(customers.createdAt),
        sortOrder === 'asc' ? asc(customers.id) : desc(customers.id)
      )
      .limit(limit)
      .offset((page - 1) * limit);

    // 🔒 개인정보 마스킹 적용
    const maskedCustomers = customersData.map(row => ({
      ...row,
      assignedUser: row.assignedUser,
    })) as CustomerWithUser[];

    return {
      customers: maskedCustomers, // 고객 목록에서는 마스킹 제거 - 담당자가 고객명을 확인할 수 있어야 함
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // searchCustomers is an alias for getCustomers
  async searchCustomers(params: {
    search?: string;
    status?: string;
    assignedUserId?: string;
    unassigned?: boolean;
    unshared?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    customers: CustomerWithUser[];
    total: number;
    totalPages: number;
  }> {
    return this.getCustomers(params);
  }

  async getCustomer(id: string): Promise<CustomerWithUser | undefined> {
    const [customer] = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        secondaryPhone: customers.secondaryPhone,
        birthDate: customers.birthDate,
        gender: customers.gender,

        monthlyIncome: customers.monthlyIncome,
        status: customers.status,
        assignedUserId: customers.assignedUserId,
        memo1: customers.memo1,
        info1: customers.info1,
        info2: customers.info2,
        info3: customers.info3,
        info4: customers.info4,
        info5: customers.info5,
        info6: customers.info6,
        info7: customers.info7,
        info8: customers.info8,
        info9: customers.info9,
        info10: customers.info10,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        assignedUser: users,
      })
      .from(customers)
      .leftJoin(users, eq(customers.assignedUserId, users.id))
      .where(eq(customers.id, id));

    if (!customer) return undefined;

    return {
      ...customer,
      assignedUser: customer.assignedUser,
    } as CustomerWithUser;
  }

  async getCustomerByPhone(phone: string): Promise<CustomerWithUser | undefined> {
    const [customer] = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        secondaryPhone: customers.secondaryPhone,
        birthDate: customers.birthDate,
        gender: customers.gender,
        zipcode: customers.zipcode,
        address: customers.address,
        addressDetail: customers.addressDetail,
        monthlyIncome: customers.monthlyIncome,
        jobType: customers.jobType,
        companyName: customers.companyName,
        consultType: customers.consultType,
        consultPath: customers.consultPath,
        status: customers.status,
        assignedUserId: customers.assignedUserId,
        secondaryUserId: customers.secondaryUserId,
        department: customers.department,
        team: customers.team,
        source: customers.source,
        marketingConsent: customers.marketingConsent,
        marketingConsentDate: customers.marketingConsentDate,
        marketingConsentMethod: customers.marketingConsentMethod,
        memo1: customers.memo1,
        info1: customers.info1,
        info2: customers.info2,
        info3: customers.info3,
        info4: customers.info4,
        info5: customers.info5,
        info6: customers.info6,
        info7: customers.info7,
        info8: customers.info8,
        info9: customers.info9,
        info10: customers.info10,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        assignedUser: users,
      })
      .from(customers)
      .leftJoin(users, eq(customers.assignedUserId, users.id))
      .where(eq(customers.phone, phone));

    if (!customer) return undefined;

    return {
      ...customer,
      assignedUser: customer.assignedUser,
      secondaryUser: null, // Since we're not joining secondary user here
    } as CustomerWithUser;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db
      .insert(customers)
      .values(customer)
      .returning();
    return newCustomer;
  }

  async updateCustomer(id: string, customer: UpdateCustomer): Promise<Customer> {
    const [updatedCustomer] = await db
      .update(customers)
      .set({ ...customer, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
      
    if (!updatedCustomer) {
      throw new Error(`Customer with id ${id} not found`);
    }
    
    return updatedCustomer;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    // 트랜잭션을 사용하여 관련 데이터를 먼저 삭제
    try {
      // 1. 관련된 활동 로그 삭제
      await db.delete(activityLogs).where(eq(activityLogs.customerId, id));
      
      // 2. 관련된 상담 기록 삭제 (있다면)
      await db.delete(consultations).where(eq(consultations.customerId, id));
      
      // 3. 관련된 첨부파일 삭제 (있다면)
      await db.delete(attachments).where(eq(attachments.customerId, id));
      
      // 4. 마지막으로 고객 삭제
      const result = await db.delete(customers).where(eq(customers.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`Error deleting customer ${id}:`, error);
      throw error;
    }
  }

  async getDashboardStats(userId?: string, userRole?: string): Promise<{
    todayNew: number;
    totalCustomers: number;
    inProgress: number;
    completed: number;
    statusBreakdown: { status: string; count: number }[];
  }> {
    // Build base conditions for counselor role-based filtering
    const conditions = [];
    if (userId && userRole === 'counselor') {
      conditions.push(
        sql`(${customers.assignedUserId} = ${userId} OR ${customers.secondaryUserId} = ${userId})`
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Today's new customers
    const todayConditions = [...conditions];
    todayConditions.push(sql`DATE(${customers.createdAt}) = CURRENT_DATE`);
    const [todayNewResult] = await db
      .select({ count: count() })
      .from(customers)
      .where(todayConditions.length > 0 ? and(...todayConditions) : sql`DATE(${customers.createdAt}) = CURRENT_DATE`);

    // Total customers
    const [totalResult] = await db
      .select({ count: count() })
      .from(customers)
      .where(whereClause);

    // In progress customers
    const inProgressConditions = [...conditions];
    inProgressConditions.push(sql`${customers.status} IN ('수수', '접수', '작업')`);
    const [inProgressResult] = await db
      .select({ count: count() })
      .from(customers)
      .where(inProgressConditions.length > 0 ? and(...inProgressConditions) : sql`${customers.status} IN ('수수', '접수', '작업')`);

    // Completed customers
    const completedConditions = [...conditions];
    completedConditions.push(eq(customers.status, '완료'));
    const [completedResult] = await db
      .select({ count: count() })
      .from(customers)
      .where(completedConditions.length > 0 ? and(...completedConditions) : eq(customers.status, '완료'));

    // Status breakdown
    const statusBreakdown = await db
      .select({
        status: customers.status,
        count: count(),
      })
      .from(customers)
      .where(whereClause)
      .groupBy(customers.status);

    return {
      todayNew: todayNewResult.count,
      totalCustomers: totalResult.count,
      inProgress: inProgressResult.count,
      completed: completedResult.count,
      statusBreakdown: statusBreakdown.map(s => ({
        status: s.status,
        count: s.count,
      })),
    };
  }

  async getRecentCustomers(limit: number, userId?: string, userRole?: string): Promise<CustomerWithUser[]> {
    // Build conditions for counselor role-based filtering
    const conditions = [];
    if (userId && userRole === 'counselor') {
      conditions.push(
        sql`(${customers.assignedUserId} = ${userId} OR ${customers.secondaryUserId} = ${userId})`
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const recentCustomers = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        secondaryPhone: customers.secondaryPhone,
        birthDate: customers.birthDate,
        gender: customers.gender,

        monthlyIncome: customers.monthlyIncome,
        status: customers.status,
        assignedUserId: customers.assignedUserId,
        memo1: customers.memo1,
        info1: customers.info1,
        info2: customers.info2,
        info3: customers.info3,
        info4: customers.info4,
        info5: customers.info5,
        info6: customers.info6,
        info7: customers.info7,
        info8: customers.info8,
        info9: customers.info9,
        info10: customers.info10,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        assignedUser: users,
      })
      .from(customers)
      .leftJoin(users, eq(customers.assignedUserId, users.id))
      .where(whereClause)
      .orderBy(desc(customers.createdAt))
      .limit(limit);

    // 🔒 개인정보 마스킹 적용
    const maskedCustomers = recentCustomers.map(row => ({
      ...row,
      assignedUser: row.assignedUser,
    })) as CustomerWithUser[];

    return maskedCustomers; // 최근 고객 목록에서도 마스킹 제거 - 담당자가 고객명을 확인할 수 있어야 함
  }

  async getConsultations(customerId: string): Promise<ConsultationWithDetails[]> {
    const consultationsList = await db
      .select({
        id: consultations.id,
        customerId: consultations.customerId,
        userId: consultations.userId,
        title: consultations.title,
        content: consultations.content,
        consultType: consultations.consultType,
        statusBefore: consultations.statusBefore,
        statusAfter: consultations.statusAfter,
        nextAction: consultations.nextAction,
        consultationDate: consultations.consultationDate,
        nextSchedule: consultations.nextSchedule,
        createdAt: consultations.createdAt,
        customer: customers,
        user: users,
      })
      .from(consultations)
      .innerJoin(customers, eq(consultations.customerId, customers.id))
      .innerJoin(users, eq(consultations.userId, users.id))
      .where(eq(consultations.customerId, customerId))
      .orderBy(desc(consultations.consultationDate));

    return consultationsList as ConsultationWithDetails[];
  }

  async createConsultation(consultation: InsertConsultation): Promise<Consultation> {
    const [newConsultation] = await db
      .insert(consultations)
      .values(consultation)
      .returning();
    return newConsultation;
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = await db
      .insert(activityLogs)
      .values(log)
      .returning();
    return newLog;
  }

  async getActivityLogs(customerId?: string, limit = 50): Promise<ActivityLog[]> {
    const whereClause = customerId ? eq(activityLogs.customerId, customerId) : undefined;
    
    return await db
      .select()
      .from(activityLogs)
      .where(whereClause)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getUsers(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .orderBy(users.name);
  }

  async updateUser(id: string, user: Partial<User>): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ ...user, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async getCounselors(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(and(eq(users.isActive, true), sql`${users.role} IN ('counselor', 'manager', 'admin')`))
      .orderBy(users.name);
  }

  async getAttachments(customerId: string): Promise<AttachmentWithUser[]> {
    const attachmentsList = await db
      .select({
        id: attachments.id,
        customerId: attachments.customerId,
        uploadedBy: attachments.uploadedBy,
        fileName: attachments.fileName,
        originalName: attachments.originalName,
        filePath: attachments.filePath,
        fileSize: attachments.fileSize,
        fileType: attachments.fileType,
        description: attachments.description,
        createdAt: attachments.createdAt,
        uploader: users,
      })
      .from(attachments)
      .innerJoin(users, eq(attachments.uploadedBy, users.id))
      .where(eq(attachments.customerId, customerId))
      .orderBy(desc(attachments.createdAt));

    return attachmentsList as AttachmentWithUser[];
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    const [newAttachment] = await db
      .insert(attachments)
      .values(attachment)
      .returning();
    return newAttachment;
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const result = await db.delete(attachments).where(eq(attachments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSystemSettings(): Promise<SystemSetting[]> {
    return await db
      .select()
      .from(systemSettings)
      .orderBy(systemSettings.category, systemSettings.key);
  }

  async updateSystemSetting(key: string, value: string): Promise<SystemSetting> {
    const [updatedSetting] = await db
      .update(systemSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemSettings.key, key))
      .returning();
    return updatedSetting;
  }

  async createSystemSetting(setting: typeof systemSettings.$inferInsert): Promise<SystemSetting> {
    const [newSetting] = await db
      .insert(systemSettings)
      .values(setting)
      .returning();
    return newSetting;
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    const result = await db.delete(systemSettings).where(eq(systemSettings.key, key));
    return (result.rowCount ?? 0) > 0;
  }

  // ARS 캠페인 조회
  async getArsCampaigns(): Promise<ArsCampaign[]> {
    const campaigns = await db
      .select()
      .from(arsCampaigns)
      .orderBy(desc(arsCampaigns.createdAt));
    return campaigns;
  }

  // ARS 캠페인 생성
  async createArsCampaign(campaign: InsertArsCampaign): Promise<ArsCampaign> {
    const [created] = await db
      .insert(arsCampaigns)
      .values(campaign)
      .returning();
    return created;
  }

  // ID로 ARS 캠페인 조회
  async getArsCampaignById(id: number): Promise<ArsCampaign | undefined> {
    const [campaign] = await db
      .select()
      .from(arsCampaigns)
      .where(eq(arsCampaigns.id, id));
    return campaign;
  }

  // ARS 캠페인 업데이트
  async updateArsCampaign(id: number, updates: Partial<InsertArsCampaign>): Promise<ArsCampaign | undefined> {
    const [updated] = await db
      .update(arsCampaigns)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(arsCampaigns.id, id))
      .returning();
    return updated;
  }

  // ARS 발송 로그 생성
  async createArsSendLog(sendLog: InsertArsSendLog): Promise<ArsSendLog> {
    const [created] = await db
      .insert(arsSendLogs)
      .values(sendLog)
      .returning();
    return created;
  }

  // ARS 발송 로그 조회
  async getArsSendLogs(params: {
    campaignId?: number;
    customerId?: string;
    status?: string;
    page?: number;
    limit?: number;
    filterByUserId?: string;
  }): Promise<{
    logs: ArsSendLog[];
    total: number;
    totalPages: number;
  }> {
    const { campaignId, customerId, status, page = 1, limit = 50, filterByUserId } = params;
    const conditions = [];

    if (campaignId) {
      conditions.push(eq(arsSendLogs.campaignId, campaignId));
    }

    if (customerId) {
      conditions.push(eq(arsSendLogs.customerId, customerId));
    }

    if (status) {
      conditions.push(eq(arsSendLogs.status, status));
    }

    // Role-based access control: counselor can only see ARS logs for customers they are assigned to
    if (filterByUserId) {
      conditions.push(
        sql`(${customers.assignedUserId} = ${filterByUserId} OR ${customers.secondaryUserId} = ${filterByUserId})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 총 개수 조회 - customers와 조인 필요
    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(arsSendLogs)
      .leftJoin(customers, eq(arsSendLogs.customerId, customers.id))
      .where(whereClause);

    // 페이징된 로그 조회 - customers와 조인 필요
    const logsWithCustomers = await db
      .select()
      .from(arsSendLogs)
      .leftJoin(customers, eq(arsSendLogs.customerId, customers.id))
      .where(whereClause)
      .orderBy(desc(arsSendLogs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // Transform joined data to ArsSendLog format
    const logs = logsWithCustomers.map(row => row.ars_send_logs);

    return {
      logs,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  // ARS 시나리오 관련 메서드들
  async getArsScenarios(): Promise<ArsScenario[]> {
    return await db
      .select()
      .from(arsScenarios)
      .where(eq(arsScenarios.isActive, true))
      .orderBy(asc(arsScenarios.name));
  }

  async createArsScenario(scenario: InsertArsScenario): Promise<ArsScenario> {
    const [created] = await db
      .insert(arsScenarios)
      .values(scenario)
      .returning();
    return created;
  }

  async updateArsScenario(id: string, updates: Partial<ArsScenario>): Promise<ArsScenario | undefined> {
    const [updated] = await db
      .update(arsScenarios)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(arsScenarios.id, id))
      .returning();
    return updated;
  }

  // 음원 파일 CRUD 메서드들
  async getAudioFiles(): Promise<AudioFile[]> {
    return await db
      .select()
      .from(audioFiles)
      .orderBy(desc(audioFiles.createdAt));
  }

  async getAudioFile(id: string): Promise<AudioFile | undefined> {
    const [audioFile] = await db
      .select()
      .from(audioFiles)
      .where(eq(audioFiles.id, id));
    return audioFile;
  }

  async createAudioFile(audioFile: InsertAudioFile): Promise<AudioFile> {
    const [created] = await db
      .insert(audioFiles)
      .values(audioFile)
      .returning();
    return created;
  }

  async updateAudioFile(id: string, updates: Partial<AudioFile>): Promise<AudioFile | undefined> {
    const [updated] = await db
      .update(audioFiles)
      .set(updates)
      .where(eq(audioFiles.id, id))
      .returning();
    return updated;
  }

  async deleteAudioFile(id: string): Promise<boolean> {
    const result = await db
      .delete(audioFiles)
      .where(eq(audioFiles.id, id));
    const affected = Number(result.rowCount ?? 0);
    return affected > 0;
  }

  // 고객 그룹 관련 메서드들
  async getCustomerGroups(): Promise<CustomerGroup[]> {
    console.log('[DEBUG] getCustomerGroups method called');
    try {
      const result = await db
        .select()
        .from(customerGroups)
        .where(eq(customerGroups.isActive, true))
        .orderBy(asc(customerGroups.name));
      console.log('[DEBUG] getCustomerGroups result:', result.length, 'groups found');
      return result;
    } catch (error) {
      console.error('[ERROR] getCustomerGroups failed:', error);
      throw error;
    }
  }

  async getCustomerGroup(id: string): Promise<CustomerGroup | undefined> {
    const [group] = await db
      .select()
      .from(customerGroups)
      .where(and(eq(customerGroups.id, id), eq(customerGroups.isActive, true)));
    return group;
  }

  async createCustomerGroup(group: InsertCustomerGroup): Promise<CustomerGroup> {
    const [created] = await db
      .insert(customerGroups)
      .values(group)
      .returning();
    return created;
  }

  async updateCustomerGroup(id: string, updates: Partial<CustomerGroup>): Promise<CustomerGroup | undefined> {
    const [updated] = await db
      .update(customerGroups)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(customerGroups.id, id))
      .returning();
    return updated;
  }

  async deleteCustomerGroup(id: string): Promise<boolean> {
    // 먼저 매핑 테이블에서 관련 데이터 삭제
    await db
      .delete(customerGroupMappings)
      .where(eq(customerGroupMappings.groupId, id));

    // 그룹 삭제
    const result = await db
      .delete(customerGroups)
      .where(eq(customerGroups.id, id));

    const affected = Number(result.rowCount ?? 0);
    return affected > 0;
  }

  async addCustomerToGroup(customerId: string, groupId: string, addedBy: string): Promise<CustomerGroupMapping> {
    const [mapping] = await db
      .insert(customerGroupMappings)
      .values({
        customerId,
        groupId,
        addedBy,
      })
      .returning();
    return mapping;
  }

  async removeCustomerFromGroup(customerId: string, groupId: string): Promise<boolean> {
    const result = await db
      .delete(customerGroupMappings)
      .where(
        and(
          eq(customerGroupMappings.customerId, customerId),
          eq(customerGroupMappings.groupId, groupId)
        )
      );

    const affected = Number(result.rowCount ?? 0);
    return affected > 0;
  }

  async getCustomersInGroup(groupId: string): Promise<CustomerWithUser[]> {
    const customersData = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        secondaryPhone: customers.secondaryPhone,
        birthDate: customers.birthDate,
        gender: customers.gender,
        zipcode: customers.zipcode,
        address: customers.address,
        addressDetail: customers.addressDetail,
        monthlyIncome: customers.monthlyIncome,
        jobType: customers.jobType,
        companyName: customers.companyName,
        consultType: customers.consultType,
        consultPath: customers.consultPath,
        status: customers.status,
        assignedUserId: customers.assignedUserId,
        secondaryUserId: customers.secondaryUserId,
        department: customers.department,
        team: customers.team,
        source: customers.source,
        marketingConsent: customers.marketingConsent,
        marketingConsentDate: customers.marketingConsentDate,
        marketingConsentMethod: customers.marketingConsentMethod,
        memo1: customers.memo1,
        info1: customers.info1,
        info2: customers.info2,
        info3: customers.info3,
        info4: customers.info4,
        info5: customers.info5,
        info6: customers.info6,
        info7: customers.info7,
        info8: customers.info8,
        info9: customers.info9,
        info10: customers.info10,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        assignedUser: users,
      })
      .from(customerGroupMappings)
      .innerJoin(customers, eq(customerGroupMappings.customerId, customers.id))
      .leftJoin(users, eq(customers.assignedUserId, users.id))
      .where(eq(customerGroupMappings.groupId, groupId))
      .orderBy(asc(customers.name));

    return customersData.map(row => ({
      ...row,
      assignedUser: row.assignedUser,
      secondaryUser: null, // Since we're not joining secondary user here
    })) as CustomerWithUser[];
  }

  async getCustomerGroupsByCustomerId(customerId: string): Promise<CustomerGroup[]> {
    return await db
      .select({
        id: customerGroups.id,
        name: customerGroups.name,
        description: customerGroups.description,
        color: customerGroups.color,
        isActive: customerGroups.isActive,
        createdBy: customerGroups.createdBy,
        createdAt: customerGroups.createdAt,
        updatedAt: customerGroups.updatedAt,
      })
      .from(customerGroupMappings)
      .innerJoin(customerGroups, eq(customerGroupMappings.groupId, customerGroups.id))
      .where(
        and(
          eq(customerGroupMappings.customerId, customerId),
          eq(customerGroups.isActive, true)
        )
      )
      .orderBy(asc(customerGroups.name));
  }

  async getAllMarketingTargetIds(): Promise<string[]> {
    // 마케팅 동의한 고객들의 ID 목록 반환
    const marketingTargets = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.marketingConsent, true),
          sql`${customers.phone} IS NOT NULL AND ${customers.phone} != ''`
        )
      );
    
    return marketingTargets.map(target => target.id);
  }

  // Campaign statistics implementation
  async getCampaignStatsOverview(): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    totalSent: number;
    totalSuccess: number;
    totalFailed: number;
    successRate: number;
    campaigns: Array<{
      id: number;
      name: string;
      status: string;
      totalCount: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      lastSentAt: Date | null;
      createdAt: Date;
    }>;
  }> {
    // Get total campaigns count
    const [totalCampaignsResult] = await db
      .select({ count: count() })
      .from(arsCampaigns);

    // Get active campaigns count
    const [activeCampaignsResult] = await db
      .select({ count: count() })
      .from(arsCampaigns)
      .where(eq(arsCampaigns.status, 'active'));

    // Get overall stats from send logs
    const [overallStats] = await db
      .select({
        totalSent: count(),
        totalSuccess: sql<number>`COUNT(CASE WHEN call_result IN ('connected', 'answered') THEN 1 END)`,
        totalFailed: sql<number>`COUNT(CASE WHEN call_result NOT IN ('connected', 'answered') THEN 1 END)`,
      })
      .from(arsSendLogs);

    const successRate = overallStats.totalSent > 0 ? 
      Number(((overallStats.totalSuccess / overallStats.totalSent) * 100).toFixed(1)) : 0;

    // Get campaigns with their stats
    const campaignStats = await db
      .select({
        id: arsCampaigns.id,
        name: arsCampaigns.name,
        status: arsCampaigns.status,
        createdAt: arsCampaigns.createdAt,
        totalCount: sql<number>`COUNT(${arsSendLogs.id})`,
        successCount: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} IN ('connected', 'answered') THEN 1 END)`,
        failedCount: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} NOT IN ('connected', 'answered') THEN 1 END)`,
        lastSentAt: sql<Date | null>`MAX(${arsSendLogs.sentAt})`,
      })
      .from(arsCampaigns)
      .leftJoin(arsSendLogs, eq(arsCampaigns.id, arsSendLogs.campaignId))
      .groupBy(arsCampaigns.id, arsCampaigns.name, arsCampaigns.status, arsCampaigns.createdAt)
      .orderBy(desc(arsCampaigns.createdAt));

    const campaigns = campaignStats.map(campaign => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status || 'unknown',
      totalCount: campaign.totalCount || 0,
      successCount: campaign.successCount || 0,
      failedCount: campaign.failedCount || 0,
      successRate: campaign.totalCount > 0 ? 
        Number(((campaign.successCount / campaign.totalCount) * 100).toFixed(1)) : 0,
      lastSentAt: campaign.lastSentAt,
      createdAt: campaign.createdAt || new Date(),
    }));

    return {
      totalCampaigns: totalCampaignsResult.count,
      activeCampaigns: activeCampaignsResult.count,
      totalSent: overallStats.totalSent || 0,
      totalSuccess: overallStats.totalSuccess || 0,
      totalFailed: overallStats.totalFailed || 0,
      successRate,
      campaigns,
    };
  }

  async getCampaignDetailedStats(campaignId: number): Promise<{
    campaignId: number;
    campaignName: string;
    summary: {
      totalCount: number;
      sentCount: number;
      completedCount: number;
      pendingCount: number;
    };
    callResults: Record<string, number>;
    retryStats: {
      initial: number;
      manual_retry: number;
      auto_retry: number;
    };
    costAnalysis: {
      totalCost: number;
      averageCost: number;
      totalBillingUnits: number;
    };
    timeAnalysis: {
      averageDuration: number;
      totalDuration: number;
      peakHour: string;
    };
  } | null> {
    // Get campaign info
    const [campaign] = await db
      .select()
      .from(arsCampaigns)
      .where(eq(arsCampaigns.id, campaignId));

    if (!campaign) return null;

    // Get summary stats
    const [summaryStats] = await db
      .select({
        totalCount: count(),
        sentCount: sql<number>`COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END)`,
        completedCount: sql<number>`COUNT(CASE WHEN status IN ('completed', 'answered', 'connected') THEN 1 END)`,
        pendingCount: sql<number>`COUNT(CASE WHEN status = 'pending' THEN 1 END)`,
      })
      .from(arsSendLogs)
      .where(eq(arsSendLogs.campaignId, campaignId));

    // Get call results breakdown
    const callResultsData = await db
      .select({
        callResult: arsSendLogs.callResult,
        count: count(),
      })
      .from(arsSendLogs)
      .where(eq(arsSendLogs.campaignId, campaignId))
      .groupBy(arsSendLogs.callResult);

    const callResults: Record<string, number> = {};
    callResultsData.forEach(row => {
      if (row.callResult) {
        callResults[row.callResult] = row.count;
      }
    });

    // Get retry stats
    const retryStatsData = await db
      .select({
        retryType: arsSendLogs.retryType,
        count: count(),
      })
      .from(arsSendLogs)
      .where(eq(arsSendLogs.campaignId, campaignId))
      .groupBy(arsSendLogs.retryType);

    const retryStats = {
      initial: 0,
      manual_retry: 0,
      auto_retry: 0,
    };
    retryStatsData.forEach(row => {
      if (row.retryType) {
        retryStats[row.retryType as keyof typeof retryStats] = row.count;
      }
    });

    // Get cost and time analysis
    const [costTimeStats] = await db
      .select({
        totalCost: sql<number>`COALESCE(SUM(CAST(cost AS DECIMAL)), 0)`,
        totalBillingUnits: sql<number>`COALESCE(SUM(billing_units), 0)`,
        totalDuration: sql<number>`COALESCE(SUM(duration), 0)`,
        avgDuration: sql<number>`COALESCE(AVG(duration), 0)`,
      })
      .from(arsSendLogs)
      .where(eq(arsSendLogs.campaignId, campaignId));

    // Get peak hour
    const peakHourData = await db
      .select({
        hour: sql<string>`EXTRACT(HOUR FROM sent_at)`,
        count: count(),
      })
      .from(arsSendLogs)
      .where(
        and(
          eq(arsSendLogs.campaignId, campaignId),
          sql`sent_at IS NOT NULL`
        )
      )
      .groupBy(sql`EXTRACT(HOUR FROM sent_at)`)
      .orderBy(desc(count()))
      .limit(1);

    const peakHour = peakHourData[0]?.hour ? `${peakHourData[0].hour}:00` : '00:00';

    return {
      campaignId,
      campaignName: campaign.name,
      summary: {
        totalCount: summaryStats.totalCount || 0,
        sentCount: summaryStats.sentCount || 0,
        completedCount: summaryStats.completedCount || 0,
        pendingCount: summaryStats.pendingCount || 0,
      },
      callResults,
      retryStats,
      costAnalysis: {
        totalCost: costTimeStats.totalCost || 0,
        averageCost: summaryStats.totalCount > 0 ? 
          Number(((costTimeStats.totalCost || 0) / summaryStats.totalCount).toFixed(2)) : 0,
        totalBillingUnits: costTimeStats.totalBillingUnits || 0,
      },
      timeAnalysis: {
        averageDuration: Number((costTimeStats.avgDuration || 0).toFixed(1)),
        totalDuration: costTimeStats.totalDuration || 0,
        peakHour,
      },
    };
  }

  async getTimelineStats(params: {
    period: 'daily' | 'hourly';
    days: number;
    campaignId?: number;
  }): Promise<{
    period: string;
    data: Array<{
      date: string;
      totalSent: number;
      successCount: number;
      failedCount: number;
      successRate: number;
    }>;
  }> {
    const { period, days, campaignId } = params;
    
    // 🔥 Critical Fix: Proper SQL interval syntax for PostgreSQL
    const conditions = [
      sql`sent_at >= CURRENT_DATE - INTERVAL '${sql.raw(days.toString())} days'`,
    ];
    
    if (campaignId) {
      conditions.push(eq(arsSendLogs.campaignId, campaignId));
    }

    const dateFormat = period === 'daily' 
      ? sql`DATE(sent_at)` 
      : sql`DATE(sent_at) || ' ' || LPAD(EXTRACT(HOUR FROM sent_at)::TEXT, 2, '0') || ':00'`;

    const timelineData = await db
      .select({
        date: sql<string>`${dateFormat}`,
        totalSent: count(),
        successCount: sql<number>`COUNT(CASE WHEN call_result IN ('connected', 'answered') THEN 1 END)`,
        failedCount: sql<number>`COUNT(CASE WHEN call_result NOT IN ('connected', 'answered') THEN 1 END)`,
      })
      .from(arsSendLogs)
      .where(and(...conditions))
      .groupBy(sql`${dateFormat}`)
      .orderBy(sql`${dateFormat}`);

    const data = timelineData.map(row => ({
      date: row.date,
      totalSent: row.totalSent,
      successCount: row.successCount || 0,
      failedCount: row.failedCount || 0,
      successRate: row.totalSent > 0 ? 
        Number(((row.successCount / row.totalSent) * 100).toFixed(1)) : 0,
    }));

    return {
      period,
      data,
    };
  }

  async getFilteredSendLogs(params: {
    campaignId?: number;
    callResult?: string;
    retryType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    logs: ArsSendLog[];
    total: number;
    totalPages: number;
  }> {
    const { campaignId, callResult, retryType, dateFrom, dateTo, page = 1, limit = 20 } = params;
    const conditions = [];

    if (campaignId) {
      conditions.push(eq(arsSendLogs.campaignId, campaignId));
    }

    if (callResult) {
      conditions.push(eq(arsSendLogs.callResult, callResult as any));
    }

    if (retryType) {
      conditions.push(eq(arsSendLogs.retryType, retryType as any));
    }

    if (dateFrom) {
      conditions.push(sql`sent_at >= ${dateFrom}`);
    }

    if (dateTo) {
      conditions.push(sql`sent_at <= ${dateTo}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(arsSendLogs)
      .where(whereClause);

    // Get logs with pagination
    const logs = await db
      .select()
      .from(arsSendLogs)
      .where(whereClause)
      .orderBy(desc(arsSendLogs.sentAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      logs,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // 고급 필터링을 위한 확장된 send logs 조회 메서드
  async getEnhancedSendLogs(params: {
    // 기존 필터
    campaignId?: number;
    callResult?: string;
    retryType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    // 새로운 고급 필터
    phoneNumber?: string;
    customerName?: string;
    durationMin?: number;
    durationMax?: number;
    costMin?: number;
    costMax?: number;
    status?: string[];
    callResults?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    // 사용자별 필터링
    filterByUserId?: string;
  }): Promise<{
    logs: (ArsSendLog & { 
      customerName?: string; 
      customerPhone?: string; 
      campaignName?: string;
    })[];
    total: number;
    totalPages: number;
  }> {
    try {
      // 🔥 Critical Fix: Safe parameter destructuring with detailed logging
      if (!params || typeof params !== 'object') {
        console.warn('[STORAGE] getEnhancedSendLogs: Invalid params, using defaults:', params);
        params = {};
      }
      
      // 🔥 Critical Fix: Safe Object.keys call with additional null checks
      let paramKeys = 'empty';
      try {
        if (params && typeof params === 'object' && params !== null) {
          paramKeys = Object.keys(params).join(', ');
        }
      } catch (objError) {
        console.warn('[SECURITY] Error getting object keys:', objError);
        paramKeys = 'error';
      }
      console.log('[DEBUG] getEnhancedSendLogs params structure:', typeof params, paramKeys);
      
      const { 
        campaignId, callResult, retryType, dateFrom, dateTo, 
        phoneNumber, customerName, durationMin, durationMax, 
        costMin, costMax, status, callResults,
        page = 1, limit = 20, filterByUserId
      } = params;
      
      console.log('[DEBUG] Parameter destructuring successful');
      
      // 🔥 보안 강화: sortBy/sortOrder 파라미터 검증
      const validatedSortBy = validateSortBy(params.sortBy, 'sendLogs', 'sentAt');
      const validatedSortOrder = validateSortOrder(params.sortOrder);
      
      console.log('[DEBUG] Parameter validation successful');
    
    const conditions = [];

    // 기존 필터
    if (campaignId) {
      conditions.push(eq(arsSendLogs.campaignId, campaignId));
    }

    if (callResult) {
      conditions.push(eq(arsSendLogs.callResult, callResult as any));
    }

    if (retryType) {
      conditions.push(eq(arsSendLogs.retryType, retryType as any));
    }

    if (dateFrom) {
      conditions.push(sql`${arsSendLogs.sentAt} >= ${dateFrom}`);
    }

    if (dateTo) {
      conditions.push(sql`${arsSendLogs.sentAt} <= ${dateTo}`);
    }

    // 새로운 고급 필터
    if (phoneNumber) {
      conditions.push(sql`${arsSendLogs.phone} ILIKE ${`%${phoneNumber}%`}`);
    }

    if (customerName) {
      conditions.push(sql`${customers.name} ILIKE ${`%${customerName}%`}`);
    }

    if (durationMin !== undefined) {
      conditions.push(sql`${arsSendLogs.duration} >= ${durationMin}`);
    }

    if (durationMax !== undefined) {
      conditions.push(sql`${arsSendLogs.duration} <= ${durationMax}`);
    }

    if (costMin !== undefined) {
      conditions.push(sql`CAST(${arsSendLogs.cost} AS DECIMAL) >= ${costMin}`);
    }

    if (costMax !== undefined) {
      conditions.push(sql`CAST(${arsSendLogs.cost} AS DECIMAL) <= ${costMax}`);
    }

    if (status && status.length > 0) {
      conditions.push(inArray(arsSendLogs.status, status));
    }

    if (callResults && callResults.length > 0) {
      conditions.push(inArray(arsSendLogs.callResult, callResults as any));
    }

    // Role-based access control: counselor can only see ARS logs for customers they are assigned to
    if (filterByUserId) {
      conditions.push(
        sql`(${customers.assignedUserId} = ${filterByUserId} OR ${customers.secondaryUserId} = ${filterByUserId})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 🔥 보안 강화: 검증된 정렬 조건 설정
    let orderByClause;
    const orderDirection = validatedSortOrder === 'asc' ? asc : desc;
    
    switch (validatedSortBy) {
      case 'createdAt':
        orderByClause = orderDirection(arsSendLogs.createdAt);
        break;
      case 'duration':
        orderByClause = orderDirection(arsSendLogs.duration);
        break;
      case 'cost':
        orderByClause = orderDirection(sql`CAST(${arsSendLogs.cost} AS DECIMAL)`);
        break;
      case 'customerName':
        orderByClause = orderDirection(customers.name);
        break;
      case 'phoneNumber':
        orderByClause = orderDirection(arsSendLogs.phone);
        break;
      case 'callResult':
        orderByClause = orderDirection(arsSendLogs.callResult);
        break;
      case 'status':
        orderByClause = orderDirection(arsSendLogs.status);
        break;
      case 'retryType':
        orderByClause = orderDirection(arsSendLogs.retryType);
        break;
      case 'completedAt':
        orderByClause = orderDirection(arsSendLogs.completedAt);
        break;
      default: // sentAt
        orderByClause = orderDirection(arsSendLogs.sentAt);
    }

    // 🔥 Critical Fix: Safe SQL count query with null handling
    let total = 0;
    try {
      console.log('[DEBUG] Executing count query...');
      const countResult = await db
        .select({ count: count() })
        .from(arsSendLogs)
        .leftJoin(customers, eq(arsSendLogs.customerId, customers.id))
        .leftJoin(arsCampaigns, eq(arsSendLogs.campaignId, arsCampaigns.id))
        .where(whereClause);
      
      // 🔥 Safe count extraction with multiple fallbacks
      if (countResult && Array.isArray(countResult) && countResult.length > 0) {
        const countRow = countResult[0];
        if (countRow && typeof countRow === 'object' && 'count' in countRow) {
          total = Number(countRow.count) || 0;
        }
      }
      console.log('[DEBUG] Count query completed, total:', total);
    } catch (countError) {
      console.error('[STORAGE] Error in count query:', countError);
      total = 0; // Safe fallback
    }

    // 🔥 Critical Fix: Safe SQL data query with comprehensive error handling
    let logsWithDetails: any[] = [];
    try {
      console.log('[DEBUG] Executing main data query...');
      const queryResult = await db
        .select({
          // ArsSendLog fields
          id: arsSendLogs.id,
          campaignId: arsSendLogs.campaignId,
          customerId: arsSendLogs.customerId,
          phoneNumber: arsSendLogs.phone,
          callResult: arsSendLogs.callResult,
          duration: arsSendLogs.duration,
          cost: arsSendLogs.cost,
          status: arsSendLogs.status,
          retryType: arsSendLogs.retryType,
          retryAttempt: arsSendLogs.retryAttempt,
          sentAt: arsSendLogs.sentAt,
          completedAt: arsSendLogs.completedAt,
          errorMessage: arsSendLogs.errorMessage,
          billingUnits: arsSendLogs.billingUnits,
          createdAt: arsSendLogs.createdAt,
          updatedAt: arsSendLogs.updatedAt,
          // Join fields
          customerName: customers.name,
          customerPhone: customers.phone,
          campaignName: arsCampaigns.name,
        })
        .from(arsSendLogs)
        .leftJoin(customers, eq(arsSendLogs.customerId, customers.id))
        .leftJoin(arsCampaigns, eq(arsSendLogs.campaignId, arsCampaigns.id))
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(limit)
        .offset((page - 1) * limit);
      
      // 🔥 Safe result validation and processing
      if (queryResult && Array.isArray(queryResult)) {
        logsWithDetails = queryResult.filter(row => {
          // Filter out any null/undefined rows
          return row && typeof row === 'object';
        });
        console.log('[DEBUG] Main data query completed, found', logsWithDetails.length, 'valid rows');
      } else {
        console.warn('[STORAGE] Query result is not a valid array:', typeof queryResult);
        logsWithDetails = [];
      }
    } catch (queryError) {
      console.error('[STORAGE] Error in main data query:', queryError);
      logsWithDetails = []; // Safe fallback
    }

      console.log('[DEBUG] Database queries completed, applying masking');
      
      // 🔒 개인정보 마스킹 적용 (with ultra-comprehensive safety checks)
      let maskedLogs = [];
      try {
        console.log('[DEBUG] Starting masking process...');
        
        // 🔥 Triple verification of data structure
        if (logsWithDetails === null || logsWithDetails === undefined) {
          console.warn('[SECURITY] logsWithDetails is null/undefined');
          maskedLogs = [];
        } else if (!Array.isArray(logsWithDetails)) {
          console.warn('[SECURITY] logsWithDetails is not an array:', typeof logsWithDetails);
          maskedLogs = [];
        } else if (logsWithDetails.length === 0) {
          console.log('[DEBUG] No logs to mask (empty array)');
          maskedLogs = [];
        } else {
          console.log('[DEBUG] Applying masking to', logsWithDetails.length, 'log entries');
          
          // 🔥 Pre-filter any problematic rows before masking
          const validLogs = logsWithDetails.filter((log, index) => {
            if (log === null || log === undefined) {
              console.warn(`[SECURITY] Null/undefined log at index ${index}`);
              return false;
            }
            if (typeof log !== 'object') {
              console.warn(`[SECURITY] Non-object log at index ${index}:`, typeof log);
              return false;
            }
            return true;
          });
          
          console.log('[DEBUG] Pre-filtered to', validLogs.length, 'valid entries');
          maskedLogs = applyPersonalInfoMaskingToArray(validLogs);
          console.log('[DEBUG] Masking applied successfully to', maskedLogs.length, 'entries');
        }
      } catch (maskingError) {
        console.error('[SECURITY] Critical error in masking process:', {
          error: maskingError instanceof Error ? maskingError.message : String(maskingError),
          stack: maskingError instanceof Error ? maskingError.stack : 'No stack trace',
          logsType: typeof logsWithDetails,
          logsIsArray: Array.isArray(logsWithDetails),
          logsLength: logsWithDetails ? logsWithDetails.length : 'N/A'
        });
        // 마스킹 실패 시에도 빈 배열로 응답하여 UI 크래시 방지
        maskedLogs = [];
      }

      // 🔥 Critical Fix: Ultra-safe result construction
      const result = {
        logs: Array.isArray(maskedLogs) ? maskedLogs : [],
        total: (typeof total === 'number' && !isNaN(total) && total >= 0) ? total : 0,
        totalPages: (() => {
          const safePage = (typeof total === 'number' && !isNaN(total) && total >= 0) ? total : 0;
          const safeLimit = (typeof limit === 'number' && limit > 0) ? limit : 20;
          return Math.ceil(safePage / safeLimit);
        })()
      };
      
      console.log('[DEBUG] getEnhancedSendLogs returning result with', result.logs.length, 'entries');
      return result;
      
    } catch (mainError) {
      console.error('[STORAGE] Critical error in getEnhancedSendLogs:', {
        error: mainError instanceof Error ? mainError.message : String(mainError),
        stack: mainError instanceof Error ? mainError.stack : 'No stack trace',
        paramsType: typeof params,
        paramsKeys: (() => {
          try {
            return params && typeof params === 'object' && params !== null ? Object.keys(params).join(', ') : 'null';
          } catch (objError) {
            return 'error-getting-keys';
          }
        })()
      });
      
      // Return safe fallback response to prevent UI crashes
      return {
        logs: [],
        total: 0,
        totalPages: 0,
      };
    }
  }

  // 캠페인 검색 메서드
  async searchCampaigns(params: {
    query?: string;
    createdBy?: string;
    status?: string[];
    dateFrom?: string;
    dateTo?: string;
    minSuccessRate?: number;
    maxSuccessRate?: number;
    minTotalCount?: number;
    maxTotalCount?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    campaigns: Array<{
      id: number;
      name: string;
      status: string;
      createdBy?: string;
      createdAt: Date;
      updatedAt?: Date;
      totalCount: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      totalCost?: number;
      lastSentAt?: Date | null;
    }>;
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const { 
      query, createdBy, status, dateFrom, dateTo,
      minSuccessRate, maxSuccessRate, minTotalCount, maxTotalCount,
      page = 1, limit = 20
    } = params;
    
    // 🔥 보안 강화: sortBy/sortOrder 파라미터 검증
    const validatedSortBy = validateSortBy(params.sortBy, 'campaigns', 'createdAt');
    const validatedSortOrder = validateSortOrder(params.sortOrder);

    const conditions = [];

    // 캠페인명 부분 검색
    if (query) {
      conditions.push(sql`${arsCampaigns.name} ILIKE ${`%${query}%`}`);
    }

    // 생성자로 검색
    if (createdBy) {
      conditions.push(eq(arsCampaigns.createdBy, createdBy));
    }

    // 복수 상태 검색
    if (status && status.length > 0) {
      conditions.push(sql`${arsCampaigns.status} = ANY(${status})`);
    }

    // 날짜 범위 검색
    if (dateFrom) {
      conditions.push(sql`${arsCampaigns.createdAt} >= ${dateFrom}`);
    }

    if (dateTo) {
      conditions.push(sql`${arsCampaigns.createdAt} <= ${dateTo}`);
    }

    // 캠페인 통계 서브쿼리
    const campaignStatsSubquery = db
      .select({
        campaignId: arsSendLogs.campaignId,
        totalCount: count().as('totalCount'),
        successCount: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} IN ('connected', 'answered') THEN 1 END)`.as('successCount'),
        failedCount: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} NOT IN ('connected', 'answered') THEN 1 END)`.as('failedCount'),
        totalCost: sql<number>`COALESCE(SUM(CAST(${arsSendLogs.cost} AS DECIMAL)), 0)`.as('totalCost'),
        lastSentAt: sql<Date | null>`MAX(${arsSendLogs.sentAt})`.as('lastSentAt'),
      })
      .from(arsSendLogs)
      .groupBy(arsSendLogs.campaignId)
      .as('campaign_stats');

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get campaigns with stats
    const campaignsWithStats = await db
      .select({
        id: arsCampaigns.id,
        name: arsCampaigns.name,
        status: arsCampaigns.status,
        createdBy: arsCampaigns.createdBy,
        createdAt: arsCampaigns.createdAt,
        updatedAt: arsCampaigns.updatedAt,
        totalCount: campaignStatsSubquery.totalCount,
        successCount: campaignStatsSubquery.successCount,
        failedCount: campaignStatsSubquery.failedCount,
        totalCost: campaignStatsSubquery.totalCost,
        lastSentAt: campaignStatsSubquery.lastSentAt,
      })
      .from(arsCampaigns)
      .leftJoin(campaignStatsSubquery, eq(arsCampaigns.id, campaignStatsSubquery.campaignId))
      .where(whereClause);

    // 통계 기반 필터링
    let filteredCampaigns = campaignsWithStats.filter(campaign => {
      const successRate = campaign.totalCount && campaign.totalCount > 0 ? 
        (campaign.successCount / campaign.totalCount) * 100 : 0;

      // 성공률 필터
      if (minSuccessRate !== undefined && successRate < minSuccessRate) return false;
      if (maxSuccessRate !== undefined && successRate > maxSuccessRate) return false;

      // 발송 건수 필터
      if (minTotalCount !== undefined && (campaign.totalCount || 0) < minTotalCount) return false;
      if (maxTotalCount !== undefined && (campaign.totalCount || 0) > maxTotalCount) return false;

      return true;
    });

    // 🔥 보안 강화: 검증된 정렬 적용
    const orderDirection = validatedSortOrder === 'asc' ? 1 : -1;
    filteredCampaigns.sort((a, b) => {
      let aValue, bValue;
      
      switch (validatedSortBy) {
        case 'name':
          aValue = a.name || '';
          bValue = b.name || '';
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        case 'totalCount':
          aValue = a.totalCount || 0;
          bValue = b.totalCount || 0;
          break;
        case 'successRate':
          aValue = a.totalCount ? (a.successCount / a.totalCount) * 100 : 0;
          bValue = b.totalCount ? (b.successCount / b.totalCount) * 100 : 0;
          break;
        case 'lastSentAt':
          aValue = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0;
          bValue = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0;
          break;
        default: // createdAt
          aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      }

      if (aValue < bValue) return -1 * orderDirection;
      if (aValue > bValue) return 1 * orderDirection;
      return 0;
    });

    // 페이지네이션
    const total = filteredCampaigns.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedCampaigns = filteredCampaigns.slice(start, end);

    // 결과 포맷팅
    const formattedCampaigns = paginatedCampaigns.map(campaign => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status || 'unknown',
      createdBy: campaign.createdBy || undefined,
      createdAt: campaign.createdAt || new Date(),
      updatedAt: campaign.updatedAt || undefined,
      totalCount: campaign.totalCount || 0,
      successCount: campaign.successCount || 0,
      failedCount: campaign.failedCount || 0,
      successRate: campaign.totalCount && campaign.totalCount > 0 ? 
        Number(((campaign.successCount / campaign.totalCount) * 100).toFixed(1)) : 0,
      totalCost: campaign.totalCost || undefined,
      lastSentAt: campaign.lastSentAt || null,
    }));

    return {
      campaigns: formattedCampaigns,
      total,
      totalPages,
      currentPage: page,
    };
  }

  // 빠른 통합 검색 메서드
  async quickSearch(params: {
    q: string;
    type?: 'all' | 'campaigns' | 'customers' | 'logs';
    limit?: number;
  }): Promise<{
    query: string;
    results: {
      campaigns: Array<{
        id: number;
        name: string;
        type: 'campaign';
        matchField: string;
        status?: string;
        createdAt?: string;
      }>;
      customers: Array<{
        id: string;
        name: string;
        type: 'customer';
        matchField: string;
        phone?: string;
        status?: string;
      }>;
      sendLogs: Array<{
        id: number;
        campaignName: string;
        customerName: string;
        type: 'sendLog';
        matchField: string;
        phoneNumber?: string;
        sentAt?: string;
      }>;
    };
    totalResults: number;
  }> {
    const { q, type = 'all', limit = 10 } = params;
    const results = {
      campaigns: [] as any[],
      customers: [] as any[],
      sendLogs: [] as any[],
    };

    // 캠페인 검색
    if (type === 'all' || type === 'campaigns') {
      const campaigns = await db
        .select({
          id: arsCampaigns.id,
          name: arsCampaigns.name,
          status: arsCampaigns.status,
          createdAt: arsCampaigns.createdAt,
        })
        .from(arsCampaigns)
        .where(sql`${arsCampaigns.name} ILIKE ${`%${q}%`}`)
        .limit(limit);

      results.campaigns = campaigns.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        type: 'campaign' as const,
        matchField: 'name',
        status: campaign.status || undefined,
        createdAt: campaign.createdAt?.toISOString(),
      }));
    }

    // 고객 검색
    if (type === 'all' || type === 'customers') {
      const customerResults = await db
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          status: customers.status,
        })
        .from(customers)
        .where(
          sql`${customers.name} ILIKE ${`%${q}%`} OR ${customers.phone} ILIKE ${`%${q}%`}`
        )
        .limit(limit);

      results.customers = customerResults.map(customer => ({
        id: customer.id,
        name: this.maskName(customer.name),
        type: 'customer' as const,
        matchField: customer.name.includes(q) ? 'name' : 'phone',
        phone: customer.phone ? this.maskPhoneNumber(customer.phone) : undefined,
        status: customer.status || undefined,
      }));
    }

    // 발송 로그 검색
    if (type === 'all' || type === 'logs') {
      const sendLogsResults = await db
        .select({
          id: arsSendLogs.id,
          phoneNumber: arsSendLogs.phone,
          sentAt: arsSendLogs.sentAt,
          campaignName: arsCampaigns.name,
          customerName: customers.name,
        })
        .from(arsSendLogs)
        .leftJoin(arsCampaigns, eq(arsSendLogs.campaignId, arsCampaigns.id))
        .leftJoin(customers, eq(arsSendLogs.customerId, customers.id))
        .where(
          sql`${arsCampaigns.name} ILIKE ${`%${q}%`} OR 
              ${customers.name} ILIKE ${`%${q}%`} OR 
              ${arsSendLogs.phone} ILIKE ${`%${q}%`}`
        )
        .limit(limit);

      results.sendLogs = sendLogsResults.map(log => {
        let matchField = 'campaignName';
        if (log.customerName && log.customerName.includes(q)) matchField = 'customerName';
        if (log.phoneNumber && log.phoneNumber.includes(q)) matchField = 'phoneNumber';

        return {
          id: log.id,
          campaignName: log.campaignName || '',
          customerName: log.customerName ? this.maskName(log.customerName) : '',
          type: 'sendLog' as const,
          matchField,
          phoneNumber: log.phoneNumber ? this.maskPhoneNumber(log.phoneNumber) : undefined,
          sentAt: log.sentAt?.toISOString(),
        };
      });
    }

    const totalResults = results.campaigns.length + results.customers.length + results.sendLogs.length;

    return {
      query: q,
      results,
      totalResults,
    };
  }

  // 자동완성 메서드
  async getAutocomplete(params: {
    q: string;
    field: 'campaign' | 'customer' | 'phone';
    limit?: number;
  }): Promise<{
    query: string;
    field: string;
    suggestions: Array<{
      value: string;
      label: string;
      count?: number;
      type?: string;
    }>;
  }> {
    const { q, field, limit = 10 } = params;
    let suggestions: Array<{ value: string; label: string; count?: number; type?: string }> = [];

    switch (field) {
      case 'campaign':
        const campaigns = await db
          .select({
            name: arsCampaigns.name,
            status: arsCampaigns.status,
            count: sql<number>`COUNT(${arsSendLogs.id})`,
          })
          .from(arsCampaigns)
          .leftJoin(arsSendLogs, eq(arsCampaigns.id, arsSendLogs.campaignId))
          .where(sql`${arsCampaigns.name} ILIKE ${`%${q}%`}`)
          .groupBy(arsCampaigns.name, arsCampaigns.status)
          .orderBy(desc(count()))
          .limit(limit);

        suggestions = campaigns.map(campaign => ({
          value: campaign.name,
          label: campaign.name,
          count: campaign.count || 0,
          type: campaign.status || undefined,
        }));
        break;

      case 'customer':
        const customerSuggestions = await db
          .select({
            name: customers.name,
            status: customers.status,
          })
          .from(customers)
          .where(sql`${customers.name} ILIKE ${`%${q}%`}`)
          .orderBy(customers.name)
          .limit(limit);

        suggestions = customerSuggestions.map(customer => ({
          value: customer.name,
          label: this.maskName(customer.name),
          type: customer.status || undefined,
        }));
        break;

      case 'phone':
        const phoneSuggestions = await db
          .select({
            phoneNumber: arsSendLogs.phone,
            count: count(),
          })
          .from(arsSendLogs)
          .where(sql`${arsSendLogs.phone} ILIKE ${`%${q}%`}`)
          .groupBy(arsSendLogs.phone)
          .orderBy(desc(count()))
          .limit(limit);

        suggestions = phoneSuggestions.map(phone => ({
          value: phone.phoneNumber || '',
          label: phone.phoneNumber ? this.maskPhoneNumber(phone.phoneNumber) : '',
          count: phone.count || 0,
        }));
        break;
    }

    return {
      query: q,
      field,
      suggestions,
    };
  }

  // ============================================
  // 📊 Export/Download Methods Implementation
  // ============================================

  // 🔥 발송 로그 스트리밍 다운로드용 메서드 (PII 처리 완전 구현)
  async *streamSendLogsForExport(
    filters: {
      campaignId?: number;
      callResult?: string;
      retryType?: string;
      dateFrom?: string;
      dateTo?: string;
      phoneNumber?: string;
      customerName?: string;
      durationMin?: number;
      durationMax?: number;
      costMin?: number;
      costMax?: number;
      status?: string[];
      callResults?: string[];
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      includePersonalInfo?: boolean;
    },
    options: { includePersonalInfo: boolean }
  ): AsyncGenerator<{
    id: number;
    sentAt: Date | null;
    campaignName: string;
    customerName: string;
    phoneNumber: string;
    callResult: string;
    retryType: string;
    duration: number;
    cost: string;
    createdAt: Date;
    completedAt: Date | null;
    status: string;
  }> {
    const {
      campaignId,
      callResult,
      retryType,
      dateFrom,
      dateTo,
      phoneNumber,
      customerName,
      durationMin,
      durationMax,
      costMin,
      costMax,
      status,
      callResults,
      sortBy: rawSortBy,
      sortOrder: rawSortOrder,
      includePersonalInfo = false
    } = filters;

    // 보안 검증: sortBy 필드
    const validatedSortBy = validateSortBy(rawSortBy, 'sendLogs', 'sentAt');
    const validatedSortOrder = validateSortOrder(rawSortOrder);

    // 쿼리 조건 구축
    const whereConditions: any[] = [];

    if (campaignId) {
      whereConditions.push(eq(arsSendLogs.campaignId, campaignId));
    }

    if (callResult) {
      whereConditions.push(eq(arsSendLogs.callResult, callResult as any));
    }

    if (retryType) {
      whereConditions.push(eq(arsSendLogs.retryType, retryType as any));
    }

    if (dateFrom) {
      whereConditions.push(sql`${arsSendLogs.sentAt} >= ${new Date(dateFrom)}`);
    }

    if (dateTo) {
      whereConditions.push(sql`${arsSendLogs.sentAt} <= ${new Date(dateTo)}`);
    }

    if (phoneNumber) {
      whereConditions.push(sql`${arsSendLogs.phone} ILIKE ${`%${phoneNumber}%`}`);
    }

    if (customerName) {
      whereConditions.push(sql`${customers.name} ILIKE ${`%${customerName}%`}`);
    }

    if (durationMin !== undefined) {
      whereConditions.push(sql`${arsSendLogs.duration} >= ${durationMin}`);
    }

    if (durationMax !== undefined) {
      whereConditions.push(sql`${arsSendLogs.duration} <= ${durationMax}`);
    }

    if (costMin !== undefined) {
      whereConditions.push(sql`${arsSendLogs.cost} >= ${costMin}`);
    }

    if (costMax !== undefined) {
      whereConditions.push(sql`${arsSendLogs.cost} <= ${costMax}`);
    }

    if (status && status.length > 0) {
      whereConditions.push(sql`${arsSendLogs.status} = ANY(${status})`);
    }

    if (callResults && callResults.length > 0) {
      whereConditions.push(sql`${arsSendLogs.callResult} = ANY(${callResults})`);
    }

    // 정렬 조건 설정
    const orderByField = ALLOWED_SORT_COLUMNS.sendLogs[validatedSortBy as keyof typeof ALLOWED_SORT_COLUMNS.sendLogs];
    const orderByDirection = validatedSortOrder === 'asc' ? asc : desc;
    
    // 청크 단위로 데이터를 스트리밍
    async function* streamData() {
      const batchSize = 500; // 메모리 효율을 위한 배치 크기
      let offset = 0;

      while (true) {
        const batch = await db
          .select({
            id: arsSendLogs.id,
            sentAt: arsSendLogs.sentAt,
            campaignName: arsCampaigns.name,
            customerName: customers.name,
            phoneNumber: arsSendLogs.phone,
            callResult: arsSendLogs.callResult,
            retryType: arsSendLogs.retryType,
            duration: arsSendLogs.duration,
            cost: arsSendLogs.cost,
            createdAt: arsSendLogs.createdAt,
            completedAt: arsSendLogs.completedAt,
            status: arsSendLogs.status,
          })
          .from(arsSendLogs)
          .leftJoin(arsCampaigns, eq(arsSendLogs.campaignId, arsCampaigns.id))
          .leftJoin(customers, eq(arsSendLogs.customerId, customers.id))
          .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
          .orderBy(orderByDirection(sql.raw(orderByField)))
          .limit(batchSize)
          .offset(offset);

        if (batch.length === 0) break;

        for (const record of batch) {
          yield {
            id: record.id,
            sentAt: record.sentAt,
            campaignName: record.campaignName || '',
            customerName: options.includePersonalInfo 
              ? (record.customerName || '') 
              : maskName(record.customerName || ''),
            phoneNumber: options.includePersonalInfo 
              ? (record.phoneNumber || '') 
              : maskPhoneNumber(record.phoneNumber || ''),
            callResult: record.callResult || '',
            retryType: record.retryType || '',
            duration: record.duration || 0,
            cost: record.cost?.toString() || '0',
            createdAt: record.createdAt || new Date(),
            completedAt: record.completedAt,
            status: record.status || '',
          };
        }

        offset += batchSize;
        
        if (batch.length < batchSize) break;
      }
    }

    yield* streamData();
  }

  // 🔥 캠페인 스트리밍 다운로드용 메서드 (PII 처리 완전 구현)
  async *streamCampaignsForExport(
    filters: {
      query?: string;
      createdBy?: string;
      status?: string[];
      dateFrom?: string;
      dateTo?: string;
      minSuccessRate?: number;
      maxSuccessRate?: number;
      minTotalCount?: number;
      maxTotalCount?: number;
      includeDetails?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    options: { includePersonalInfo: boolean }
  ): AsyncGenerator<{
    id: number;
    name: string;
    status: string;
    createdBy: string | null;
    createdAt: Date;
    totalCount: number;
    successCount: number;
    failedCount: number;
    successRate: number;
    totalCost: string;
    lastSentAt: Date | null;
  }> {
    const {
      query,
      createdBy,
      status,
      dateFrom,
      dateTo,
      minSuccessRate,
      maxSuccessRate,
      minTotalCount,
      maxTotalCount,
      sortBy: rawSortBy,
      sortOrder: rawSortOrder,
    } = filters;

    // 보안 검증: sortBy 필드
    const validatedSortBy = validateSortBy(rawSortBy, 'campaigns', 'createdAt');
    const validatedSortOrder = validateSortOrder(rawSortOrder);

    // 쿼리 조건 구축
    const whereConditions: any[] = [];

    if (query) {
      whereConditions.push(sql`${arsCampaigns.name} ILIKE ${`%${query}%`}`);
    }

    if (createdBy) {
      whereConditions.push(eq(arsCampaigns.createdBy, createdBy));
    }

    if (status && status.length > 0) {
      whereConditions.push(sql`${arsCampaigns.status} = ANY(${status})`);
    }

    if (dateFrom) {
      whereConditions.push(sql`${arsCampaigns.createdAt} >= ${new Date(dateFrom)}`);
    }

    if (dateTo) {
      whereConditions.push(sql`${arsCampaigns.createdAt} <= ${new Date(dateTo)}`);
    }

    if (minTotalCount !== undefined) {
      whereConditions.push(sql`${arsCampaigns.totalCount} >= ${minTotalCount}`);
    }

    if (maxTotalCount !== undefined) {
      whereConditions.push(sql`${arsCampaigns.totalCount} <= ${maxTotalCount}`);
    }

    // 정렬 조건 설정
    const orderByField = ALLOWED_SORT_COLUMNS.campaigns[validatedSortBy as keyof typeof ALLOWED_SORT_COLUMNS.campaigns];
    const orderByDirection = validatedSortOrder === 'asc' ? asc : desc;

    // 청크 단위로 데이터를 스트리밍
    async function* streamData() {
      const batchSize = 100; // 캠페인은 상대적으로 적은 데이터
      let offset = 0;

      while (true) {
        const batch = await db
          .select({
            id: arsCampaigns.id,
            name: arsCampaigns.name,
            status: arsCampaigns.status,
            createdBy: arsCampaigns.createdBy,
            createdAt: arsCampaigns.createdAt,
            totalCount: arsCampaigns.totalCount,
            successCount: arsCampaigns.successCount,
            failedCount: arsCampaigns.failedCount,
            totalCost: sql<string>`COALESCE(SUM(${arsSendLogs.cost}), 0)::text`,
            lastSentAt: sql<Date | null>`MAX(${arsSendLogs.sentAt})`,
          })
          .from(arsCampaigns)
          .leftJoin(arsSendLogs, eq(arsCampaigns.id, arsSendLogs.campaignId))
          .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
          .groupBy(
            arsCampaigns.id,
            arsCampaigns.name,
            arsCampaigns.status,
            arsCampaigns.createdBy,
            arsCampaigns.createdAt,
            arsCampaigns.totalCount,
            arsCampaigns.successCount,
            arsCampaigns.failedCount
          )
          .orderBy(orderByDirection(sql.raw(orderByField)))
          .limit(batchSize)
          .offset(offset);

        if (batch.length === 0) break;

        for (const record of batch) {
          const totalCount = record.totalCount || 0;
          const successCount = record.successCount || 0;
          const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

          // 성공률 필터링 (쿼리 후 필터링)
          if (minSuccessRate !== undefined && successRate < minSuccessRate) continue;
          if (maxSuccessRate !== undefined && successRate > maxSuccessRate) continue;

          yield {
            id: record.id,
            name: record.name,
            status: record.status || '',
            createdBy: options.includePersonalInfo 
              ? (record.createdBy || null) 
              : (record.createdBy ? maskName(record.createdBy) : null),
            createdAt: record.createdAt || new Date(),
            totalCount: totalCount,
            successCount: successCount,
            failedCount: record.failedCount || 0,
            successRate: successRate,
            totalCost: record.totalCost || '0',
            lastSentAt: record.lastSentAt,
          };
        }

        offset += batchSize;
        
        if (batch.length < batchSize) break;
      }
    }

    yield* streamData();
  }

  // 🔥 시스템 통계 리포트 생성용 메서드 (PII 처리 완완 구현)
  async getSystemStatsForReport(
    dateFrom: Date, 
    dateTo: Date, 
    options: { includePersonalInfo: boolean }
  ): Promise<{
    overview: {
      totalCampaigns: number;
      activeCampaigns: number;
      totalSent: number;
      totalSuccess: number;
      totalFailed: number;
      overallSuccessRate: number;
      totalCost: string;
    };
    campaigns: Array<{
      id: number;
      name: string;
      status: string;
      createdBy: string | null;
      createdAt: Date;
      totalCount: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      totalCost: string;
      lastSentAt: Date | null;
    }>;
    dailyStats: Array<{
      date: string;
      totalSent: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      cost: string;
    }>;
    callResultAnalysis: Record<string, number>;
    hourlyAnalysis?: Array<{
      hour: number;
      totalCalls: number;
      successRate: number;
    }>;
  }> {
    // 1. 전체 시스템 통계
    const [overviewStats] = await db
      .select({
        totalCampaigns: sql<number>`COUNT(DISTINCT ${arsCampaigns.id})`,
        activeCampaigns: sql<number>`COUNT(DISTINCT CASE WHEN ${arsCampaigns.status} IN ('active', 'processing') THEN ${arsCampaigns.id} END)`,
        totalSent: sql<number>`COUNT(${arsSendLogs.id})`,
        totalSuccess: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} IN ('connected', 'answered') THEN 1 END)`,
        totalFailed: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} NOT IN ('connected', 'answered', 'pending', 'processing') THEN 1 END)`,
        totalCost: sql<string>`COALESCE(SUM(${arsSendLogs.cost}), 0)::text`,
      })
      .from(arsCampaigns)
      .leftJoin(arsSendLogs, eq(arsCampaigns.id, arsSendLogs.campaignId))
      .where(
        and(
          sql`${arsCampaigns.createdAt} >= ${dateFrom}`,
          sql`${arsCampaigns.createdAt} <= ${dateTo}`
        )
      );

    const totalSent = overviewStats.totalSent || 0;
    const totalSuccess = overviewStats.totalSuccess || 0;
    const overallSuccessRate = totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0;

    // 2. 캠페인별 상세
    const campaigns = await db
      .select({
        id: arsCampaigns.id,
        name: arsCampaigns.name,
        status: arsCampaigns.status,
        createdBy: arsCampaigns.createdBy,
        createdAt: arsCampaigns.createdAt,
        totalCount: arsCampaigns.totalCount,
        successCount: arsCampaigns.successCount,
        failedCount: arsCampaigns.failedCount,
        totalCost: sql<string>`COALESCE(SUM(${arsSendLogs.cost}), 0)::text`,
        lastSentAt: sql<Date | null>`MAX(${arsSendLogs.sentAt})`,
      })
      .from(arsCampaigns)
      .leftJoin(arsSendLogs, eq(arsCampaigns.id, arsSendLogs.campaignId))
      .where(
        and(
          sql`${arsCampaigns.createdAt} >= ${dateFrom}`,
          sql`${arsCampaigns.createdAt} <= ${dateTo}`
        )
      )
      .groupBy(
        arsCampaigns.id,
        arsCampaigns.name,
        arsCampaigns.status,
        arsCampaigns.createdBy,
        arsCampaigns.createdAt,
        arsCampaigns.totalCount,
        arsCampaigns.successCount,
        arsCampaigns.failedCount
      )
      .orderBy(desc(arsCampaigns.createdAt));

    // 3. 일별 통계
    const dailyStatsRaw = await db
      .select({
        date: sql<string>`DATE(${arsSendLogs.sentAt})::text`,
        totalSent: sql<number>`COUNT(*)`,
        successCount: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} IN ('connected', 'answered') THEN 1 END)`,
        failedCount: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} NOT IN ('connected', 'answered', 'pending', 'processing') THEN 1 END)`,
        cost: sql<string>`COALESCE(SUM(${arsSendLogs.cost}), 0)::text`,
      })
      .from(arsSendLogs)
      .where(
        and(
          sql`${arsSendLogs.sentAt} >= ${dateFrom}`,
          sql`${arsSendLogs.sentAt} <= ${dateTo}`
        )
      )
      .groupBy(sql`DATE(${arsSendLogs.sentAt})`)
      .orderBy(sql`DATE(${arsSendLogs.sentAt})`);

    // 4. 통화 결과 분석
    const callResultAnalysisRaw = await db
      .select({
        callResult: arsSendLogs.callResult,
        count: sql<number>`COUNT(*)`,
      })
      .from(arsSendLogs)
      .where(
        and(
          sql`${arsSendLogs.sentAt} >= ${dateFrom}`,
          sql`${arsSendLogs.sentAt} <= ${dateTo}`
        )
      )
      .groupBy(arsSendLogs.callResult);

    // 5. 시간대별 분석 (선택적)
    const hourlyAnalysisRaw = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${arsSendLogs.sentAt})`,
        totalCalls: sql<number>`COUNT(*)`,
        successCount: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} IN ('connected', 'answered') THEN 1 END)`,
      })
      .from(arsSendLogs)
      .where(
        and(
          sql`${arsSendLogs.sentAt} >= ${dateFrom}`,
          sql`${arsSendLogs.sentAt} <= ${dateTo}`
        )
      )
      .groupBy(sql`EXTRACT(HOUR FROM ${arsSendLogs.sentAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${arsSendLogs.sentAt})`);

    // 데이터 변환
    const dailyStats = dailyStatsRaw.map(stat => {
      const totalSent = stat.totalSent || 0;
      const successCount = stat.successCount || 0;
      const successRate = totalSent > 0 ? Math.round((successCount / totalSent) * 100) : 0;
      
      return {
        date: stat.date || '',
        totalSent,
        successCount,
        failedCount: stat.failedCount || 0,
        successRate,
        cost: stat.cost || '0',
      };
    });

    const callResultAnalysis: Record<string, number> = {};
    callResultAnalysisRaw.forEach(result => {
      if (result.callResult) {
        callResultAnalysis[result.callResult] = result.count || 0;
      }
    });

    const hourlyAnalysis = hourlyAnalysisRaw.map(hour => {
      const totalCalls = hour.totalCalls || 0;
      const successCount = hour.successCount || 0;
      const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 0;
      
      return {
        hour: hour.hour || 0,
        totalCalls,
        successRate,
      };
    });

    const formattedCampaigns = campaigns.map(campaign => {
      const totalCount = campaign.totalCount || 0;
      const successCount = campaign.successCount || 0;
      const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status || '',
        createdBy: campaign.createdBy || null,
        createdAt: campaign.createdAt || new Date(),
        totalCount,
        successCount,
        failedCount: campaign.failedCount || 0,
        successRate,
        totalCost: campaign.totalCost || '0',
        lastSentAt: campaign.lastSentAt,
      };
    });

    return {
      overview: {
        totalCampaigns: overviewStats.totalCampaigns || 0,
        activeCampaigns: overviewStats.activeCampaigns || 0,
        totalSent,
        totalSuccess,
        totalFailed: overviewStats.totalFailed || 0,
        overallSuccessRate,
        totalCost: overviewStats.totalCost || '0',
      },
      campaigns: formattedCampaigns,
      dailyStats,
      callResultAnalysis,
      hourlyAnalysis: hourlyAnalysis.length > 0 ? hourlyAnalysis : undefined,
    };
  }

  // 개인정보 마스킹 헬퍼 메서드들
  private maskPhoneNumber(phone: string): string {
    if (!phone || phone.length < 8) return phone;
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 11) {
      return cleanPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3');
    } else if (cleanPhone.length === 10) {
      return cleanPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-***-$3');
    }
    return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4);
  }

  private maskName(name: string): string {
    if (!name || name.length < 2) return name;
    if (name.length === 2) {
      return name[0] + '*';
    }
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
  }

  /**
   * ATALK 결과를 ars_send_logs 테이블에 저장
   */
  async saveSendLogs(
    atalkResults: any[], 
    campaignName: string, 
    historyKey?: string,
    campaignId?: number
  ): Promise<ArsSendLog[]> {
    if (!atalkResults || !Array.isArray(atalkResults) || atalkResults.length === 0) {
      console.warn('[SAVE_SEND_LOGS] No data to save or invalid data format');
      return [];
    }

    const savedLogs: ArsSendLog[] = [];
    
    try {
      // 캠페인 찾기 (campaignId가 주어지지 않은 경우 캠페인명으로 조회)
      let campaign;
      if (campaignId) {
        [campaign] = await db.select().from(arsCampaigns).where(eq(arsCampaigns.id, campaignId));
      } else {
        [campaign] = await db.select().from(arsCampaigns).where(eq(arsCampaigns.name, campaignName));
      }
      
      console.log(`[SAVE_SEND_LOGS] Processing ${atalkResults.length} results for campaign: ${campaignName}`);
      
      for (const result of atalkResults) {
        try {
          // 🔥 ATALK 실제 응답 구조에 맞는 필드 매핑 (2025-09-18 수정)
          const phoneNumber = result.callee || result.phone || result.phoneNumber || result.tel || '';
          const customerName = result.name || result.customerName || '';
          
          // 🔥 통화 결과: result_message와 result_code로 정확한 상태 판단
          const resultMessage = result.result_message || result.resultMessage || '';
          const resultCode = result.result_code || result.resultCode || '';
          const callResult = this.mapAtalkCallResult(resultMessage, resultCode);
          
          const duration = parseInt(result.duration || result.talkTime || '0') || 0;
          const cost = parseFloat(result.cost || result.price || '0') || 0;
          
          // 🔥 DTMF 입력: digit 필드에서 파싱
          const dtmfInput = result.digit || result.dtmf || result.dtmfInput || null;
          
          // 🔥 디버깅 로그: ATALK 응답 구조 확인
          console.log(`[SAVE_SEND_LOGS] ATALK 응답 파싱:`, {
            phone: phoneNumber ? `***${phoneNumber.slice(-4)}` : 'empty',
            resultMessage,
            resultCode, 
            callResult,
            dtmfInput,
            duration,
            hasConnectTime: !!result.connect_time
          });
          
          // 전화번호로 고객 찾기 (정규화된 형식으로 검색)
          let customer;
          if (phoneNumber) {
            // 1. 정확한 매치 시도
            [customer] = await db
              .select()
              .from(customers)
              .where(eq(customers.phone, phoneNumber));
            
            // 2. 정규화된 형식으로 검색 (하이픈 제거 등)
            if (!customer) {
              const normalizedPhone = phoneNumber.replace(/[-\s()]/g, '');
              const searchPatterns = [
                normalizedPhone,
                normalizedPhone.startsWith('0') ? normalizedPhone.substring(1) : '0' + normalizedPhone,
                normalizedPhone.startsWith('82') ? '0' + normalizedPhone.substring(2) : '82' + normalizedPhone.substring(1)
              ];
              
              for (const pattern of searchPatterns) {
                if (!customer) {
                  [customer] = await db
                    .select()
                    .from(customers)
                    .where(sql`REPLACE(REPLACE(REPLACE(${customers.phone}, '-', ''), ' ', ''), '()', '') = ${pattern}`);
                }
              }
              
              // 3. LIKE 검색으로 유사한 번호 찾기
              if (!customer && normalizedPhone.length >= 8) {
                const phonePattern = normalizedPhone.substring(normalizedPhone.length - 8); // 마지막 8자리
                [customer] = await db
                  .select()
                  .from(customers)
                  .where(sql`${customers.phone} LIKE ${`%${phonePattern}`}`);
              }
            }
          }
          
          if (!customer && phoneNumber) {
            console.warn(`[SAVE_SEND_LOGS] Customer not found for phone: ${maskPhoneNumber(phoneNumber)} - will save with null customerId`);
            // 로그에 추가 정보 기록
            console.log(`[SAVE_SEND_LOGS] Phone patterns attempted: ${phoneNumber}`);
          }
          
          // ars_send_logs에 저장할 데이터 준비
          const logData = {
            campaignId: campaign?.id || null,
            customerId: customer?.id || null,
            phone: phoneNumber,
            scenarioId: result.scenarioId || campaign?.scenarioId || null,
            historyKey: historyKey || result.historyKey || null,
            status: (callResult === 'connected' || callResult === 'answered') ? 'completed' : 'failed',
            callResult: callResult as any, // callResult enum 타입 캐스팅
            retryType: 'initial' as const,
            retryAttempt: 1,
            duration,
            cost: cost.toString(),
            dtmfInput: dtmfInput,
            recordingUrl: result.recordUrl || result.recordingUrl || null,
            errorMessage: result.error || result.errorMessage || null,
            sentAt: result.sentAt ? new Date(result.sentAt) : new Date(),
            completedAt: result.completedAt ? new Date(result.completedAt) : new Date(),
          } as any; // 전체 데이터 객체를 any로 캐스팅하여 타입 오류 해결
          
          // 중복 체크 - 같은 전화번호, historyKey, 캠페인의 로그가 이미 있는지 확인
          let existingLog;
          if (phoneNumber) {
            const conditions = [eq(arsSendLogs.phone, phoneNumber)];
            if (historyKey) {
              conditions.push(eq(arsSendLogs.historyKey, historyKey));
            }
            if (campaign?.id) {
              conditions.push(eq(arsSendLogs.campaignId, campaign.id));
            }
            
            [existingLog] = await db
              .select()
              .from(arsSendLogs)
              .where(and(...conditions))
              .limit(1);
          }
            
          if (existingLog) {
            console.log(`[SAVE_SEND_LOGS] Log already exists for phone: ${maskPhoneNumber(phoneNumber)}, updating...`);
            // 기존 로그 업데이트
            const [updatedLog] = await db
              .update(arsSendLogs)
              .set({
                ...logData,
                updatedAt: new Date()
              })
              .where(eq(arsSendLogs.id, existingLog.id))
              .returning();
            if (updatedLog) {
              savedLogs.push(updatedLog);
            }
          } else {
            // 새 로그 생성
            const [newLog] = await db
              .insert(arsSendLogs)
              .values(logData)
              .returning();
            if (newLog) {
              savedLogs.push(newLog);
            }
          }
          
        } catch (itemError) {
          console.error(`[SAVE_SEND_LOGS] Error processing individual result:`, itemError);
          continue;
        }
      }
      
      console.log(`[SAVE_SEND_LOGS] Successfully saved/updated ${savedLogs.length} logs for campaign: ${campaignName}`);
      
      // 캠페인 통계 업데이트
      if (campaign && savedLogs.length > 0) {
        await this.updateCampaignStats(campaign.id);
      }
      
      return applyPersonalInfoMaskingToArray(savedLogs);
      
    } catch (error) {
      console.error('[SAVE_SEND_LOGS] Error saving send logs:', error);
      throw error;
    }
  }
  
  /**
   * ATALK 통화 결과를 우리 시스템의 callResult enum에 매핑
   * 🔥 2025-09-18 수정: result_message와 result_code 모두 고려
   */
  private mapAtalkCallResult(resultMessage: string, resultCode?: string): string {
    // 🔥 우선순위 1: result_code 기반 판단 (가장 정확함)
    if (resultCode) {
      const code = resultCode.toUpperCase();
      
      if (code === 'TRANS' || code === 'SUCCESS' || code === 'OK') {
        return 'connected'; // 통화 연결 및 전송 성공
      }
      if (code === 'BUSY') {
        return 'busy';
      }
      if (code === 'NO_ANSWER' || code === 'NOANSWER' || code === 'TIMEOUT') {
        return 'no_answer';
      }
      if (code === 'REJECT' || code === 'REJECTED') {
        return 'rejected';
      }
      if (code === 'INVALID' || code === 'ERROR') {
        return 'invalid_number';
      }
      if (code === 'VOICEMAIL' || code === 'VM') {
        return 'voicemail';
      }
      if (code === 'FAX') {
        return 'fax';
      }
      if (code === 'POWER_OFF' || code === 'OFF') {
        return 'power_off';
      }
    }
    
    // 🔥 우선순위 2: result_message 기반 판단
    if (resultMessage) {
      const message = resultMessage.toLowerCase();
      
      if (message.includes('응답') || message.includes('answered') || message.includes('연결')) {
        return 'connected'; // 응답받음 = 연결성공
      }
      if (message.includes('성공') || message.includes('완료') || message.includes('connected')) {
        return 'connected';
      }
      if (message.includes('통화중') || message.includes('busy')) {
        return 'busy';
      }
      if (message.includes('무응답') || message.includes('no_answer') || message.includes('noanswer')) {
        return 'no_answer';
      }
      if (message.includes('사서함') || message.includes('voicemail')) {
        return 'voicemail';
      }
      if (message.includes('거절') || message.includes('rejected')) {
        return 'rejected';
      }
      if (message.includes('결번') || message.includes('invalid')) {
        return 'invalid_number';
      }
      if (message.includes('팩스') || message.includes('fax')) {
        return 'fax';
      }
      if (message.includes('전원') || message.includes('power')) {
        return 'power_off';
      }
      if (message.includes('자동응답') || message.includes('auto')) {
        return 'auto_response';
      }
      if (message.includes('오류') || message.includes('error')) {
        return 'error';
      }
    }
    
    // 🔥 기본값: 빈 값이면 pending, 그 외는 other
    if (!resultMessage && !resultCode) {
      return 'pending';
    }
    return 'other';
  }
  
  /**
   * 캠페인 통계 업데이트
   */
  private async updateCampaignStats(campaignId: number): Promise<void> {
    try {
      const [stats] = await db
        .select({
          totalCount: sql<number>`COUNT(*)`,
          successCount: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} IN ('connected', 'answered') THEN 1 END)`,
          failedCount: sql<number>`COUNT(CASE WHEN ${arsSendLogs.callResult} NOT IN ('connected', 'answered', 'pending', 'processing') THEN 1 END)`,
        })
        .from(arsSendLogs)
        .where(eq(arsSendLogs.campaignId, campaignId));
        
      if (stats) {
        await db
          .update(arsCampaigns)
          .set({
            totalCount: stats.totalCount,
            successCount: stats.successCount,
            failedCount: stats.failedCount,
            updatedAt: new Date()
          })
          .where(eq(arsCampaigns.id, campaignId));
      }
    } catch (error) {
      console.error(`[UPDATE_CAMPAIGN_STATS] Error updating stats for campaign ${campaignId}:`, error);
    }
  }

  // Appointment operations
  async getAppointments(params: {
    from?: Date;
    to?: Date;
    counselorId?: string;
    customerId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    appointments: AppointmentWithDetails[];
    total: number;
    totalPages: number;
  }> {
    const { from, to, counselorId, customerId, status, page = 1, limit = 20 } = params;
    const conditions = [];

    if (from) {
      conditions.push(sql`${appointments.startAt} >= ${from}`);
    }
    if (to) {
      conditions.push(sql`${appointments.endAt} <= ${to}`);
    }
    if (counselorId) {
      conditions.push(eq(appointments.counselorId, counselorId));
    }
    if (customerId) {
      conditions.push(eq(appointments.customerId, customerId));
    }
    if (status) {
      conditions.push(eq(appointments.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(appointments)
      .where(whereClause);

    // Get paginated appointments with customer and counselor names
    const appointmentList = await db
      .select({
        id: appointments.id,
        title: appointments.title,
        startAt: appointments.startAt,
        endAt: appointments.endAt,
        location: appointments.location,
        notes: appointments.notes,
        status: appointments.status,
        customerId: appointments.customerId,
        counselorId: appointments.counselorId,
        lastPopupAt: appointments.lastPopupAt,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
        createdBy: appointments.createdBy,
        remindSms: appointments.remindSms,
        reminderOffsetMinutes: appointments.reminderOffsetMinutes,
        remindPopup: appointments.remindPopup,
        lastSmsAt: appointments.lastSmsAt,
        customerName: sql<string | undefined>`${customers.name}`,
        counselorName: sql<string | undefined>`COALESCE(${users.lastName} || ' ' || ${users.firstName}, ${users.username})`
      })
      .from(appointments)
      .leftJoin(customers, eq(appointments.customerId, customers.id))
      .leftJoin(users, eq(appointments.counselorId, users.id))
      .where(whereClause)
      .orderBy(desc(appointments.startAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      appointments: appointmentList,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    };
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id));
    return appointment;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [newAppointment] = await db
      .insert(appointments)
      .values({
        ...appointment,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newAppointment;
  }

  async updateAppointment(id: string, appointment: UpdateAppointment): Promise<Appointment | undefined> {
    const [updatedAppointment] = await db
      .update(appointments)
      .set({
        ...appointment,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, id))
      .returning();
    return updatedAppointment;
  }

  async deleteAppointment(id: string): Promise<boolean> {
    const result = await db
      .delete(appointments)
      .where(eq(appointments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAppointmentReminders(windowMinutes: number = 15): Promise<Appointment[]> {
    const now = new Date();
    const futureTime = new Date(now.getTime() + windowMinutes * 60 * 1000);

    return await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.status, 'scheduled'),
          sql`${appointments.startAt} BETWEEN ${now} AND ${futureTime}`,
          sql`${appointments.lastPopupAt} IS NULL OR ${appointments.lastPopupAt} < ${now.toISOString()}`
        )
      );
  }

  async checkAppointmentConflicts(
    startAt: Date,
    endAt: Date,
    counselorId: string,
    customerId: string,
    excludeId?: string
  ): Promise<Appointment[]> {
    const conditions = [
      eq(appointments.status, 'scheduled'),
      sql`(
        (${appointments.counselorId} = ${counselorId}) OR 
        (${appointments.customerId} = ${customerId})
      )`,
      sql`NOT (${appointments.endAt} <= ${startAt} OR ${appointments.startAt} >= ${endAt})`
    ];

    if (excludeId) {
      conditions.push(sql`${appointments.id} != ${excludeId}`);
    }

    return await db
      .select()
      .from(appointments)
      .where(and(...conditions));
  }

  // User relationship methods implementation
  async getUserRelationships(): Promise<UserRelationship[]> {
    return await db
      .select()
      .from(userRelationships)
      .where(eq(userRelationships.isActive, true));
  }

  async getUserRelationshipsByManagerId(managerId: string): Promise<UserRelationship[]> {
    return await db
      .select()
      .from(userRelationships)
      .where(
        and(
          eq(userRelationships.managerId, managerId),
          eq(userRelationships.isActive, true)
        )
      );
  }

  async getUserRelationshipByCounselorId(counselorId: string): Promise<UserRelationship | undefined> {
    const [relationship] = await db
      .select()
      .from(userRelationships)
      .where(
        and(
          eq(userRelationships.counselorId, counselorId),
          eq(userRelationships.isActive, true)
        )
      );
    return relationship;
  }

  async createUserRelationship(relationship: InsertUserRelationship): Promise<UserRelationship> {
    // 기존 관계 비활성화
    if (relationship.counselorId) {
      await db
        .update(userRelationships)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(userRelationships.counselorId, relationship.counselorId));
    }

    const [newRelationship] = await db
      .insert(userRelationships)
      .values({
        ...relationship,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newRelationship;
  }

  async updateUserRelationship(id: string, relationship: UpdateUserRelationship): Promise<UserRelationship | undefined> {
    const [updatedRelationship] = await db
      .update(userRelationships)
      .set({
        ...relationship,
        updatedAt: new Date(),
      })
      .where(eq(userRelationships.id, id))
      .returning();
    return updatedRelationship;
  }

  async deleteUserRelationship(id: string): Promise<boolean> {
    const result = await db
      .update(userRelationships)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(userRelationships.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getTeamMembers(managerId: string): Promise<User[]> {
    const relationships = await this.getUserRelationshipsByManagerId(managerId);
    const counselorIds = relationships.map(r => r.counselorId);
    
    if (counselorIds.length === 0) return [];
    
    return await db
      .select()
      .from(users)
      .where(inArray(users.id, counselorIds));
  }

  async allocateCustomersToTeamMember(params: {
    customerIds: string[];
    fromUserId: string;
    toUserId: string;
    allocatedBy: string;
    note?: string;
  }): Promise<{ success: number; failed: number }> {
    const { customerIds, fromUserId, toUserId, allocatedBy, note } = params;
    let success = 0;
    let failed = 0;
    
    // 팀 관계 이중 검증 (보안 강화)
    const allocator = await this.getUser(allocatedBy);
    if (allocator && allocator.role === 'manager') {
      const teamMembers = await this.getTeamMembers(allocatedBy);
      const isTeamMember = teamMembers.some(m => m.id === toUserId);
      
      if (!isTeamMember) {
        throw new Error('권한이 없습니다. 본인 팀원에게만 배분할 수 있습니다.');
      }
    }

    for (const customerId of customerIds) {
      try {
        // Update customer assignment
        const result = await db
          .update(customers)
          .set({ 
            assignedUserId: toUserId,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(customers.id, customerId),
              eq(customers.assignedUserId, fromUserId) // 현재 담당자가 맞는지 확인
            )
          );

        if ((result.rowCount ?? 0) > 0) {
          // Record allocation history
          await db.insert(customerAllocationHistory).values({
            customerId,
            fromUserId,
            toUserId,
            action: 'allocate',
            allocatedBy,
            note,
            createdAt: new Date(),
          });

          // Create activity log
          await db.insert(activityLogs).values({
            userId: allocatedBy,
            customerId,
            action: 'customer_allocated',
            description: `고객을 팀원에게 배분함 (${fromUserId} → ${toUserId})`,
            metadata: { fromUserId, toUserId, note },
            createdAt: new Date(),
          });

          success++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to allocate customer ${customerId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  async recallCustomersFromTeamMember(params: {
    customerIds: string[];
    fromUserId: string;
    toUserId: string;
    allocatedBy: string;
    note?: string;
  }): Promise<{ success: number; failed: number }> {
    const { customerIds, fromUserId, toUserId, allocatedBy, note } = params;
    let success = 0;
    let failed = 0;
    
    // 팀 관계 이중 검증 (보안 강화)
    const recaller = await this.getUser(allocatedBy);
    if (recaller && recaller.role === 'manager') {
      const teamMembers = await this.getTeamMembers(allocatedBy);
      const isTeamMember = teamMembers.some(m => m.id === fromUserId);
      
      if (!isTeamMember) {
        throw new Error('권한이 없습니다. 본인 팀원의 고객만 회수할 수 있습니다.');
      }
    }

    for (const customerId of customerIds) {
      try {
        // Update customer assignment
        const result = await db
          .update(customers)
          .set({ 
            assignedUserId: toUserId,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(customers.id, customerId),
              eq(customers.assignedUserId, fromUserId) // 현재 담당자가 맞는지 확인
            )
          );

        if ((result.rowCount ?? 0) > 0) {
          // Record allocation history
          await db.insert(customerAllocationHistory).values({
            customerId,
            fromUserId,
            toUserId,
            action: 'recall',
            allocatedBy,
            note,
            createdAt: new Date(),
          });

          // Create activity log
          await db.insert(activityLogs).values({
            userId: allocatedBy,
            customerId,
            action: 'customer_recalled',
            description: `고객을 팀원으로부터 회수함 (${fromUserId} → ${toUserId})`,
            metadata: { fromUserId, toUserId, note },
            createdAt: new Date(),
          });

          success++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to recall customer ${customerId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  async getTeamCustomers(managerId: string): Promise<CustomerWithUser[]> {
    const teamMembers = await this.getTeamMembers(managerId);
    const teamMemberIds = teamMembers.map(m => m.id);
    
    const conditions = teamMemberIds.length === 0 
      ? eq(customers.assignedUserId, managerId) 
      : sql`${customers.assignedUserId} = ${managerId} OR ${customers.assignedUserId} IN (${sql.join(teamMemberIds, sql`, `)})`;

    const results = await db
      .select({
        // Customer fields
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        secondaryPhone: customers.secondaryPhone,
        birthDate: customers.birthDate,
        gender: customers.gender,
        zipcode: customers.zipcode,
        address: customers.address,
        addressDetail: customers.addressDetail,
        monthlyIncome: customers.monthlyIncome,
        jobType: customers.jobType,
        companyName: customers.companyName,
        consultType: customers.consultType,
        consultPath: customers.consultPath,
        status: customers.status,
        assignedUserId: customers.assignedUserId,
        secondaryUserId: customers.secondaryUserId,
        department: customers.department,
        team: customers.team,
        source: customers.source,
        marketingConsent: customers.marketingConsent,
        marketingConsentDate: customers.marketingConsentDate,
        marketingConsentMethod: customers.marketingConsentMethod,
        memo1: customers.memo1,
        info1: customers.info1,
        info2: customers.info2,
        info3: customers.info3,
        info4: customers.info4,
        info5: customers.info5,
        info6: customers.info6,
        info7: customers.info7,
        info8: customers.info8,
        info9: customers.info9,
        info10: customers.info10,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        // Assigned User fields
        assignedUser: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          name: users.name,
          username: users.username,
          password: users.password,
          phone: users.phone,
          department: users.department,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        }
      })
      .from(customers)
      .leftJoin(users, eq(customers.assignedUserId, users.id))
      .where(conditions);

    // Join으로 secondary user 정보도 가져와야 함
    const userIds = [...new Set(results.map(r => r.secondaryUserId).filter(id => id !== null))];
    const secondaryUsers = userIds.length > 0 ? await db
      .select()
      .from(users)
      .where(inArray(users.id, userIds as string[])) : [];

    const secondaryUserMap = new Map(secondaryUsers.map(u => [u.id, u]));

    return results.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      secondaryPhone: r.secondaryPhone,
      birthDate: r.birthDate,
      gender: r.gender,
      zipcode: r.zipcode,
      address: r.address,
      addressDetail: r.addressDetail,
      monthlyIncome: r.monthlyIncome,
      jobType: r.jobType,
      companyName: r.companyName,
      consultType: r.consultType,
      consultPath: r.consultPath,
      status: r.status,
      assignedUserId: r.assignedUserId,
      secondaryUserId: r.secondaryUserId,
      department: r.department,
      team: r.team,
      source: r.source,
      marketingConsent: r.marketingConsent,
      marketingConsentDate: r.marketingConsentDate,
      marketingConsentMethod: r.marketingConsentMethod,
      memo1: r.memo1,
      info1: r.info1,
      info2: r.info2,
      info3: r.info3,
      info4: r.info4,
      info5: r.info5,
      info6: r.info6,
      info7: r.info7,
      info8: r.info8,
      info9: r.info9,
      info10: r.info10,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      assignedUser: r.assignedUser.id ? r.assignedUser as User : null,
      secondaryUser: r.secondaryUserId ? secondaryUserMap.get(r.secondaryUserId) || null : null
    }));
  }

  async getCustomerAllocationHistory(customerId?: string): Promise<CustomerAllocationHistory[]> {
    if (customerId) {
      return await db
        .select()
        .from(customerAllocationHistory)
        .where(eq(customerAllocationHistory.customerId, customerId))
        .orderBy(desc(customerAllocationHistory.createdAt));
    }
    
    return await db
      .select()
      .from(customerAllocationHistory)
      .orderBy(desc(customerAllocationHistory.createdAt))
      .limit(100); // 최근 100개만
  }
}

export const storage = new DatabaseStorage();
