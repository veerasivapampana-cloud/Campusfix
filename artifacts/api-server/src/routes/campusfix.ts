import { count, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AnalyzeCampusIssueBody,
  AnalyzeCampusIssueResponse,
  AssignCampusIssueBody,
  AssignCampusIssueParams,
  AssignCampusIssueResponse,
  CreateCampusIssueBody,
  CreateCampusIssueResponse,
  GetCampusAnalyticsResponse,
  GetCampusCreditsParams,
  GetCampusCreditsResponse,
  GetCampusIssueTimelineParams,
  GetCampusIssueTimelineResponse,
  GetCampusOverviewResponse,
  ListCampusIssuesResponse,
  ListCampusNotificationsParams,
  ListCampusNotificationsResponse,
  ListCampusUsersResponse,
  MarkCampusNotificationReadParams,
  MarkCampusNotificationReadResponse,
  UpdateCampusIssueStatusBody,
  UpdateCampusIssueStatusParams,
  UpdateCampusIssueStatusResponse,
} from "@workspace/api-zod";
import {
  campusBadgesTable,
  campusCategoriesTable,
  campusCreditActivityTable,
  campusDepartmentsTable,
  campusIssueTimelineTable,
  campusIssuesTable,
  campusNotificationsTable,
  campusUserBadgesTable,
  campusUsersTable,
  db,
} from "@workspace/db";
import {
  analyzeIssueText,
  ensureCampusSeeded,
  getCampusAnalytics,
  getCampusIssue,
  getCampusOverview,
  getCreditProfile,
  listCampusIssues,
  listCampusNotifications,
  listCampusUsers,
} from "../lib/campusfix";

const router: IRouter = Router();

router.get("/campusfix/users", async (_req, res): Promise<void> => {
  const users = await listCampusUsers();
  res.json(ListCampusUsersResponse.parse(users));
});

router.get("/campusfix/issues", async (_req, res): Promise<void> => {
  const issues = await listCampusIssues();
  res.json(ListCampusIssuesResponse.parse(issues));
});

router.post("/campusfix/analyze", async (req, res): Promise<void> => {
  const input = AnalyzeCampusIssueBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  const analysis = analyzeIssueText(input.data.description, input.data.location);
  res.json(AnalyzeCampusIssueResponse.parse(analysis));
});

router.get("/campusfix/overview", async (_req, res): Promise<void> => {
  const overview = await getCampusOverview();
  res.json(GetCampusOverviewResponse.parse(overview));
});

router.get("/campusfix/analytics", async (_req, res): Promise<void> => {
  const analytics = await getCampusAnalytics();
  res.json(GetCampusAnalyticsResponse.parse(analytics));
});

router.get("/campusfix/issues/:issueId/timeline", async (req, res): Promise<void> => {
  const params = GetCampusIssueTimelineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await ensureCampusSeeded();
  const [issue] = await db
    .select({ id: campusIssuesTable.id })
    .from(campusIssuesTable)
    .where(eq(campusIssuesTable.id, params.data.issueId))
    .limit(1);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  const entries = await db
    .select({
      id: campusIssueTimelineTable.id,
      status: campusIssueTimelineTable.status,
      note: campusIssueTimelineTable.note,
      actorName: campusIssueTimelineTable.actorName,
      timestamp: campusIssueTimelineTable.timestamp,
    })
    .from(campusIssueTimelineTable)
    .where(eq(campusIssueTimelineTable.issueId, params.data.issueId))
    .orderBy(desc(campusIssueTimelineTable.timestamp));
  res.json(GetCampusIssueTimelineResponse.parse(entries));
});

router.post("/campusfix/issues", async (req, res): Promise<void> => {
  const input = CreateCampusIssueBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  await ensureCampusSeeded();
  const reporter = await db.query.campusUsersTable.findFirst({
    where: eq(campusUsersTable.id, input.data.reporterId),
  });
  if (!reporter || reporter.role !== "student") {
    res.status(404).json({ error: "Student reporter not found" });
    return;
  }
  const analysis = analyzeIssueText(input.data.description, input.data.location);
  const [categoryRows, departmentRows, currentCount] = await Promise.all([
    db.select().from(campusCategoriesTable),
    db.select().from(campusDepartmentsTable),
    db.select({ value: count() }).from(campusIssuesTable),
  ]);
  const categoryByName = new Map(categoryRows.map((item) => [item.name, item.id]));
  const departmentByName = new Map(departmentRows.map((item) => [item.name, item.id]));
  const primaryCategoryId = categoryByName.get(analysis.primaryCategory);
  const primaryDepartmentId = departmentByName.get(analysis.primaryDepartment);
  if (!primaryCategoryId || !primaryDepartmentId) {
    res.status(500).json({ error: "CampusFix classification mapping is unavailable" });
    return;
  }
  const issueCount = Number(currentCount[0]?.value ?? 0);
  const ticketId = `CF-${new Date().getFullYear()}-${String(101 + issueCount).padStart(5, "0")}`;
  const title =
    input.data.title?.trim() ||
    (input.data.description.length > 68
      ? `${input.data.description.slice(0, 65)}…`
      : input.data.description);

  const issueId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(campusIssuesTable)
      .values({
        ticketId,
        title,
        description: input.data.description,
        imageUrl: input.data.imageUrl ?? null,
        location: input.data.location,
        primaryCategoryId,
        secondaryCategoryId: analysis.secondaryCategory
          ? (categoryByName.get(analysis.secondaryCategory) ?? null)
          : null,
        additionalCategories: analysis.additionalCategories,
        severity: analysis.severity,
        priority: analysis.priority,
        priorityScore: analysis.priorityScore,
        safetyRisk: analysis.safetyRisk,
        suggestedAction: analysis.suggestedAction,
        aiSummary: analysis.aiSummary,
        aiReasoning: analysis.aiReasoning,
        reporterId: reporter.id,
        primaryDepartmentId,
        supportingDepartmentIds: analysis.supportingDepartments
          .map((name) => departmentByName.get(name))
          .filter((value): value is number => value !== undefined),
        status: "Reported",
      })
      .returning({ id: campusIssuesTable.id });
    if (!created) throw new Error("Issue could not be created");

    const now = new Date();
    await tx.insert(campusIssueTimelineTable).values([
      {
        issueId: created.id,
        status: "Reported",
        note: "Issue submitted by a student.",
        actorName: reporter.name,
        timestamp: now,
      },
      {
        issueId: created.id,
        status: "AI Analyzed",
        note: `${analysis.primaryCategory}${analysis.secondaryCategory ? ` + ${analysis.secondaryCategory}` : ""} · ${analysis.priority} · score ${analysis.priorityScore}.`,
        actorName: "CampusFix AI",
        timestamp: now,
      },
    ]);
    const nextBalance = reporter.creditsBalance + 15;
    await tx
      .update(campusUsersTable)
      .set({ creditsBalance: nextBalance })
      .where(eq(campusUsersTable.id, reporter.id));
    await tx.insert(campusCreditActivityTable).values({
      userId: reporter.id,
      points: 15,
      description: `Reported ${ticketId}`,
    });
    await tx.insert(campusNotificationsTable).values([
      {
        userId: reporter.id,
        title: "Issue received",
        message: `Your report ${ticketId} is in the campus priority queue.`,
        type: "status_change",
      },
      {
        userId: reporter.id,
        title: "Campus Credits earned",
        message: "You received 15 credits for reporting a campus issue.",
        type: "credits",
      },
    ]);

    const badges = await tx.select().from(campusBadgesTable);
    const award = async (name: string) => {
      const badge = badges.find((item) => item.name === name);
      if (badge) {
        await tx
          .insert(campusUserBadgesTable)
          .values({ userId: reporter.id, badgeId: badge.id })
          .onConflictDoNothing();
      }
    };
    await award("First Reporter");
    if (analysis.priority === "P1") await award("Safety Watch");
    if (nextBalance >= 40) await award("Campus Guardian");
    return created.id;
  });

  const issue = await getCampusIssue(issueId);
  if (!issue) {
    res.status(500).json({ error: "Created issue could not be retrieved" });
    return;
  }
  res.status(201).json(CreateCampusIssueResponse.parse(issue));
});

router.post("/campusfix/issues/:issueId/assign", async (req, res): Promise<void> => {
  const params = AssignCampusIssueParams.safeParse(req.params);
  const input = AssignCampusIssueBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  await ensureCampusSeeded();
  const [issueRow, staff, departmentRows, users] = await Promise.all([
    db.query.campusIssuesTable.findFirst({
      where: eq(campusIssuesTable.id, params.data.issueId),
    }),
    db.query.campusUsersTable.findFirst({
      where: eq(campusUsersTable.id, input.data.staffId),
    }),
    db.select().from(campusDepartmentsTable),
    db.select().from(campusUsersTable),
  ]);
  if (!issueRow || !staff || staff.role !== "staff") {
    res.status(404).json({ error: "Issue or maintenance staff member not found" });
    return;
  }
  const departmentByName = new Map(departmentRows.map((item) => [item.name, item.id]));
  const primaryDepartmentId = departmentByName.get(input.data.primaryDepartment);
  if (!primaryDepartmentId) {
    res.status(400).json({ error: "Unknown primary department" });
    return;
  }
  const supportingDepartmentIds = input.data.supportingDepartments
    .map((name) => departmentByName.get(name))
    .filter((value): value is number => value !== undefined);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(campusIssuesTable)
      .set({
        assignedStaffId: staff.id,
        primaryDepartmentId,
        supportingDepartmentIds,
        status: "Assigned",
        updatedAt: now,
      })
      .where(eq(campusIssuesTable.id, issueRow.id));
    await tx.insert(campusIssueTimelineTable).values({
      issueId: issueRow.id,
      status: "Assigned",
      note: `Assigned to ${input.data.primaryDepartment}${input.data.supportingDepartments.length ? ` with support from ${input.data.supportingDepartments.join(", ")}` : ""}.`,
      actorName: "Jordan Lee",
      timestamp: now,
    });
    await tx.insert(campusNotificationsTable).values([
      {
        userId: staff.id,
        title: "New work order",
        message: `${issueRow.ticketId} was assigned to you.`,
        type: "assignment",
      },
      {
        userId: issueRow.reporterId,
        title: "Issue assigned",
        message: `${issueRow.ticketId} has been routed to ${input.data.primaryDepartment}.`,
        type: "assignment",
      },
    ]);
    if (input.data.notifySupporting && supportingDepartmentIds.length) {
      const supportingStaff = users.filter(
        (user) =>
          user.role === "staff" &&
          user.departmentId !== null &&
          supportingDepartmentIds.includes(user.departmentId),
      );
      if (supportingStaff.length) {
        await tx.insert(campusNotificationsTable).values(
          supportingStaff.map((user) => ({
            userId: user.id,
            title: "Supporting team requested",
            message: `${issueRow.ticketId} needs support for ${input.data.supportingDepartments.join(", ")}.`,
            type: "assignment" as const,
          })),
        );
      }
    }
  });
  const issue = await getCampusIssue(issueRow.id);
  if (!issue) {
    res.status(500).json({ error: "Updated issue could not be retrieved" });
    return;
  }
  res.json(AssignCampusIssueResponse.parse(issue));
});

router.post("/campusfix/issues/:issueId/status", async (req, res): Promise<void> => {
  const params = UpdateCampusIssueStatusParams.safeParse(req.params);
  const input = UpdateCampusIssueStatusBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  await ensureCampusSeeded();
  const [issueRow, users] = await Promise.all([
    db.query.campusIssuesTable.findFirst({
      where: eq(campusIssuesTable.id, params.data.issueId),
    }),
    db.select().from(campusUsersTable),
  ]);
  if (!issueRow) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  const staffName =
    users.find((user) => user.id === issueRow.assignedStaffId)?.name ?? "Maintenance staff";
  const now = new Date();
  const resolvedNow =
    input.data.status === "Resolved" &&
    issueRow.status !== "Resolved" &&
    issueRow.status !== "Verified";
  await db.transaction(async (tx) => {
    await tx
      .update(campusIssuesTable)
      .set({
        status: input.data.status,
        resolutionNotes:
          input.data.status === "Resolved"
            ? input.data.note || issueRow.resolutionNotes
            : issueRow.resolutionNotes,
        resolutionImageUrl:
          input.data.status === "Resolved"
            ? input.data.resolutionImageUrl
            : issueRow.resolutionImageUrl,
        resolvedAt: resolvedNow ? now : issueRow.resolvedAt,
        updatedAt: now,
      })
      .where(eq(campusIssuesTable.id, issueRow.id));
    await tx.insert(campusIssueTimelineTable).values({
      issueId: issueRow.id,
      status: input.data.status,
      note: input.data.note || `Status changed to ${input.data.status}.`,
      actorName: staffName,
      timestamp: now,
    });
    await tx.insert(campusNotificationsTable).values({
      userId: issueRow.reporterId,
      title:
        input.data.status === "Resolved" ? "Issue resolved" : "Issue status updated",
      message: `${issueRow.ticketId} is now ${input.data.status.toLowerCase()}.`,
      type: "status_change",
    });
    if (resolvedNow) {
      const reporter = users.find((user) => user.id === issueRow.reporterId);
      if (reporter) {
        const nextBalance = reporter.creditsBalance + 10;
        await tx
          .update(campusUsersTable)
          .set({ creditsBalance: nextBalance })
          .where(eq(campusUsersTable.id, reporter.id));
        await tx.insert(campusCreditActivityTable).values({
          userId: reporter.id,
          points: 10,
          description: `Verified resolution of ${issueRow.ticketId}`,
        });
        await tx.insert(campusNotificationsTable).values({
          userId: reporter.id,
          title: "Resolution credits earned",
          message: "You received 10 credits after maintenance resolved your report.",
          type: "credits",
        });
        const badges = await tx.select().from(campusBadgesTable);
        const cleanBadge = badges.find((badge) => badge.name === "Clean Campus Hero");
        if (
          cleanBadge &&
          (issueRow.primaryCategoryId ===
            (await tx
              .select({ id: campusCategoriesTable.id })
              .from(campusCategoriesTable)
              .where(eq(campusCategoriesTable.name, "Cleanliness"))
              .then((rows) => rows[0]?.id ?? -1)) ||
            issueRow.secondaryCategoryId ===
              (await tx
                .select({ id: campusCategoriesTable.id })
                .from(campusCategoriesTable)
                .where(eq(campusCategoriesTable.name, "Cleanliness"))
                .then((rows) => rows[0]?.id ?? -1)))
        ) {
          await tx
            .insert(campusUserBadgesTable)
            .values({ userId: reporter.id, badgeId: cleanBadge.id })
            .onConflictDoNothing();
        }
        const guardian = badges.find((badge) => badge.name === "Campus Guardian");
        if (guardian && nextBalance >= 40) {
          await tx
            .insert(campusUserBadgesTable)
            .values({ userId: reporter.id, badgeId: guardian.id })
            .onConflictDoNothing();
        }
      }
    }
  });
  const issue = await getCampusIssue(issueRow.id);
  if (!issue) {
    res.status(500).json({ error: "Updated issue could not be retrieved" });
    return;
  }
  res.json(UpdateCampusIssueStatusResponse.parse(issue));
});

router.get("/campusfix/credits/:userId", async (req, res): Promise<void> => {
  const params = GetCampusCreditsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const profile = await getCreditProfile(params.data.userId);
  if (!profile) {
    res.status(404).json({ error: "CampusFix user not found" });
    return;
  }
  res.json(GetCampusCreditsResponse.parse(profile));
});

router.get("/campusfix/notifications/:userId", async (req, res): Promise<void> => {
  const params = ListCampusNotificationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const notifications = await listCampusNotifications(params.data.userId);
  res.json(ListCampusNotificationsResponse.parse(notifications));
});

router.patch(
  "/campusfix/notifications/:notificationId/read",
  async (req, res): Promise<void> => {
    const params = MarkCampusNotificationReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await ensureCampusSeeded();
    const [notification] = await db
      .update(campusNotificationsTable)
      .set({ read: true })
      .where(eq(campusNotificationsTable.id, params.data.notificationId))
      .returning({
        id: campusNotificationsTable.id,
        userId: campusNotificationsTable.userId,
        title: campusNotificationsTable.title,
        message: campusNotificationsTable.message,
        type: campusNotificationsTable.type,
        read: campusNotificationsTable.read,
        createdAt: campusNotificationsTable.createdAt,
      });
    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json(MarkCampusNotificationReadResponse.parse(notification));
  },
);

export default router;
