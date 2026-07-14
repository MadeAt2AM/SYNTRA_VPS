import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Companies ──────────────────────────────────────────────────────────────

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("starter"),
  logoUrl: text("logo_url"),
  logoText: text("logo_text"),
  currency: text("currency").notNull().default("USD"),
  address: text("address"),
  phone: text("phone"),
  timezone: text("timezone").notNull().default("UTC"),
  weekStartDay: integer("week_start_day").notNull().default(1),
  overtimeThreshold: numeric("overtime_threshold").notNull().default("40"),
  smtpConfig: jsonb("smtp_config"),
  // Custom domain (white-label login/app URL for this company). The
  // customer points a CNAME (or ALIAS/A, per their DNS provider) at our
  // platform host; domainStatus tracks whether that record currently
  // resolves to us.
  customDomain: text("custom_domain").unique(),
  domainStatus: text("domain_status").notNull().default("none"), // none | pending | verified | failed
  domainVerifiedAt: timestamp("domain_verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ─── Platform Settings (singleton, platform-admin managed) ────────────────────
// Holds the platform's own SMTP config, used to send the public website's
// contact/enquiry form — distinct from each company's own smtpConfig, which
// is used for that company's user-facing emails (invites, resets, etc).

export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  smtpConfig: jsonb("smtp_config"),
  contactEmailTo: text("contact_email_to"),
  contactEmailFrom: text("contact_email_from"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PlatformSettings = typeof platformSettings.$inferSelect;

// ─── Users ──────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, {
    onDelete: "cascade",
  }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("employee"),
  status: text("status").notNull().default("active"),
  hourlyRate: numeric("hourly_rate"),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Workplaces ─────────────────────────────────────────────────────────────

export const workplaces = pgTable("workplaces", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  radiusMeters: integer("radius_meters").notNull().default(100),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Workplace = typeof workplaces.$inferSelect;
export type InsertWorkplace = typeof workplaces.$inferInsert;

// ─── Shifts ─────────────────────────────────────────────────────────────────

export const shifts = pgTable("shifts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").references(() => users.id, {
    onDelete: "set null",
  }),
  workplaceId: integer("workplace_id").references(() => workplaces.id, {
    onDelete: "set null",
  }),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status").notNull().default("draft"),
  offerStatus: text("offer_status"),
  role: text("role"),
  notes: text("notes"),
  isSuggested: boolean("is_suggested").notNull().default(false),
  suggestedData: jsonb("suggested_data"),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Shift = typeof shifts.$inferSelect;
export type InsertShift = typeof shifts.$inferInsert;

// ─── Availability ────────────────────────────────────────────────────────────
// slots JSONB format (per date key):
//   true                                          — available all day (legacy)
//   false                                         — not set (legacy)
//   { available: true, startTime?, endTime? }     — available with optional hours
//   { unavailable: true }                         — explicitly unavailable

export const availability = pgTable("availability", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(),
  slots: jsonb("slots").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Availability = typeof availability.$inferSelect;
export type InsertAvailability = typeof availability.$inferInsert;

// ─── Leave Requests ──────────────────────────────────────────────────────────

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  type: text("type").notNull().default("annual"),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  reviewedBy: integer("reviewed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequests.$inferInsert;

// ─── Time Logs ───────────────────────────────────────────────────────────────

export const timeLogs = pgTable("time_logs", {
  id: serial("id").primaryKey(),
  shiftId: integer("shift_id").references(() => shifts.id, {
    onDelete: "set null",
  }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  actualIn: timestamp("actual_in").notNull(),
  actualOut: timestamp("actual_out"),
  payrollIn: timestamp("payroll_in"),
  payrollOut: timestamp("payroll_out"),
  locationValid: boolean("location_valid").notNull().default(false),
  clockInLat: numeric("clock_in_lat"),
  clockInLng: numeric("clock_in_lng"),
  locationFlags: text("location_flags"),
  validatedHours: numeric("validated_hours"),
  managerValidated: boolean("manager_validated").notNull().default(false),
  managerValidatedAt: timestamp("manager_validated_at"),
  paid: boolean("paid").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TimeLog = typeof timeLogs.$inferSelect;
export type InsertTimeLog = typeof timeLogs.$inferInsert;

// ─── Shift Presets ───────────────────────────────────────────────────────────

export const shiftPresets = pgTable("shift_presets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(), // "HH:MM"
  endTime: text("end_time").notNull(),     // "HH:MM"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ShiftPreset = typeof shiftPresets.$inferSelect;
export type InsertShiftPreset = typeof shiftPresets.$inferInsert;

// ─── Invitations ─────────────────────────────────────────────────────────────

export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, {
    onDelete: "cascade",
  }),
  email: text("email").notNull(),
  role: text("role").notNull().default("employee"),
  status: text("status").notNull().default("pending"),
  invitedBy: integer("invited_by").references(() => users.id, {
    onDelete: "set null",
  }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

// ─── Shift Swaps ─────────────────────────────────────────────────────────────
// status: pending | accepted | rejected | cancelled | expired

export const shiftSwaps = pgTable("shift_swaps", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  requesterId: integer("requester_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requesterShiftId: integer("requester_shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  targetEmployeeId: integer("target_employee_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetShiftId: integer("target_shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ShiftSwap = typeof shiftSwaps.$inferSelect;
export type InsertShiftSwap = typeof shiftSwaps.$inferInsert;

// ─── Shift Offers ─────────────────────────────────────────────────────────────
// status: open | taken | retracted

export const shiftOffers = pgTable("shift_offers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  shiftId: integer("shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  offeredBy: integer("offered_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("open"),
  takenBy: integer("taken_by").references(() => users.id, { onDelete: "set null" }),
  takenAt: timestamp("taken_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ShiftOffer = typeof shiftOffers.$inferSelect;
export type InsertShiftOffer = typeof shiftOffers.$inferInsert;

// ─── Shift Replacements ───────────────────────────────────────────────────────
// One-directional: the requester picks a specific colleague to take over their
// shift. status: pending | accepted | rejected | cancelled | expired

export const shiftReplacements = pgTable("shift_replacements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  shiftId: integer("shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  requestedBy: integer("requested_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetEmployeeId: integer("target_employee_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ShiftReplacement = typeof shiftReplacements.$inferSelect;
export type InsertShiftReplacement = typeof shiftReplacements.$inferInsert;

// ─── Notifications ───────────────────────────────────────────────────────────
// type: swap_request | swap_accepted | swap_rejected | shift_offered | shift_taken | shift_offer_retracted | shortage_warning
//     | replacement_request | replacement_accepted | replacement_rejected

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Relations ───────────────────────────────────────────────────────────────

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  workplaces: many(workplaces),
  shifts: many(shifts),
  availability: many(availability),
  leaveRequests: many(leaveRequests),
  timeLogs: many(timeLogs),
  invitations: many(invitations),
  shiftSwaps: many(shiftSwaps),
  shiftOffers: many(shiftOffers),
  shiftReplacements: many(shiftReplacements),
  notifications: many(notifications),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  shifts: many(shifts),
  availability: many(availability),
  leaveRequests: many(leaveRequests),
  timeLogs: many(timeLogs),
  notifications: many(notifications),
}));

export const workplacesRelations = relations(workplaces, ({ one, many }) => ({
  company: one(companies, {
    fields: [workplaces.companyId],
    references: [companies.id],
  }),
  shifts: many(shifts),
}));

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  company: one(companies, {
    fields: [shifts.companyId],
    references: [companies.id],
  }),
  employee: one(users, {
    fields: [shifts.employeeId],
    references: [users.id],
  }),
  workplace: one(workplaces, {
    fields: [shifts.workplaceId],
    references: [workplaces.id],
  }),
  timeLogs: many(timeLogs),
}));

export const availabilityRelations = relations(availability, ({ one }) => ({
  employee: one(users, {
    fields: [availability.employeeId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [availability.companyId],
    references: [companies.id],
  }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  employee: one(users, {
    fields: [leaveRequests.employeeId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [leaveRequests.companyId],
    references: [companies.id],
  }),
  reviewer: one(users, {
    fields: [leaveRequests.reviewedBy],
    references: [users.id],
    relationName: "reviewer",
  }),
}));

export const timeLogsRelations = relations(timeLogs, ({ one }) => ({
  shift: one(shifts, { fields: [timeLogs.shiftId], references: [shifts.id] }),
  employee: one(users, {
    fields: [timeLogs.employeeId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [timeLogs.companyId],
    references: [companies.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  company: one(companies, {
    fields: [invitations.companyId],
    references: [companies.id],
  }),
  inviter: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const shiftSwapsRelations = relations(shiftSwaps, ({ one }) => ({
  company: one(companies, { fields: [shiftSwaps.companyId], references: [companies.id] }),
  requester: one(users, { fields: [shiftSwaps.requesterId], references: [users.id], relationName: "swapRequester" }),
  requesterShift: one(shifts, { fields: [shiftSwaps.requesterShiftId], references: [shifts.id], relationName: "swapRequesterShift" }),
  targetEmployee: one(users, { fields: [shiftSwaps.targetEmployeeId], references: [users.id], relationName: "swapTarget" }),
  targetShift: one(shifts, { fields: [shiftSwaps.targetShiftId], references: [shifts.id], relationName: "swapTargetShift" }),
}));

export const shiftOffersRelations = relations(shiftOffers, ({ one }) => ({
  company: one(companies, { fields: [shiftOffers.companyId], references: [companies.id] }),
  shift: one(shifts, { fields: [shiftOffers.shiftId], references: [shifts.id] }),
  offerer: one(users, { fields: [shiftOffers.offeredBy], references: [users.id], relationName: "offerBy" }),
  taker: one(users, { fields: [shiftOffers.takenBy!], references: [users.id], relationName: "offerTaker" }),
}));

export const shiftReplacementsRelations = relations(shiftReplacements, ({ one }) => ({
  company: one(companies, { fields: [shiftReplacements.companyId], references: [companies.id] }),
  shift: one(shifts, { fields: [shiftReplacements.shiftId], references: [shifts.id] }),
  requester: one(users, { fields: [shiftReplacements.requestedBy], references: [users.id], relationName: "replacementRequester" }),
  targetEmployee: one(users, { fields: [shiftReplacements.targetEmployeeId], references: [users.id], relationName: "replacementTarget" }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  company: one(companies, { fields: [notifications.companyId], references: [companies.id] }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
