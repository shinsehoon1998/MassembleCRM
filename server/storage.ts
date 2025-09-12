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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, like, and, count, sql } from "drizzle-orm";

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

    return {
      customers: customersData.map(row => ({
        ...row,
        assignedUser: row.assignedUser,
      })) as CustomerWithUser[],
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

    return recentCustomers.map(row => ({
      ...row,
      assignedUser: row.assignedUser,
    })) as CustomerWithUser[];
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
}

export const storage = new DatabaseStorage();
