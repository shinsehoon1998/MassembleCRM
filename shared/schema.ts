import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  index,
  jsonb,
  decimal,
  pgEnum
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User roles enum
export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "counselor"]);

// Customer status enum  
export const customerStatusEnum = pgEnum("customer_status", ["인텍", "수수", "접수", "작업", "완료"]);

// Gender enum
export const genderEnum = pgEnum("gender", ["M", "F", "N"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  name: varchar("name").notNull(),
  department: varchar("department"),
  role: userRoleEnum("role").notNull().default("counselor"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customers table
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  phone: varchar("phone").notNull(),
  secondaryPhone: varchar("secondary_phone"),
  birthDate: timestamp("birth_date"),
  gender: genderEnum("gender").default("N"),
  debtAmount: decimal("debt_amount", { precision: 15, scale: 2 }),
  monthlyIncome: decimal("monthly_income", { precision: 12, scale: 2 }),
  status: customerStatusEnum("status").notNull().default("인텍"),
  assignedUserId: varchar("assigned_user_id").references(() => users.id),
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Consultation history table
export const consultations = pgTable("consultations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  content: text("content"),
  consultationDate: timestamp("consultation_date").notNull(),
  nextSchedule: timestamp("next_schedule"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Activity logs table
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  customerId: varchar("customer_id").references(() => customers.id),
  action: varchar("action").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  customers: many(customers),
  consultations: many(consultations),
  activityLogs: many(activityLogs),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  assignedUser: one(users, {
    fields: [customers.assignedUserId],
    references: [users.id],
  }),
  consultations: many(consultations),
  activityLogs: many(activityLogs),
}));

export const consultationsRelations = relations(consultations, ({ one }) => ({
  customer: one(customers, {
    fields: [consultations.customerId],
    references: [customers.id],
  }),
  user: one(users, {
    fields: [consultations.userId],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
  customer: one(customers, {
    fields: [activityLogs.customerId],
    references: [customers.id],
  }),
}));

// Schemas
export const upsertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
  name: true,
  department: true,
  role: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCustomerSchema = insertCustomerSchema.partial();

export const insertConsultationSchema = createInsertSchema(consultations).omit({
  id: true,
  createdAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;
export type Consultation = typeof consultations.$inferSelect;
export type InsertConsultation = z.infer<typeof insertConsultationSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// Extended types with relations
export type CustomerWithUser = Customer & {
  assignedUser: User | null;
};

export type ConsultationWithDetails = Consultation & {
  customer: Customer;
  user: User;
};
