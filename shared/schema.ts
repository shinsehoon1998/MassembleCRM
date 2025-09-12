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

// Customer status enum - 동적 상태 관리를 위해 varchar 사용
// export const customerStatusEnum = pgEnum("customer_status", ["인텍", "수수", "접수", "작업", "완료"]);

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
  username: varchar("username").unique(),
  password: varchar("password"),
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
  zipcode: varchar("zipcode"),
  address: text("address"),
  addressDetail: varchar("address_detail"),
  monthlyIncome: decimal("monthly_income", { precision: 12, scale: 2 }),
  jobType: varchar("job_type"),
  companyName: varchar("company_name"),
  consultType: varchar("consult_type"),
  consultPath: varchar("consult_path"),
  status: varchar("status").notNull().default("인텍"),
  assignedUserId: varchar("assigned_user_id").references(() => users.id),
  secondaryUserId: varchar("secondary_user_id").references(() => users.id),
  department: varchar("department"),
  team: varchar("team"),
  source: varchar("source").default("manual"),
  marketingConsent: boolean("marketing_consent").default(false),
  marketingConsentDate: timestamp("marketing_consent_date"),
  marketingConsentMethod: varchar("marketing_consent_method"),
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
  consultType: varchar("consult_type"),
  statusBefore: varchar("status_before"),
  statusAfter: varchar("status_after"),
  nextAction: text("next_action"),
  consultationDate: timestamp("consultation_date").notNull().defaultNow(),
  nextSchedule: timestamp("next_schedule"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Attachments table
export const attachments = pgTable("attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  fileName: varchar("file_name").notNull(),
  originalName: varchar("original_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileSize: integer("file_size"),
  fileType: varchar("file_type"),
  description: text("description"),
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

// System settings table
export const systemSettings = pgTable("system_settings", {
  key: varchar("key").primaryKey(),
  value: text("value"),
  category: varchar("category").notNull(),
  label: varchar("label").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  customers: many(customers),
  consultations: many(consultations),
  activityLogs: many(activityLogs),
  attachments: many(attachments),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  assignedUser: one(users, {
    fields: [customers.assignedUserId],
    references: [users.id],
  }),
  secondaryUser: one(users, {
    fields: [customers.secondaryUserId],
    references: [users.id],
  }),
  consultations: many(consultations),
  activityLogs: many(activityLogs),
  attachments: many(attachments),
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

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  customer: one(customers, {
    fields: [attachments.customerId],
    references: [customers.id],
  }),
  uploader: one(users, {
    fields: [attachments.uploadedBy],
    references: [users.id],
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
  username: true,
  password: true,
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

export const insertAttachmentSchema = createInsertSchema(attachments).omit({
  id: true,
  createdAt: true,
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  createdAt: true,
  updatedAt: true,
});

export const updateSystemSettingSchema = createInsertSchema(systemSettings).pick({
  value: true,
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
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type UpdateSystemSetting = z.infer<typeof updateSystemSettingSchema>;

// 고객 그룹 (arsCampaigns 앞에 먼저 정의)
export const customerGroups = pgTable("customer_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }).default("#3B82F6"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 고객-그룹 매핑
export const customerGroupMappings = pgTable("customer_group_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  groupId: varchar("group_id").notNull().references(() => customerGroups.id, { onDelete: "cascade" }),
  addedBy: varchar("added_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ARS 캠페인 테이블
export const arsCampaigns = pgTable("ars_campaigns", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  scenarioId: varchar("scenario_id", { length: 50 }).notNull(),
  targetGroupId: varchar("target_group_id").references(() => customerGroups.id),
  totalCount: integer("total_count").default(0),
  successCount: integer("success_count").default(0),
  failedCount: integer("failed_count").default(0),
  consentCount: integer("consent_count").default(0),
  rejectCount: integer("reject_count").default(0),
  status: varchar("status", { length: 20 }).default("draft"),
  historyKey: varchar("history_key", { length: 100 }),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ARS 발송 로그
export const arsSendLogs = pgTable("ars_send_logs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  campaignId: integer("campaign_id").references(() => arsCampaigns.id),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  phone: varchar("phone", { length: 20 }).notNull(),
  scenarioId: varchar("scenario_id", { length: 50 }),
  historyKey: varchar("history_key", { length: 100 }),
  status: varchar("status", { length: 20 }).default("pending"),
  dtmfInput: varchar("dtmf_input", { length: 10 }),
  duration: integer("duration").default(0),
  recordingUrl: varchar("recording_url", { length: 500 }),
  errorMessage: text("error_message"), // 실패 사유 저장용
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ARS API 로그
export const arsApiLogs = pgTable("ars_api_logs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  endpoint: varchar("endpoint", { length: 255 }),
  method: varchar("method", { length: 10 }),
  requestData: text("request_data"),
  responseData: text("response_data"),
  httpCode: integer("http_code"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ARS 시나리오
export const arsScenarios = pgTable("ars_scenarios", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 음원 파일 관리 테이블
export const audioFiles = pgTable("audio_files", {
  id: varchar("id", { length: 50 }).primaryKey(),
  scenarioId: varchar("scenario_id", { length: 50 }).references(() => arsScenarios.id),
  fileName: varchar("filename", { length: 255 }).notNull(), // DB 실제 컬럼명에 맞춤
  originalName: varchar("original_filename", { length: 255 }).notNull(), // DB 실제 컬럼명에 맞춤
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 50 }).notNull(),
  description: text("description"),
  storageUrl: varchar("storage_path", { length: 500 }), // 실제 DB 컬럼에 맞춤
  atalkStatus: varchar("atalk_status", { length: 50 }).default("pending"), // 실제 DB 컬럼에 맞춤
  atalkResponse: text("atalk_response"), // 실제 DB 컬럼에 맞춤
  uploadedBy: varchar("uploaded_by"), // 실제 DB 컬럼에 맞춤
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});


// ARS 관련 스키마
export const insertArsCampaignSchema = createInsertSchema(arsCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArsSendLogSchema = createInsertSchema(arsSendLogs).omit({
  id: true,
  createdAt: true,
});

export const insertArsScenarioSchema = createInsertSchema(arsScenarios).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertAudioFileSchema = createInsertSchema(audioFiles).omit({
  createdAt: true,
});

// 고객 그룹 스키마
export const insertCustomerGroupSchema = createInsertSchema(customerGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerGroupMappingSchema = createInsertSchema(customerGroupMappings).omit({
  id: true,
  createdAt: true,
});

// ARS 타입 정의
export type ArsCampaign = typeof arsCampaigns.$inferSelect;
export type InsertArsCampaign = z.infer<typeof insertArsCampaignSchema>;
export type ArsSendLog = typeof arsSendLogs.$inferSelect;
export type InsertArsSendLog = z.infer<typeof insertArsSendLogSchema>;
export type ArsScenario = typeof arsScenarios.$inferSelect;
export type InsertArsScenario = z.infer<typeof insertArsScenarioSchema>;
export type AudioFile = typeof audioFiles.$inferSelect;
export type InsertAudioFile = z.infer<typeof insertAudioFileSchema>;

// 고객 그룹 타입 정의
export type CustomerGroup = typeof customerGroups.$inferSelect;
export type InsertCustomerGroup = z.infer<typeof insertCustomerGroupSchema>;
export type CustomerGroupMapping = typeof customerGroupMappings.$inferSelect;
export type InsertCustomerGroupMapping = z.infer<typeof insertCustomerGroupMappingSchema>;

// Extended types with relations
export type CustomerWithUser = Customer & {
  assignedUser: User | null;
  secondaryUser: User | null;
};

export type AttachmentWithUser = Attachment & {
  uploader: User;
};

export type ConsultationWithDetails = Consultation & {
  customer: Customer;
  user: User;
};
