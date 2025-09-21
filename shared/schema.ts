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
  phone: varchar("phone"),
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
  phone: true,
  department: true,
  role: true,
  isActive: true,
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

// 통화 결과 상세 분류를 위한 enum
export const callResultEnum = pgEnum("call_result", [
  "connected",     // 연결
  "answered",      // 응답  
  "busy",          // 통화중
  "no_answer",     // 무응답
  "voicemail",     // 사서함
  "rejected",      // 거절
  "invalid_number", // 결번
  "fax",           // 팩스
  "other",         // 기타
  "power_off",     // 전원오프
  "auto_response", // 자동응답
  "error",         // 오류
  "pending",       // 대기중
  "processing"     // 처리중
]);

// 재발송 유형을 위한 enum
export const retryTypeEnum = pgEnum("retry_type", [
  "initial",       // 최초 발송
  "retry",         // 재발송
  "repeat"         // 반복
]);

// ARS 발송 로그 (개선)
export const arsSendLogs = pgTable("ars_send_logs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  campaignId: integer("campaign_id").references(() => arsCampaigns.id),
  customerId: varchar("customer_id").references(() => customers.id),
  phone: varchar("phone", { length: 20 }).notNull(),
  scenarioId: varchar("scenario_id", { length: 50 }),
  historyKey: varchar("history_key", { length: 100 }),
  
  // 개선된 상태 추적 필드들
  status: varchar("status", { length: 20 }).default("pending"), // 기존 호환성 유지
  callResult: callResultEnum("call_result").default("pending"), // 상세 통화 결과
  retryType: retryTypeEnum("retry_type").default("initial"), // 재발송 유형
  retryAttempt: integer("retry_attempt").default(1), // 시도 횟수
  parentLogId: integer("parent_log_id"), // 재발송의 경우 원본 로그 ID
  
  // 통화 정보
  dtmfInput: varchar("dtmf_input", { length: 10 }),
  duration: integer("duration").default(0), // 초 단위
  recordingUrl: varchar("recording_url", { length: 500 }),
  
  // 비용 및 과금 정보
  cost: decimal("cost", { precision: 10, scale: 4 }), // 호당 비용
  billingUnits: integer("billing_units"), // 과금 단위
  
  // 기술적 메타데이터
  carrierInfo: varchar("carrier_info", { length: 100 }), // 통신사 정보
  callQuality: integer("call_quality"), // 통화 품질 점수 (1-10)
  errorCode: varchar("error_code", { length: 20 }), // 오류 코드
  errorMessage: text("error_message"), // 실패 사유 저장용
  
  // 시간 추적
  queuedAt: timestamp("queued_at"), // 큐에 등록된 시간
  sentAt: timestamp("sent_at"), // 발송 시작 시간
  answeredAt: timestamp("answered_at"), // 응답 시간
  completedAt: timestamp("completed_at"), // 완료 시간
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ars_send_logs_campaign_id").on(table.campaignId),
  index("idx_ars_send_logs_customer_id").on(table.customerId),
  index("idx_ars_send_logs_call_result").on(table.callResult),
  index("idx_ars_send_logs_sent_at").on(table.sentAt),
  index("idx_ars_send_logs_phone").on(table.phone),
  index("idx_ars_send_logs_history_key").on(table.historyKey),
]);

// ARS API 로그 (인덱스 추가)
export const arsApiLogs = pgTable("ars_api_logs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  endpoint: varchar("endpoint", { length: 255 }),
  method: varchar("method", { length: 10 }),
  requestData: text("request_data"),
  responseData: text("response_data"),
  httpCode: integer("http_code"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ars_api_logs_endpoint").on(table.endpoint),
  index("idx_ars_api_logs_created_at").on(table.createdAt),
  index("idx_ars_api_logs_http_code").on(table.httpCode),
]);

// 캠페인 통계 요약 테이블 (성능 최적화)
export const arsCampaignStats = pgTable("ars_campaign_stats", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  campaignId: integer("campaign_id").notNull().references(() => arsCampaigns.id, { onDelete: "cascade" }),
  
  // 기본 집계 통계
  totalCalls: integer("total_calls").default(0),
  completedCalls: integer("completed_calls").default(0),
  pendingCalls: integer("pending_calls").default(0),
  
  // 상세 통화 결과별 집계
  connectedCount: integer("connected_count").default(0),
  answeredCount: integer("answered_count").default(0),
  busyCount: integer("busy_count").default(0),
  noAnswerCount: integer("no_answer_count").default(0),
  voicemailCount: integer("voicemail_count").default(0),
  rejectedCount: integer("rejected_count").default(0),
  invalidNumberCount: integer("invalid_number_count").default(0),
  faxCount: integer("fax_count").default(0),
  otherCount: integer("other_count").default(0),
  powerOffCount: integer("power_off_count").default(0),
  autoResponseCount: integer("auto_response_count").default(0),
  errorCount: integer("error_count").default(0),
  
  // 재발송 통계
  initialCount: integer("initial_count").default(0),
  retryCount: integer("retry_count").default(0),
  repeatCount: integer("repeat_count").default(0),
  
  // 비용 및 시간 통계
  totalCost: decimal("total_cost", { precision: 12, scale: 4 }).default("0"),
  totalDuration: integer("total_duration").default(0), // 초 단위
  averageDuration: decimal("average_duration", { precision: 8, scale: 2 }).default("0"),
  
  // 통계 생성 정보
  statsDate: timestamp("stats_date").notNull().defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => [
  index("idx_ars_campaign_stats_campaign_id").on(table.campaignId),
  index("idx_ars_campaign_stats_stats_date").on(table.statsDate),
]);

// 일별 캠페인 통계 집계
export const arsDailyStats = pgTable("ars_daily_stats", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  campaignId: integer("campaign_id").references(() => arsCampaigns.id, { onDelete: "cascade" }),
  statsDate: timestamp("stats_date").notNull(), // 해당 날짜 (YYYY-MM-DD 00:00:00)
  
  // 일일 집계 통계
  totalCalls: integer("total_calls").default(0),
  successfulCalls: integer("successful_calls").default(0),
  failedCalls: integer("failed_calls").default(0),
  
  // 결과별 통계
  connectedCount: integer("connected_count").default(0),
  answeredCount: integer("answered_count").default(0),
  busyCount: integer("busy_count").default(0),
  noAnswerCount: integer("no_answer_count").default(0),
  
  // 비용 및 시간
  totalCost: decimal("total_cost", { precision: 12, scale: 4 }).default("0"),
  totalDuration: integer("total_duration").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ars_daily_stats_campaign_date").on(table.campaignId, table.statsDate),
  index("idx_ars_daily_stats_date").on(table.statsDate),
]);

// 시간별 캠페인 통계 집계
export const arsHourlyStats = pgTable("ars_hourly_stats", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  campaignId: integer("campaign_id").references(() => arsCampaigns.id, { onDelete: "cascade" }),
  statsHour: timestamp("stats_hour").notNull(), // 해당 시간 (YYYY-MM-DD HH:00:00)
  
  // 시간별 집계 통계
  totalCalls: integer("total_calls").default(0),
  successfulCalls: integer("successful_calls").default(0),
  failedCalls: integer("failed_calls").default(0),
  
  // 주요 결과 통계
  answeredCount: integer("answered_count").default(0),
  busyCount: integer("busy_count").default(0),
  noAnswerCount: integer("no_answer_count").default(0),
  
  // 성능 메트릭
  averageWaitTime: decimal("average_wait_time", { precision: 8, scale: 2 }).default("0"),
  peakCallVolume: integer("peak_call_volume").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ars_hourly_stats_campaign_hour").on(table.campaignId, table.statsHour),
  index("idx_ars_hourly_stats_hour").on(table.statsHour),
]);

// 배치 작업 상태 관리 테이블
export const arsBatchJobs = pgTable("ars_batch_jobs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  jobType: varchar("job_type", { length: 50 }).notNull(), // 'campaign_send', 'stats_aggregation', 'retry_processing'
  campaignId: integer("campaign_id").references(() => arsCampaigns.id),
  
  // 작업 상태
  status: varchar("status", { length: 20 }).default("pending"), // 'pending', 'running', 'completed', 'failed', 'cancelled'
  progress: integer("progress").default(0), // 진행률 (0-100)
  
  // 작업 세부사항
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  successfulItems: integer("successful_items").default(0),
  failedItems: integer("failed_items").default(0),
  
  // 작업 메타데이터
  jobData: jsonb("job_data"), // 작업별 추가 데이터
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  
  // 시간 추적
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  
  // 작업 실행 정보
  createdBy: varchar("created_by").references(() => users.id),
  executorInfo: jsonb("executor_info"), // 실행 환경 정보
}, (table) => [
  index("idx_ars_batch_jobs_type_status").on(table.jobType, table.status),
  index("idx_ars_batch_jobs_campaign_id").on(table.campaignId),
  index("idx_ars_batch_jobs_created_at").on(table.createdAt),
  index("idx_ars_batch_jobs_scheduled_at").on(table.scheduledAt),
]);

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
  updatedAt: true,
});

// 새로운 스키마 정의들
export const insertArsCampaignStatsSchema = createInsertSchema(arsCampaignStats).omit({
  id: true,
  lastUpdated: true,
});

export const insertArsDailyStatsSchema = createInsertSchema(arsDailyStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArsHourlyStatsSchema = createInsertSchema(arsHourlyStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArsBatchJobSchema = createInsertSchema(arsBatchJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateArsBatchJobSchema = createInsertSchema(arsBatchJobs).pick({
  status: true,
  progress: true,
  processedItems: true,
  successfulItems: true,
  failedItems: true,
  errorMessage: true,
  errorDetails: true,
  startedAt: true,
  completedAt: true,
}).partial();

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

// 새로운 ARS API 스키마
export const arsCallListAddSchema = z.object({
  campaignName: z.string().min(1, "캠페인명을 입력해주세요"),
  page: z.string().default("A"),
  phones: z.array(z.string()).optional(),
  phone: z.string().optional()
});
// 참고: 전화번호 검증은 UI에서 handleSubmit 함수에서 수행됩니다

export const arsCallListHistorySchema = z.object({
  historyKey: z.string().min(1, "히스토리 키가 필요합니다"),
  campaignName: z.string().min(1).optional(),
  page: z.string().default("A")
});

// ARS 대량 발송용 스키마 (고객 그룹 또는 고객 ID 배열 기반)
export const arsBulkSendSchema = z.object({
  campaignName: z.string().min(1, "캠페인명을 입력해주세요"),
  page: z.string().default("A"),
  groupId: z.string().optional(),
  customerIds: z.array(z.string()).optional(),
}).refine((data) => {
  const hasGroupId = !!data.groupId;
  const hasCustomerIds = !!(data.customerIds && data.customerIds.length > 0);
  
  if (hasGroupId && hasCustomerIds) {
    return false; // 둘 다 제공되면 오류
  }
  
  if (!hasGroupId && !hasCustomerIds) {
    return false; // 둘 다 없어도 오류  
  }
  
  return true; // 하나만 제공되면 OK
}, {
  message: "groupId 또는 customerIds 중 정확히 하나만 제공해야 합니다.",
});

// ARS 타입 정의
export type ArsCampaign = typeof arsCampaigns.$inferSelect;
export type InsertArsCampaign = z.infer<typeof insertArsCampaignSchema>;
export type ArsSendLog = typeof arsSendLogs.$inferSelect;
export type InsertArsSendLog = z.infer<typeof insertArsSendLogSchema>;
export type ArsCampaignStats = typeof arsCampaignStats.$inferSelect;
export type InsertArsCampaignStats = z.infer<typeof insertArsCampaignStatsSchema>;
export type ArsDailyStats = typeof arsDailyStats.$inferSelect;
export type InsertArsDailyStats = z.infer<typeof insertArsDailyStatsSchema>;
export type ArsHourlyStats = typeof arsHourlyStats.$inferSelect;
export type InsertArsHourlyStats = z.infer<typeof insertArsHourlyStatsSchema>;
export type ArsBatchJob = typeof arsBatchJobs.$inferSelect;
export type InsertArsBatchJob = z.infer<typeof insertArsBatchJobSchema>;
export type UpdateArsBatchJob = z.infer<typeof updateArsBatchJobSchema>;
export type ArsScenario = typeof arsScenarios.$inferSelect;
export type InsertArsScenario = z.infer<typeof insertArsScenarioSchema>;
export type AudioFile = typeof audioFiles.$inferSelect;
export type InsertAudioFile = z.infer<typeof insertAudioFileSchema>;

// ARS API 타입
export type ArsCallListAdd = z.infer<typeof arsCallListAddSchema>;
export type ArsCallListHistory = z.infer<typeof arsCallListHistorySchema>;
export type ArsBulkSend = z.infer<typeof arsBulkSendSchema>;

// 캠페인 결과 조회를 위한 추가 타입 정의
export type CampaignResultSummary = {
  campaignId: number;
  campaignName: string;
  totalCalls: number;
  completedCalls: number;
  pendingCalls: number;
  successRate: number;
  totalCost: string;
  averageDuration: string;
  callResultBreakdown: {
    connected: number;
    answered: number;
    busy: number;
    noAnswer: number;
    voicemail: number;
    rejected: number;
    invalidNumber: number;
    fax: number;
    other: number;
    powerOff: number;
    autoResponse: number;
    error: number;
  };
  retryBreakdown: {
    initial: number;
    retry: number;
    repeat: number;
  };
};

export type CampaignResultFilter = {
  campaignIds?: number[];
  campaignNames?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  callResults?: (typeof callResultEnum.enumValues)[number][];
  retryTypes?: (typeof retryTypeEnum.enumValues)[number][];
  statuses?: string[];
  page?: number;
  limit?: number;
};

export type DetailedCallResult = ArsSendLog & {
  customerName?: string;
  customerPhone: string;
  campaignName: string;
  scenarioName?: string;
};

// 시간대별 통계를 위한 타입
export type TimeBasedStats = {
  period: string; // '2024-01-15' (일별) 또는 '2024-01-15 14:00' (시간별)
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  answeredCount: number;
  busyCount: number;
  noAnswerCount: number;
  totalCost: string;
  averageDuration: string;
};

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

// ARS 관련 확장 타입
export type ArsCampaignWithStats = ArsCampaign & {
  stats?: ArsCampaignStats;
  targetGroup?: CustomerGroup;
};

export type ArsSendLogWithDetails = ArsSendLog & {
  customer?: Customer;
  campaign?: ArsCampaign;
};

export type ArsBatchJobWithDetails = ArsBatchJob & {
  campaign?: ArsCampaign;
  creator?: User;
};

// Campaign Statistics API Response Schemas
export const campaignStatsOverviewSchema = z.object({
  totalCampaigns: z.number(),
  activeCampaigns: z.number(),
  totalSent: z.number(),
  totalSuccess: z.number(),
  totalFailed: z.number(),
  successRate: z.number(),
  campaigns: z.array(z.object({
    id: z.number(),
    name: z.string(),
    status: z.string(),
    totalCount: z.number(),
    successCount: z.number(),
    failedCount: z.number(),
    successRate: z.number(),
    lastSentAt: z.string().nullable(),
    createdAt: z.string(),
  }))
});

export const campaignDetailedStatsSchema = z.object({
  campaignId: z.number(),
  campaignName: z.string(),
  summary: z.object({
    totalCount: z.number(),
    sentCount: z.number(),
    completedCount: z.number(),
    pendingCount: z.number(),
  }),
  callResults: z.record(z.string(), z.number()),
  retryStats: z.object({
    initial: z.number(),
    manual_retry: z.number(),
    auto_retry: z.number(),
  }),
  costAnalysis: z.object({
    totalCost: z.number(),
    averageCost: z.number(),
    totalBillingUnits: z.number(),
  }),
  timeAnalysis: z.object({
    averageDuration: z.number(),
    totalDuration: z.number(),
    peakHour: z.string(),
  }),
});

export const timelineStatsSchema = z.object({
  period: z.enum(['daily', 'hourly']),
  data: z.array(z.object({
    date: z.string(),
    totalSent: z.number(),
    successCount: z.number(),
    failedCount: z.number(),
    successRate: z.number(),
  }))
});

// 기존 기본 필터 스키마 (호환성 유지)
export const sendLogsFilterSchema = z.object({
  campaignId: z.number().optional(),
  callResult: z.string().optional(),
  retryType: z.enum(['initial', 'manual_retry', 'auto_retry']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

// 고급 필터링을 위한 확장된 send logs 필터 스키마
export const enhancedSendLogsFilterSchema = z.object({
  // 기존 필터 (호환성 유지)
  campaignId: z.number().optional(),
  callResult: z.string().optional(),
  retryType: z.enum(['initial', 'manual_retry', 'auto_retry']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  
  // 새로 추가된 고급 필터
  phoneNumber: z.string().optional(), // 전화번호 부분 검색
  customerName: z.string().optional(), // 고객명 부분 검색
  durationMin: z.number().min(0).optional(), // 최소 통화 시간 (초)
  durationMax: z.number().min(0).optional(), // 최대 통화 시간 (초)
  costMin: z.number().min(0).optional(), // 최소 비용
  costMax: z.number().min(0).optional(), // 최대 비용
  status: z.array(z.string()).optional(), // 복수 상태 선택
  callResults: z.array(z.string()).optional(), // 복수 통화 결과 선택
  sortBy: z.enum(['createdAt', 'sentAt', 'duration', 'cost', 'customerName', 'phoneNumber']).default('sentAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// 캠페인 검색 필터 스키마
export const campaignSearchFilterSchema = z.object({
  query: z.string().optional(), // 캠페인명 부분 검색
  createdBy: z.string().optional(), // 생성자로 검색
  status: z.array(z.string()).optional(), // 캠페인 상태 복수 선택
  dateFrom: z.string().optional(), // 생성일 시작
  dateTo: z.string().optional(), // 생성일 종료
  minSuccessRate: z.number().min(0).max(100).optional(), // 최소 성공률 (%)
  maxSuccessRate: z.number().min(0).max(100).optional(), // 최대 성공률 (%)
  minTotalCount: z.number().min(0).optional(), // 최소 발송 건수
  maxTotalCount: z.number().min(0).optional(), // 최대 발송 건수
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'status', 'totalCount', 'successRate', 'lastSentAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// 빠른 검색 스키마
export const quickSearchSchema = z.object({
  q: z.string().min(1), // 검색어 (필수)
  type: z.enum(['all', 'campaigns', 'customers', 'logs']).default('all'), // 검색 범위
  limit: z.number().min(1).max(50).default(10), // 결과 개수 제한
});

// 자동완성 스키마
export const autocompleteSchema = z.object({
  q: z.string().min(2), // 검색어 (최소 2글자)
  field: z.enum(['campaign', 'customer', 'phone']), // 자동완성 대상 필드
  limit: z.number().min(1).max(20).default(10), // 제안 개수 (기본 10개)
});

// 빠른 검색 결과 응답 스키마
export const quickSearchResultSchema = z.object({
  query: z.string(),
  results: z.object({
    campaigns: z.array(z.object({
      id: z.number(),
      name: z.string(),
      type: z.literal('campaign'),
      matchField: z.string(),
      status: z.string().optional(),
      createdAt: z.string().optional(),
    })),
    customers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.literal('customer'),
      matchField: z.string(),
      phone: z.string().optional(),
      status: z.string().optional(),
    })),
    sendLogs: z.array(z.object({
      id: z.number(),
      campaignName: z.string(),
      customerName: z.string(),
      type: z.literal('sendLog'),
      matchField: z.string(),
      phoneNumber: z.string().optional(),
      sentAt: z.string().optional(),
    })),
  }),
  totalResults: z.number(),
});

// 자동완성 결과 응답 스키마
export const autocompleteResultSchema = z.object({
  query: z.string(),
  field: z.string(),
  suggestions: z.array(z.object({
    value: z.string(),
    label: z.string(),
    count: z.number().optional(), // 해당 항목의 개수
    type: z.string().optional(), // 추가 컨텍스트
  })),
});

// 캠페인 검색 결과 응답 스키마
export const campaignSearchResultSchema = z.object({
  campaigns: z.array(z.object({
    id: z.number(),
    name: z.string(),
    status: z.string(),
    createdBy: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
    totalCount: z.number(),
    successCount: z.number(),
    failedCount: z.number(),
    successRate: z.number(),
    totalCost: z.number().optional(),
    lastSentAt: z.string().nullable(),
  })),
  total: z.number(),
  totalPages: z.number(),
  currentPage: z.number(),
});

// API Response types
export type CampaignStatsOverview = z.infer<typeof campaignStatsOverviewSchema>;
export type CampaignDetailedStats = z.infer<typeof campaignDetailedStatsSchema>;
export type TimelineStats = z.infer<typeof timelineStatsSchema>;
export type SendLogsFilter = z.infer<typeof sendLogsFilterSchema>;

// 새로운 필터링 및 검색 관련 타입
export type EnhancedSendLogsFilter = z.infer<typeof enhancedSendLogsFilterSchema>;
export type CampaignSearchFilter = z.infer<typeof campaignSearchFilterSchema>;
export type QuickSearch = z.infer<typeof quickSearchSchema>;
export type Autocomplete = z.infer<typeof autocompleteSchema>;
export type QuickSearchResult = z.infer<typeof quickSearchResultSchema>;
export type AutocompleteResult = z.infer<typeof autocompleteResultSchema>;
export type CampaignSearchResult = z.infer<typeof campaignSearchResultSchema>;

// ============================================
// 🔥 보안 강화: SortBy 필드 Enum 제약
// ============================================

// Send Logs 정렬 필드 Enum
export const sendLogsSortByEnum = z.enum([
  'sentAt', 'createdAt', 'duration', 'cost', 'callResult', 
  'customerName', 'phoneNumber', 'status', 'retryType', 'completedAt'
]);

// Campaigns 정렬 필드 Enum
export const campaignsSortByEnum = z.enum([
  'name', 'status', 'createdAt', 'updatedAt', 'totalCount', 
  'successRate', 'lastSentAt', 'successCount', 'failedCount', 'totalCost'
]);

// Customers 정렬 필드 Enum
export const customersSortByEnum = z.enum([
  'name', 'phone', 'createdAt', 'updatedAt', 'status'
]);

// 정렬 순서 Enum
export const sortOrderEnum = z.enum(['asc', 'desc']);

// 강화된 스키마 - 기존 스키마 업데이트
export const enhancedSendLogsFilterSchemaSecure = enhancedSendLogsFilterSchema.extend({
  sortBy: sendLogsSortByEnum.optional(),
  sortOrder: sortOrderEnum.optional(),
});

export const campaignSearchFilterSchemaSecure = campaignSearchFilterSchema.extend({
  sortBy: campaignsSortByEnum.optional(),
  sortOrder: sortOrderEnum.optional(),
});

// 타입 export
export type SendLogsSortBy = z.infer<typeof sendLogsSortByEnum>;
export type CampaignsSortBy = z.infer<typeof campaignsSortByEnum>;
export type CustomersSortBy = z.infer<typeof customersSortByEnum>;
export type SortOrder = z.infer<typeof sortOrderEnum>;

// ============================================
// 📊 Export/Download Schemas
// ============================================

// 발송 로그 CSV 다운로드 스키마
export const sendLogsExportCsvSchema = enhancedSendLogsFilterSchemaSecure.extend({
  includePersonalInfo: z.boolean().default(false), // 개인정보 포함 여부
}).omit({ page: true, limit: true }); // 페이징 제거 (전체 다운로드)

// 캠페인 통계 Excel 다운로드 스키마  
export const campaignsExportExcelSchema = campaignSearchFilterSchemaSecure.extend({
  includeDetails: z.boolean().default(false), // 상세 통계 포함 여부
}).omit({ page: true, limit: true }); // 페이징 제거

// 통합 리포트 다운로드 스키마
export const reportsExportSchema = z.object({
  format: z.enum(['csv', 'excel']), // 다운로드 형식
  reportType: z.enum(['summary', 'detailed', 'custom']), // 리포트 유형
  dateFrom: z.string(), // 분석 기간 시작 (필수)
  dateTo: z.string(),   // 분석 기간 종료 (필수)
  includeCharts: z.boolean().default(false), // 차트 데이터 포함 (Excel만)
  includePersonalInfo: z.boolean().default(false), // 개인정보 포함 여부
});

// Export용 데이터 타입 정의
export type ArsSendLogExport = {
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
};

export type ArsCampaignExport = {
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
};

export type SystemStatsReport = {
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
  campaigns: ArsCampaignExport[];
  
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
};

// Export 파라미터 타입
export type SendLogsExportCsv = z.infer<typeof sendLogsExportCsvSchema>;
export type CampaignsExportExcel = z.infer<typeof campaignsExportExcelSchema>;
export type ReportsExport = z.infer<typeof reportsExportSchema>;

// ============================================
// SMS 관련 Zod 스키마 (Solapi v4)
// ============================================

// SMS 메시지 스키마
export const smsMessageSchema = z.object({
  to: z.string()
    .min(9, '전화번호는 최소 9자리 이상이어야 합니다.')
    .max(15, '전화번호는 최대 15자리까지 허용됩니다.')
    .regex(/^[0-9+\-\s()]+$/, '유효한 전화번호 형식이 아닙니다.'),
  from: z.string()
    .min(9, '발신번호는 최소 9자리 이상이어야 합니다.')
    .max(15, '발신번호는 최대 15자리까지 허용됩니다.')
    .regex(/^[0-9+\-\s()]+$/, '유효한 발신번호 형식이 아닙니다.'),
  text: z.string()
    .min(1, '메시지 내용은 필수입니다.')
    .max(2000, '메시지는 최대 2000자까지 허용됩니다.'),
  type: z.enum(['SMS', 'LMS', 'MMS']).optional(),
  country: z.string().default('82'),
  subject: z.string().max(40, '제목은 최대 40자까지 허용됩니다.').optional(),
});

// SMS 발송 요청 스키마
export const smsSendRequestSchema = z.object({
  to: z.string()
    .min(9, '수신번호는 필수입니다.')
    .regex(/^[0-9+\-\s()]+$/, '유효한 전화번호 형식이 아닙니다.'),
  message: z.string()
    .min(1, '메시지 내용은 필수입니다.')
    .max(2000, '메시지는 최대 2000자까지 허용됩니다.'),
  type: z.enum(['SMS', 'LMS', 'MMS']).optional(),
  subject: z.string().max(40, '제목은 최대 40자까지 허용됩니다.').optional(),
});

// 고객 배정 알림 SMS 스키마
export const smsCustomerAssignmentSchema = z.object({
  to: z.string()
    .min(9, '수신번호는 필수입니다.')
    .regex(/^[0-9+\-\s()]+$/, '유효한 전화번호 형식이 아닙니다.'),
  customerName: z.string()
    .min(1, '고객명은 필수입니다.')
    .max(50, '고객명은 최대 50자까지 허용됩니다.'),
  customerPhone: z.string()
    .min(9, '고객 전화번호는 필수입니다.')
    .regex(/^[0-9+\-\s()]+$/, '유효한 전화번호 형식이 아닙니다.'),
  status: z.string()
    .min(1, '상태는 필수입니다.')
    .max(30, '상태는 최대 30자까지 허용됩니다.'),
  assignedTime: z.string()
    .min(1, '배정시간은 필수입니다.'),
});

// SMS 이력 조회 스키마
export const smsHistoryRequestSchema = z.object({
  messageId: z.string()
    .min(1, '메시지 ID는 필수입니다.')
    .regex(/^[a-zA-Z0-9_-]+$/, '유효한 메시지 ID 형식이 아닙니다.'),
});

// SMS 발송 결과 타입
export type SmsSendRequest = z.infer<typeof smsSendRequestSchema>;
export type SmsCustomerAssignment = z.infer<typeof smsCustomerAssignmentSchema>;
export type SmsHistoryRequest = z.infer<typeof smsHistoryRequestSchema>;

// 파일명 생성 유틸리티 함수들
export const generateExportFileName = {
  sendLogsCsv: (dateFrom?: string, dateTo?: string, campaignName?: string) => {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[:\-T]/g, '');
    const dateRange = dateFrom && dateTo 
      ? `${dateFrom.slice(0, 10)}-to-${dateTo.slice(0, 10)}`
      : now.toISOString().slice(0, 10);
    const campaign = campaignName ? `-${campaignName.replace(/[^가-힣a-zA-Z0-9]/g, '')}` : '';
    return `ars-send-logs${campaign}-${dateRange}-${timestamp}.csv`;
  },
  
  campaignsExcel: (dateFrom?: string, dateTo?: string) => {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[:\-T]/g, '');
    const dateRange = dateFrom && dateTo 
      ? `${dateFrom.slice(0, 10)}-to-${dateTo.slice(0, 10)}`
      : now.toISOString().slice(0, 10);
    return `campaign-stats-${dateRange}-${timestamp}.xlsx`;
  },
  
  systemReport: (format: 'csv' | 'excel', dateFrom: string, dateTo: string) => {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[:\-T]/g, '');
    const dateRange = `${dateFrom.slice(0, 10)}-to-${dateTo.slice(0, 10)}`;
    const extension = format === 'csv' ? 'csv' : 'xlsx';
    return `system-report-${dateRange}-${timestamp}.${extension}`;
  }
};
