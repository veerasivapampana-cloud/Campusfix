import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const campusDepartmentsTable = pgTable("campus_departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const campusCategoriesTable = pgTable("campus_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  icon: text("icon").notNull().default(""),
  baseWeight: integer("base_weight").notNull().default(10),
});

export const campusUsersTable = pgTable("campus_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["student", "admin", "staff"] }).notNull(),
  departmentId: integer("department_id").references(
    () => campusDepartmentsTable.id,
  ),
  creditsBalance: integer("credits_balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campusBadgesTable = pgTable("campus_badges", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  requiredCredits: integer("required_credits").notNull().default(0),
});

export const campusIssuesTable = pgTable("campus_issues", {
  id: serial("id").primaryKey(),
  ticketId: text("ticket_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url"),
  location: text("location").notNull(),
  primaryCategoryId: integer("primary_category_id")
    .notNull()
    .references(() => campusCategoriesTable.id),
  secondaryCategoryId: integer("secondary_category_id").references(
    () => campusCategoriesTable.id,
  ),
  additionalCategories: jsonb("additional_categories")
    .$type<string[]>()
    .notNull()
    .default([]),
  severity: text("severity", {
    enum: ["Low", "Medium", "High", "Critical"],
  }).notNull(),
  priority: text("priority", { enum: ["P1", "P2", "P3", "P4"] }).notNull(),
  priorityScore: integer("priority_score").notNull(),
  safetyRisk: text("safety_risk").notNull(),
  suggestedAction: text("suggested_action").notNull(),
  aiSummary: text("ai_summary").notNull(),
  aiReasoning: jsonb("ai_reasoning").$type<string[]>().notNull().default([]),
  reporterId: integer("reporter_id")
    .notNull()
    .references(() => campusUsersTable.id),
  assignedStaffId: integer("assigned_staff_id").references(
    () => campusUsersTable.id,
  ),
  primaryDepartmentId: integer("primary_department_id")
    .notNull()
    .references(() => campusDepartmentsTable.id),
  supportingDepartmentIds: jsonb("supporting_department_ids")
    .$type<number[]>()
    .notNull()
    .default([]),
  status: text("status", {
    enum: [
      "Reported",
      "AI Analyzed",
      "Assigned",
      "In Progress",
      "Resolved",
      "Verified",
    ],
  })
    .notNull()
    .default("Reported"),
  resolutionNotes: text("resolution_notes"),
  resolutionImageUrl: text("resolution_image_url"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campusIssueTimelineTable = pgTable("campus_issue_timeline", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id")
    .notNull()
    .references(() => campusIssuesTable.id),
  status: text("status").notNull(),
  note: text("note").notNull(),
  actorName: text("actor_name").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campusNotificationsTable = pgTable("campus_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => campusUsersTable.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type", {
    enum: ["status_change", "credits", "assignment"],
  }).notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campusUserBadgesTable = pgTable(
  "campus_user_badges",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => campusUsersTable.id),
    badgeId: integer("badge_id")
      .notNull()
      .references(() => campusBadgesTable.id),
    awardedAt: timestamp("awarded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.userId, table.badgeId)],
);

export const campusCreditActivityTable = pgTable("campus_credit_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => campusUsersTable.id),
  points: integer("points").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
