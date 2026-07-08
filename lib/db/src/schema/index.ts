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
  address: text("address"),
  phone: text("phone"),
  timezone: text("timezone").notNull().default("UTC"),
  weekStartDay: integer("week_start_day").notNull().default(1),
  overtimeThreshold: numeric("overtime_threshold").notNull().default("40"),
  smtpConfig: jsonb("smtp_config"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

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
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Shift = typeof shifts.$inferSelect;
export type InsertShift = typeof shifts.$inferInsert;

// ─── Availability ────────────────────────────────────────────────────────────

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
  validatedHours: numeric("validated_hours"),
  paid: boolean("paid").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TimeLog = typeof timeLogs.$inferSelect;
export type InsertTimeLog = typeof timeLogs.$inferInsert;

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

// ─── Relations ───────────────────────────────────────────────────────────────

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  workplaces: many(workplaces),
  shifts: many(shifts),
  availability: many(availability),
  leaveRequests: many(leaveRequests),
  timeLogs: many(timeLogs),
  invitations: many(invitations),
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
