import {
  users,
  customers,
  consultations,
  activityLogs,
  attachments,
  systemSettings,
  arsCampaigns,
  arsSendLogs,
  arsScenarios,
  audioFiles,
  customerGroups,
  customerGroupMappings,
  arsCampaignStats,
  arsDailyStats,
  arsHourlyStats,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, like, and, count, sql } from "drizzle-orm";
import { maskPhoneNumber, maskName } from "./securityUtils";

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
  if (sortOrder === 'asc' || sortOrder === 'desc') {
    return sortOrder;
  }
  return 'desc'; // 기본값
}

/**
 * 개인정보 마스킹을 위한 헬퍼 함수
 * 모든 응답에서 일관성 있는 마스킹 적용
 */
function applyPersonalInfoMasking<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== 'object') return data;

  const masked = { ...data };
  
  // 이름 필드 마스킹
  if (masked.name && typeof masked.name === 'string') {
    masked.name = maskName(masked.name);
  }
  if (masked.customerName && typeof masked.customerName === 'string') {
    masked.customerName = maskName(masked.customerName);
  }
  
  // 전화번호 필드 마스킹
  if (masked.phone && typeof masked.phone === 'string') {
    masked.phone = maskPhoneNumber(masked.phone);
  }
  if (masked.phoneNumber && typeof masked.phoneNumber === 'string') {
    masked.phoneNumber = maskPhoneNumber(masked.phoneNumber);
  }
  if (masked.secondaryPhone && typeof masked.secondaryPhone === 'string') {
    masked.secondaryPhone = maskPhoneNumber(masked.secondaryPhone);
  }
  if (masked.customerPhone && typeof masked.customerPhone === 'string') {
    masked.customerPhone = maskPhoneNumber(masked.customerPhone);
  }

  return masked;
}

/**
 * 배열 데이터에 개인정보 마스킹 적용
 */
function applyPersonalInfoMaskingToArray<T extends Record<string, any>>(data: T[]): T[] {
  return data.map(item => applyPersonalInfoMasking(item));
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
  getDashboardStats(): Promise<{
    todayNew: number;
    totalCustomers: number;
    inProgress: number;
    completed: number;
    statusBreakdown: { status: string; count: number }[];
  }>;

  // Recent customers for dashboard
  getRecentCustomers(limit: number): Promise<CustomerWithUser[]>;

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
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        name: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'User',
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          name: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'User',
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
  } = {}): Promise<{
    customers: CustomerWithUser[];
    total: number;
    totalPages: number;
  }> {
    const { search, status, assignedUserId, unassigned, unshared, page = 1, limit = 20 } = params;
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
        memo: customers.memo,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        assignedUser: users,
      })
      .from(customers)
      .leftJoin(users, eq(customers.assignedUserId, users.id))
      .where(whereClause)
      .orderBy(asc(customers.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // 🔒 개인정보 마스킹 적용
    const maskedCustomers = customersData.map(row => ({
      ...row,
      assignedUser: row.assignedUser,
    })) as CustomerWithUser[];

    return {
      customers: applyPersonalInfoMaskingToArray(maskedCustomers),
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
        memo: customers.memo,
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

  async getDashboardStats(): Promise<{
    todayNew: number;
    totalCustomers: number;
    inProgress: number;
    completed: number;
    statusBreakdown: { status: string; count: number }[];
  }> {
    // Today's new customers
    const [todayNewResult] = await db
      .select({ count: count() })
      .from(customers)
      .where(sql`DATE(${customers.createdAt}) = CURRENT_DATE`);

    // Total customers
    const [totalResult] = await db
      .select({ count: count() })
      .from(customers);

    // In progress customers
    const [inProgressResult] = await db
      .select({ count: count() })
      .from(customers)
      .where(sql`${customers.status} IN ('수수', '접수', '작업')`);

    // Completed customers
    const [completedResult] = await db
      .select({ count: count() })
      .from(customers)
      .where(eq(customers.status, '완료'));

    // Status breakdown
    const statusBreakdown = await db
      .select({
        status: customers.status,
        count: count(),
      })
      .from(customers)
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

  async getRecentCustomers(limit: number): Promise<CustomerWithUser[]> {
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
        memo: customers.memo,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        assignedUser: users,
      })
      .from(customers)
      .leftJoin(users, eq(customers.assignedUserId, users.id))
      .orderBy(desc(customers.createdAt))
      .limit(limit);

    // 🔒 개인정보 마스킹 적용
    const maskedCustomers = recentCustomers.map(row => ({
      ...row,
      assignedUser: row.assignedUser,
    })) as CustomerWithUser[];

    return applyPersonalInfoMaskingToArray(maskedCustomers);
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
  }): Promise<{
    logs: ArsSendLog[];
    total: number;
    totalPages: number;
  }> {
    const { campaignId, customerId, status, page = 1, limit = 50 } = params;
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

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 총 개수 조회
    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(arsSendLogs)
      .where(whereClause);

    // 페이징된 로그 조회
    const logs = await db
      .select()
      .from(arsSendLogs)
      .where(whereClause)
      .orderBy(desc(arsSendLogs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

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
        memo: customers.memo,
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
    
    const conditions = [
      sql`sent_at >= CURRENT_DATE - INTERVAL '${days} days'`,
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
  }): Promise<{
    logs: (ArsSendLog & { 
      customerName?: string; 
      customerPhone?: string; 
      campaignName?: string;
    })[];
    total: number;
    totalPages: number;
  }> {
    const { 
      campaignId, callResult, retryType, dateFrom, dateTo, 
      phoneNumber, customerName, durationMin, durationMax, 
      costMin, costMax, status, callResults,
      page = 1, limit = 20
    } = params;
    
    // 🔥 보안 강화: sortBy/sortOrder 파라미터 검증
    const validatedSortBy = validateSortBy(params.sortBy, 'sendLogs', 'sentAt');
    const validatedSortOrder = validateSortOrder(params.sortOrder);
    
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
      conditions.push(sql`${arsSendLogs.phoneNumber} ILIKE ${`%${phoneNumber}%`}`);
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
      conditions.push(sql`${arsSendLogs.status} = ANY(${status})`);
    }

    if (callResults && callResults.length > 0) {
      conditions.push(sql`${arsSendLogs.callResult} = ANY(${callResults})`);
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
        orderByClause = orderDirection(arsSendLogs.phoneNumber);
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

    // Get total count
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(arsSendLogs)
      .leftJoin(customers, eq(arsSendLogs.customerId, customers.id))
      .leftJoin(arsCampaigns, eq(arsSendLogs.campaignId, arsCampaigns.id))
      .where(whereClause);

    // Get logs with joins and pagination
    const logsWithDetails = await db
      .select({
        // ArsSendLog fields
        id: arsSendLogs.id,
        campaignId: arsSendLogs.campaignId,
        customerId: arsSendLogs.customerId,
        phoneNumber: arsSendLogs.phoneNumber,
        callResult: arsSendLogs.callResult,
        duration: arsSendLogs.duration,
        cost: arsSendLogs.cost,
        status: arsSendLogs.status,
        retryType: arsSendLogs.retryType,
        retryCount: arsSendLogs.retryCount,
        sentAt: arsSendLogs.sentAt,
        completedAt: arsSendLogs.completedAt,
        failureReason: arsSendLogs.failureReason,
        responseData: arsSendLogs.responseData,
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

    // 🔒 개인정보 마스킹 적용
    const maskedLogs = applyPersonalInfoMaskingToArray(logsWithDetails);

    return {
      logs: maskedLogs,
      total,
      totalPages: Math.ceil(total / limit),
    };
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
          phoneNumber: arsSendLogs.phoneNumber,
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
              ${arsSendLogs.phoneNumber} ILIKE ${`%${q}%`}`
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
            phoneNumber: arsSendLogs.phoneNumber,
            count: count(),
          })
          .from(arsSendLogs)
          .where(sql`${arsSendLogs.phoneNumber} ILIKE ${`%${q}%`}`)
          .groupBy(arsSendLogs.phoneNumber)
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
}

export const storage = new DatabaseStorage();
