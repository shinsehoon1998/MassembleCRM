import {
  users,
  customers,
  consultations,
  activityLogs,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, like, and, count, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Customer operations
  getCustomers(params: {
    search?: string;
    status?: string;
    assignedUserId?: string;
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
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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
    page?: number;
    limit?: number;
  } = {}): Promise<{
    customers: CustomerWithUser[];
    total: number;
    totalPages: number;
  }> {
    const { search, status, assignedUserId, page = 1, limit = 20 } = params;
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
        debtAmount: customers.debtAmount,
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
      .orderBy(desc(customers.createdAt))
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

  async getCustomer(id: string): Promise<CustomerWithUser | undefined> {
    const [customer] = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        secondaryPhone: customers.secondaryPhone,
        birthDate: customers.birthDate,
        gender: customers.gender,
        debtAmount: customers.debtAmount,
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
    return updatedCustomer;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const result = await db.delete(customers).where(eq(customers.id, id));
    return (result.rowCount ?? 0) > 0;
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
        debtAmount: customers.debtAmount,
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
}

export const storage = new DatabaseStorage();
