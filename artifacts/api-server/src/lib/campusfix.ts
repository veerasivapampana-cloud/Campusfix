import { count, desc, eq } from "drizzle-orm";
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

const departments = [
  "Electrical Maintenance",
  "Plumbing Maintenance",
  "IT & Network Services",
  "Facilities & Sanitation",
  "Campus Security",
  "Estate & Civil Works",
] as const;

const categories = [
  "Electrical Safety",
  "Plumbing",
  "Wi-Fi / Network",
  "Cleanliness",
  "Classroom Equipment",
  "Hostel",
  "Security",
  "Infrastructure",
  "Furniture",
  "Laboratory",
  "Other",
] as const;

const categoryDepartment: Record<string, string> = {
  "Electrical Safety": "Electrical Maintenance",
  Plumbing: "Plumbing Maintenance",
  "Wi-Fi / Network": "IT & Network Services",
  Cleanliness: "Facilities & Sanitation",
  "Classroom Equipment": "Facilities & Sanitation",
  Hostel: "Facilities & Sanitation",
  Security: "Campus Security",
  Infrastructure: "Estate & Civil Works",
  Furniture: "Estate & Civil Works",
  Laboratory: "IT & Network Services",
  Other: "Facilities & Sanitation",
};

const severityRank = { Critical: 4, High: 3, Medium: 2, Low: 1 } as const;

let seedWork: Promise<void> | undefined;

function hasAny(value: string, words: string[]): boolean {
  return words.some((word) => value.includes(word));
}

function scorePriority(score: number): "P1" | "P2" | "P3" | "P4" {
  if (score >= 85) return "P1";
  if (score >= 65) return "P2";
  if (score >= 40) return "P3";
  return "P4";
}

export function analyzeIssueText(description: string, location: string) {
  const text = `${description} ${location}`.toLowerCase();
  const electrical = hasAny(text, [
    "electric",
    "socket",
    "wire",
    "spark",
    "shock",
    "panel",
    "breaker",
    "flicker",
    "tube light",
    "outlet",
  ]);
  const plumbing = hasAny(text, [
    "water",
    "leak",
    "pipe",
    "moisture",
    "drip",
    "tap",
    "faucet",
    "overflow",
  ]);
  const wetFloor = hasAny(text, [
    "floor",
    "slip",
    "dirty",
    "washroom",
    "pooling",
  ]);
  const network = hasAny(text, [
    "wifi",
    "wi-fi",
    "internet",
    "router",
    "connection",
    "network",
  ]);
  const lab = hasAny(text, ["lab", "laboratory", "computer", "exam"]);
  let primaryCategory = "Other";
  let secondaryCategory: string | null = null;
  let severity: "Low" | "Medium" | "High" | "Critical" = "Low";
  let priorityScore = 28;
  let aiReasoning = ["No immediate safety trigger detected from the report."];

  if (electrical && plumbing) {
    primaryCategory = "Electrical Safety";
    secondaryCategory = "Plumbing";
    severity = "Critical";
    priorityScore = 96;
    aiReasoning = [
      "Electrical risk takes operational precedence over secondary water damage.",
      "Water in contact with electrical fixtures creates an immediate shock and fire hazard.",
      "Multi-system conflict detected: Electrical Safety + Plumbing.",
    ];
  } else if (plumbing && wetFloor) {
    primaryCategory = "Plumbing";
    secondaryCategory = "Cleanliness";
    severity = "High";
    priorityScore = 78;
    aiReasoning = [
      "Water on a walking surface creates a slip hazard.",
      "Plumbing repair and floor sanitation are both required.",
      "The issue involves more than one maintenance system.",
    ];
  } else if (network && lab) {
    primaryCategory = "Wi-Fi / Network";
    secondaryCategory = "Laboratory";
    severity = "High";
    priorityScore = 72;
    aiReasoning = [
      "Connectivity failure affects laboratory equipment or exam operations.",
      "Network services should check the access point and local connection.",
      "Laboratory operations are a supporting impact area.",
    ];
  } else {
    const matches: Array<[string, string[]]> = [
      [
        "Electrical Safety",
        [
          "electric",
          "socket",
          "wire",
          "spark",
          "shock",
          "panel",
          "breaker",
          "flicker",
          "light",
          "power",
        ],
      ],
      [
        "Plumbing",
        ["water", "leak", "pipe", "tap", "faucet", "drip", "washroom"],
      ],
      [
        "Wi-Fi / Network",
        ["wifi", "wi-fi", "internet", "router", "connection", "network"],
      ],
      ["Cleanliness", ["dirty", "trash", "garbage", "spill", "clean", "floor"]],
      [
        "Classroom Equipment",
        ["projector", "screen", "whiteboard", "classroom", "fan"],
      ],
      ["Hostel", ["hostel", "dorm", "residence"]],
      ["Security", ["security", "gate", "lock", "camera", "theft"]],
      [
        "Infrastructure",
        ["crack", "roof", "ceiling", "wall", "pavement", "structural"],
      ],
      ["Furniture", ["desk", "chair", "seat", "table", "bench"]],
      ["Laboratory", ["lab", "laboratory", "chemical", "experiment"]],
    ];
    const found = matches
      .filter(([, words]) => hasAny(text, words))
      .map(([category]) => category);
    primaryCategory = found[0] ?? "Other";
    secondaryCategory = found[1] ?? null;
    if (hasAny(text, ["fire", "smoke", "exposed wire", "shock", "collapse"])) {
      severity = "Critical";
    } else if (
      hasAny(text, ["urgent", "unsafe", "danger", "broken", "overflow"])
    ) {
      severity = "High";
    } else if (hasAny(text, ["damaged", "not working", "failed", "blocked"])) {
      severity = "Medium";
    }
    const severityPoints = { Critical: 40, High: 30, Medium: 20, Low: 10 }[
      severity
    ];
    const safetyPoints =
      severity === "Critical" ? 28 : severity === "High" ? 18 : 10;
    const trafficPoints = hasAny(text, [
      "block a",
      "auditorium",
      "library",
      "cafeteria",
      "exam",
      "main hall",
    ])
      ? 15
      : 7;
    const recurrencePoints = hasAny(text, ["leak", "flicker", "repeated", "again"])
      ? 12
      : 5;
    priorityScore = Math.min(
      100,
      severityPoints + safetyPoints + trafficPoints + recurrencePoints,
    );
    aiReasoning = [
      `${primaryCategory} is the strongest category match in the report.`,
      secondaryCategory
        ? `${secondaryCategory} is listed as a supporting impact area.`
        : "No secondary maintenance system was detected.",
      `Severity and location signals produce a priority score of ${priorityScore}.`,
    ];
  }

  const primaryDepartment = categoryDepartment[primaryCategory] ?? departments[5];
  const supportingDepartments = secondaryCategory
    ? [categoryDepartment[secondaryCategory]].filter(
        (name) => name !== primaryDepartment,
      )
    : [];
  const safetyRisk =
    severity === "Critical"
      ? "Immediate risk to people or campus operations; isolate the hazard and dispatch the responsible team now."
      : severity === "High"
        ? "Elevated risk that may cause injury or disrupt essential campus activity if left unattended."
        : severity === "Medium"
          ? "A service or equipment issue that could worsen without timely maintenance."
          : "Low immediate safety exposure; schedule a routine inspection or repair.";
  const suggestedAction =
    primaryCategory === "Electrical Safety" && secondaryCategory === "Plumbing"
      ? `Keep people clear of the affected area. Isolate the circuit only if safe, dispatch ${primaryDepartment} first, then coordinate ${supportingDepartments[0] ?? "Plumbing Maintenance"} to stop the leak.`
      : primaryCategory === "Plumbing" && secondaryCategory === "Cleanliness"
        ? "Restrict access to the wet floor, stop the water source, repair the plumbing, and dry and sanitize the area."
        : primaryCategory === "Wi-Fi / Network"
          ? "Check the nearest access point, router power and cabling; verify service in the affected lab before closing the ticket."
          : `Dispatch ${primaryDepartment} to inspect ${location} and record the repair before closing the issue.`;
  const priority = scorePriority(priorityScore);

  return {
    primaryCategory,
    secondaryCategory,
    additionalCategories: [] as string[],
    severity,
    priority,
    priorityScore,
    safetyRisk,
    primaryDepartment,
    supportingDepartments,
    suggestedAction,
    aiSummary: `${primaryCategory}${secondaryCategory ? ` with ${secondaryCategory} overlap` : ""} reported at ${location}.`,
    aiReasoning,
  };
}

async function seedDemoData(): Promise<void> {
  await db
    .insert(campusDepartmentsTable)
    .values(departments.map((name) => ({ name })))
    .onConflictDoNothing();
  await db
    .insert(campusCategoriesTable)
    .values(
      categories.map((name, index) => ({
        name,
        icon: name.toLowerCase().replace(/[^a-z]+/g, "-"),
        baseWeight: 10 + Math.max(0, 5 - index),
      })),
    )
    .onConflictDoNothing();

  const departmentRows = await db.select().from(campusDepartmentsTable);
  const categoryRows = await db.select().from(campusCategoriesTable);
  const departmentId = new Map(departmentRows.map((item) => [item.name, item.id]));
  const categoryId = new Map(categoryRows.map((item) => [item.name, item.id]));

  for (const user of [
    { name: "Maya Patel", email: "student@campusfix.demo", role: "student" as const, departmentId: null, creditsBalance: 45 },
    { name: "Jordan Lee", email: "admin@campusfix.demo", role: "admin" as const, departmentId: null, creditsBalance: 0 },
    { name: "Dave Miller", email: "staff@campusfix.demo", role: "staff" as const, departmentId: departmentId.get("Electrical Maintenance") ?? null, creditsBalance: 0 },
    { name: "Priya Nair", email: "plumbing@campusfix.demo", role: "staff" as const, departmentId: departmentId.get("Plumbing Maintenance") ?? null, creditsBalance: 0 },
    { name: "Ethan Chen", email: "it@campusfix.demo", role: "staff" as const, departmentId: departmentId.get("IT & Network Services") ?? null, creditsBalance: 0 },
    { name: "Rosa Kim", email: "facilities@campusfix.demo", role: "staff" as const, departmentId: departmentId.get("Facilities & Sanitation") ?? null, creditsBalance: 0 },
    { name: "Sam Okafor", email: "security@campusfix.demo", role: "staff" as const, departmentId: departmentId.get("Campus Security") ?? null, creditsBalance: 0 },
  ]) {
    await db.insert(campusUsersTable).values(user).onConflictDoNothing();
  }
  const users = await db.select().from(campusUsersTable);
  const userByEmail = new Map(users.map((user) => [user.email, user]));
  const student = userByEmail.get("student@campusfix.demo");
  const staffByDepartment = new Map(
    users
      .filter((user) => user.role === "staff" && user.departmentId)
      .map((user) => [user.departmentId as number, user.id]),
  );
  if (!student) throw new Error("CampusFix demo student could not be initialized");

  const badgeSeed = [
    { name: "First Reporter", description: "Submitted your first campus issue.", icon: "flag", requiredCredits: 0 },
    { name: "Safety Watch", description: "Reported a high-priority campus safety hazard.", icon: "shield", requiredCredits: 0 },
    { name: "Clean Campus Hero", description: "Helped resolve a cleanliness issue.", icon: "sparkles", requiredCredits: 0 },
    { name: "Campus Guardian", description: "Earned 40 Campus Credits.", icon: "award", requiredCredits: 40 },
  ];
  await db.insert(campusBadgesTable).values(badgeSeed).onConflictDoNothing();
  const [issueCount] = await db
    .select({ value: count() })
    .from(campusIssuesTable);
  if (Number(issueCount?.value ?? 0) > 0) return;

  const seedIssues = [
    { description: "Water is leaking from the AC/ceiling duct right onto the main electrical socket and distribution box.", location: "Block A - Room 204", status: "Reported" as const },
    { description: "Hostel B washroom tap is broken and water is pooling on the floor.", location: "Hostel B - Washroom 2", status: "In Progress" as const },
    { description: "Computer Lab 3 Wi-Fi router is loose and dropping connection during exams.", location: "Tech Park - Computer Lab 3", status: "Assigned" as const },
    { description: "Auditorium chair row 4 seat is broken and unstable.", location: "Auditorium - Row 4", status: "Resolved" as const },
    { description: "Library second-floor corridor tube light is flickering repeatedly.", location: "Library - Floor 2", status: "Reported" as const },
    { description: "Exposed wire near the Block B stairwell is sparking.", location: "Block B - Stairwell", status: "Assigned" as const },
    { description: "Cafeteria sink pipe is leaking under the counter.", location: "Cafeteria - Kitchen", status: "Resolved" as const },
    { description: "Security gate lock is jammed and will not secure the east entrance.", location: "East Gate", status: "In Progress" as const },
    { description: "Crack in the ceiling near the lecture hall entrance is growing.", location: "Block A - Lecture Hall", status: "Reported" as const },
    { description: "Chemistry lab computer network connection is down before practical exams.", location: "Science Block - Lab 2", status: "Assigned" as const },
    { description: "Overflowing trash bins and a dirty floor beside the student lounge.", location: "Student Centre - Lounge", status: "Reported" as const },
    { description: "Hostel A roof has a leak after the rain.", location: "Hostel A - Floor 3", status: "Resolved" as const },
    { description: "Water dripping from the washroom pipe onto a slippery floor.", location: "Block B - Washroom 1", status: "Reported" as const },
    { description: "Library internet connection drops repeatedly on the second floor.", location: "Library - Study Area", status: "In Progress" as const },
    { description: "Classroom projector screen is damaged and will not lower.", location: "Block A - Room 110", status: "Resolved" as const },
  ];

  for (let index = 0; index < seedIssues.length; index += 1) {
    const seed = seedIssues[index];
    const analysis = analyzeIssueText(seed.description, seed.location);
    const primaryDeptId = departmentId.get(analysis.primaryDepartment);
    const primaryCatId = categoryId.get(analysis.primaryCategory);
    if (!primaryDeptId || !primaryCatId) {
      throw new Error(`Missing seeded CampusFix mapping for ${analysis.primaryCategory}`);
    }
    const assignedStaffId =
      seed.status === "Reported"
        ? null
        : (staffByDepartment.get(primaryDeptId) ?? null);
    const createdAt = new Date(Date.now() - index * 3 * 60 * 60 * 1000);
    const resolved = seed.status === "Resolved";
    const [issue] = await db
      .insert(campusIssuesTable)
      .values({
        ticketId: `CF-2026-${String(101 + index).padStart(5, "0")}`,
        title: seed.description.length > 58 ? `${seed.description.slice(0, 55)}…` : seed.description,
        description: seed.description,
        location: seed.location,
        primaryCategoryId: primaryCatId,
        secondaryCategoryId: analysis.secondaryCategory
          ? (categoryId.get(analysis.secondaryCategory) ?? null)
          : null,
        additionalCategories: analysis.additionalCategories,
        severity: analysis.severity,
        priority: analysis.priority,
        priorityScore: analysis.priorityScore,
        safetyRisk: analysis.safetyRisk,
        suggestedAction: analysis.suggestedAction,
        aiSummary: analysis.aiSummary,
        aiReasoning: analysis.aiReasoning,
        reporterId: student.id,
        assignedStaffId,
        primaryDepartmentId: primaryDeptId,
        supportingDepartmentIds: analysis.supportingDepartments
          .map((name) => departmentId.get(name))
          .filter((value): value is number => value !== undefined),
        status: seed.status,
        resolutionNotes: resolved ? "Repair completed and site checked by maintenance." : null,
        resolvedAt: resolved ? createdAt : null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: campusIssuesTable.id });
    if (!issue) continue;
    await db.insert(campusIssueTimelineTable).values({
      issueId: issue.id,
      status: "Reported",
      note: "Issue submitted and analyzed by CampusFix.",
      actorName: student.name,
      timestamp: createdAt,
    });
    if (seed.status !== "Reported") {
      await db.insert(campusIssueTimelineTable).values({
        issueId: issue.id,
        status: seed.status,
        note: resolved ? "Maintenance completed the repair." : "Routed to the responsible maintenance team.",
        actorName: assignedStaffId
          ? (users.find((user) => user.id === assignedStaffId)?.name ?? "CampusFix")
          : "CampusFix",
        timestamp: createdAt,
      });
    }
  }

  const awardBadge = async (name: string) => {
    const badge = (await db.select().from(campusBadgesTable)).find(
      (item) => item.name === name,
    );
    if (badge) {
      await db
        .insert(campusUserBadgesTable)
        .values({ userId: student.id, badgeId: badge.id })
        .onConflictDoNothing();
    }
  };
  await db.insert(campusCreditActivityTable).values([
    { userId: student.id, points: 15, description: "Reported CF-2026-00101" },
    { userId: student.id, points: 15, description: "Reported CF-2026-00102" },
    { userId: student.id, points: 15, description: "Reported CF-2026-00103" },
  ]);
  await awardBadge("First Reporter");
  await awardBadge("Safety Watch");
  await awardBadge("Campus Guardian");
  await db.insert(campusNotificationsTable).values([
    {
      userId: student.id,
      title: "Issue received",
      message: "Your report CF-2026-00101 is in the priority queue.",
      type: "status_change",
    },
    {
      userId: student.id,
      title: "Campus Credits earned",
      message: "You received 15 credits for reporting a campus issue.",
      type: "credits",
    },
  ]);
}

export async function ensureCampusSeeded(): Promise<void> {
  seedWork ??= seedDemoData().catch((error: unknown) => {
    seedWork = undefined;
    throw error;
  });
  await seedWork;
}

export async function listCampusUsers() {
  await ensureCampusSeeded();
  const [users, departmentsRows] = await Promise.all([
    db.select().from(campusUsersTable),
    db.select().from(campusDepartmentsTable),
  ]);
  const departmentById = new Map(
    departmentsRows.map((department) => [department.id, department.name]),
  );
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.departmentId
      ? (departmentById.get(user.departmentId) ?? null)
      : null,
    creditsBalance: user.creditsBalance,
  }));
}

export async function listCampusIssues() {
  await ensureCampusSeeded();
  const [issues, users, categoriesRows, departmentsRows] = await Promise.all([
    db.select().from(campusIssuesTable),
    db.select().from(campusUsersTable),
    db.select().from(campusCategoriesTable),
    db.select().from(campusDepartmentsTable),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const categoryById = new Map(
    categoriesRows.map((category) => [category.id, category.name]),
  );
  const departmentById = new Map(
    departmentsRows.map((department) => [department.id, department.name]),
  );
  return issues
    .map((issue) => ({
      id: issue.id,
      ticketId: issue.ticketId,
      title: issue.title,
      description: issue.description,
      imageUrl: issue.imageUrl,
      location: issue.location,
      primaryCategory: categoryById.get(issue.primaryCategoryId) ?? "Other",
      secondaryCategory: issue.secondaryCategoryId
        ? (categoryById.get(issue.secondaryCategoryId) ?? null)
        : null,
      additionalCategories: issue.additionalCategories,
      severity: issue.severity,
      priority: issue.priority,
      priorityScore: issue.priorityScore,
      safetyRisk: issue.safetyRisk,
      suggestedAction: issue.suggestedAction,
      aiSummary: issue.aiSummary,
      aiReasoning: issue.aiReasoning,
      reporterId: issue.reporterId,
      reporterName: userById.get(issue.reporterId)?.name ?? "Campus member",
      assignedStaffId: issue.assignedStaffId,
      assignedStaffName: issue.assignedStaffId
        ? (userById.get(issue.assignedStaffId)?.name ?? null)
        : null,
      primaryDepartment:
        departmentById.get(issue.primaryDepartmentId) ?? "Facilities & Sanitation",
      supportingDepartments: issue.supportingDepartmentIds
        .map((id) => departmentById.get(id))
        .filter((name): name is string => Boolean(name)),
      status: issue.status,
      resolutionNotes: issue.resolutionNotes,
      resolutionImageUrl: issue.resolutionImageUrl,
      resolvedAt: issue.resolvedAt,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      _severityRank: severityRank[issue.severity],
    }))
    .sort(
      (left, right) =>
        right.priorityScore - left.priorityScore ||
        right._severityRank - left._severityRank ||
        right.createdAt.getTime() - left.createdAt.getTime(),
    )
    .map(({ _severityRank: _rank, ...issue }) => issue);
}

export async function getCampusIssue(id: number) {
  const issues = await listCampusIssues();
  return issues.find((issue) => issue.id === id) ?? null;
}

export async function getCampusOverview() {
  const issues = await listCampusIssues();
  const activeP1 = issues.filter(
    (issue) => issue.priority === "P1" && !["Resolved", "Verified"].includes(issue.status),
  ).length;
  const resolved = issues.filter((issue) =>
    ["Resolved", "Verified"].includes(issue.status),
  ).length;
  const hotspotCounts = new Map<string, number>();
  for (const issue of issues) {
    const building = issue.location.split(" - ")[0] ?? issue.location;
    hotspotCounts.set(building, (hotspotCounts.get(building) ?? 0) + 1);
  }
  const hotspotOfDay =
    [...hotspotCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No hotspot";
  return {
    totalIssues: issues.length,
    activeP1,
    unassigned: issues.filter((issue) => !issue.assignedStaffId).length,
    resolutionRate: issues.length ? Math.round((resolved / issues.length) * 100) : 0,
    averageTriageMinutes: 12,
    hotspotOfDay,
  };
}

export async function getCampusAnalytics() {
  const issues = await listCampusIssues();
  const categoryNames = [...new Set(issues.map((issue) => issue.primaryCategory))];
  const categoriesData = categoryNames
    .map((name) => ({
      name,
      count: issues.filter((issue) => issue.primaryCategory === name).length,
      overlapCount: issues.filter(
        (issue) =>
          issue.primaryCategory === name && Boolean(issue.secondaryCategory),
      ).length,
    }))
    .sort((a, b) => b.count - a.count);

  const locationCounts = new Map<string, { reports: number; focus: string }>();
  for (const issue of issues) {
    const location = issue.location.split(" - ")[0] ?? issue.location;
    const current = locationCounts.get(location) ?? {
      reports: 0,
      focus: `${issue.primaryCategory}${issue.secondaryCategory ? ` + ${issue.secondaryCategory}` : ""}`,
    };
    locationCounts.set(location, { ...current, reports: current.reports + 1 });
  }
  const campusMean = issues.length
    ? issues.length / Math.max(locationCounts.size, 1)
    : 0;
  const hotspots = [...locationCounts.entries()]
    .map(([location, value]) => ({
      location,
      reports: value.reports,
      aboveCampusMean: campusMean
        ? Math.round(((value.reports - campusMean) / campusMean) * 100)
        : 0,
      focus: value.focus,
    }))
    .sort((a, b) => b.reports - a.reports);

  const departmentNames = [...new Set(issues.map((issue) => issue.primaryDepartment))];
  const departmentAnalytics = departmentNames.map((name) => {
    const matching = issues.filter((issue) => issue.primaryDepartment === name);
    const resolvedRows = matching.filter((issue) => issue.resolvedAt);
    const hours = resolvedRows.map((issue) =>
      Math.max(
        0,
        ((issue.resolvedAt?.getTime() ?? 0) - issue.createdAt.getTime()) / 3600000,
      ),
    );
    return {
      name,
      total: matching.length,
      resolved: matching.filter((issue) =>
        ["Resolved", "Verified"].includes(issue.status),
      ).length,
      averageResolutionHours: hours.length
        ? Math.round((hours.reduce((sum, value) => sum + value, 0) / hours.length) * 10) / 10
        : 0,
    };
  });
  const overlapLocation = issues.find(
    (issue) => issue.primaryCategory === "Electrical Safety" && issue.secondaryCategory === "Plumbing",
  )?.location.split(" - ")[0];
  return {
    categories: categoriesData,
    hotspots,
    departments: departmentAnalytics,
    recommendation: overlapLocation
      ? `Inspect water risers adjacent to electrical utility shafts in ${overlapLocation}.`
      : "Review recurring campus reports and schedule preventive inspections in the busiest buildings.",
  };
}

export async function getCreditProfile(userId: number) {
  await ensureCampusSeeded();
  const user = await db.query.campusUsersTable.findFirst({
    where: eq(campusUsersTable.id, userId),
  });
  if (!user) return null;
  const [allBadges, earned, activity] = await Promise.all([
    db.select().from(campusBadgesTable),
    db
      .select()
      .from(campusUserBadgesTable)
      .where(eq(campusUserBadgesTable.userId, userId)),
    db
      .select()
      .from(campusCreditActivityTable)
      .where(eq(campusCreditActivityTable.userId, userId))
      .orderBy(desc(campusCreditActivityTable.createdAt)),
  ]);
  const earnedIds = new Set(earned.map((item) => item.badgeId));
  return {
    userName: user.name,
    balance: user.creditsBalance,
    tier:
      user.creditsBalance >= 100
        ? "Campus Champion"
        : user.creditsBalance >= 40
          ? "Campus Guardian"
          : user.creditsBalance >= 15
            ? "Campus Reporter"
            : "New Reporter",
    badges: allBadges.map((badge) => ({
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      awarded: earnedIds.has(badge.id),
    })),
    activity: activity.map((item) => ({
      id: item.id,
      points: item.points,
      description: item.description,
      createdAt: item.createdAt,
    })),
  };
}

export async function listCampusNotifications(userId: number) {
  await ensureCampusSeeded();
  return db
    .select({
      id: campusNotificationsTable.id,
      userId: campusNotificationsTable.userId,
      title: campusNotificationsTable.title,
      message: campusNotificationsTable.message,
      type: campusNotificationsTable.type,
      read: campusNotificationsTable.read,
      createdAt: campusNotificationsTable.createdAt,
    })
    .from(campusNotificationsTable)
    .where(eq(campusNotificationsTable.userId, userId))
    .orderBy(desc(campusNotificationsTable.createdAt));
}
