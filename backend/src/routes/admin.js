const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { hashPassword, publicUser } = require("../lib/auth");
const { buildStudentStats } = require("../lib/student_stats");
const {
  premiumState,
  grantPremium,
  revokePremium,
  expireLapsedSubscriptions,
} = require("../lib/premium");

const router = express.Router();
router.use(requireAuth, requireRole("ADMIN"));

// ---- User management ----
router.get("/users", async (req, res) => {
  const { search, role, status } = req.query;
  const users = await prisma.user.findMany({
    where: {
      // Admins look students up by name, email, student ID or course.
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { studentId: { contains: search, mode: "insensitive" } },
              { course: { contains: search, mode: "insensitive" } },
            ],
          }
        : { }),
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users: users.map(publicUser) });
});

// Full profile for a single user. Returns the real, already-stored profile
// fields plus a few useful activity totals — and deliberately omits internal
// fields (password hash, verification codes, raw JSON blobs) that an admin
// reviewer has no reason to see.
// Full profile for a single user. Returns the real, already-stored profile
// fields plus useful activity totals. Internal fields (password hash,
// verification codes, raw JSON blobs) are deliberately omitted.
//
// Note: query defaults are built with small helper objects rather than nested
// inline literals, which keeps each line easy to read and review.
router.get("/users/:id", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const userId = user.id;
    const zero = { _sum: { minutes: 0 } };
    const zeroQuiz = { _sum: { score: 0, total: 0 } };
    const safe = (promise, fallback) => promise.catch(() => fallback);

    const focusWhere = { userId, type: "focus" };
    const focusAggQuery = prisma.pomodoroSession.aggregate({ where: focusWhere, _sum: { minutes: true } });
    const focusCountQuery = prisma.pomodoroSession.count({ where: focusWhere });
    const lastSessionQuery = prisma.pomodoroSession.findFirst({
      where: { userId },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });

    const taskWhere = { userId };
    const doneWhere = { userId, completed: true };
    const attemptWhere = { userId };
    const attemptAggQuery = prisma.quizAttempt.aggregate({ where: attemptWhere, _sum: { score: true, total: true } });

    const cardWhere = { collection: { userId } };
    const msgWhere = { conversation: { userId } };

    const results = await Promise.all([
      safe(focusAggQuery, zero),
      safe(focusCountQuery, 0),
      safe(lastSessionQuery, null),
      safe(prisma.task.count({ where: taskWhere }), 0),
      safe(prisma.task.count({ where: doneWhere }), 0),
      safe(prisma.quizAttempt.count({ where: attemptWhere }), 0),
      safe(attemptAggQuery, zeroQuiz),
      safe(prisma.flashcard.count({ where: cardWhere }), 0),
      safe(prisma.studyNote.count({ where: taskWhere }), 0),
      safe(prisma.chatConversation.count({ where: taskWhere }), 0),
      safe(prisma.chatMessage.count({ where: msgWhere }), 0),
      safe(prisma.subscription.findUnique({ where: { userId }}), null),
      safe(
        prisma.payment.findMany({
          where: { userId, status: "PAID" },
          orderBy: { paidAt: "desc" },
          take: 5,
        }),
        []
      ),
      safe(buildStudentStats(userId), null),
    ]);

    const focusAgg = results[0];
    const focusSessions = results[1];
    const lastSession = results[2];
    const taskTotal = results[3];
    const taskDone = results[4];
    const quizAttempts = results[5];
    const quizAgg = results[6];
    const cards = results[7];
    const notesCount = results[8];
    const conversations = results[9];
    const messages = results[10];
    const subscription = results[11];
    const payments = results[12];
    const statistics = results[13];

    const quizTotal = (quizAgg && quizAgg._sum && quizAgg._sum.total) || 0;
    const quizScored = (quizAgg && quizAgg._sum && quizAgg._sum.score) || 0;

    res.json({
      user: publicUser(user),
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        profilePicture: user.profilePicture || null,
        studentId: user.studentId || null,
        course: user.course || null,
        yearLevel: user.yearLevel || null,
        section: user.section || null,
        studyGoals: user.studyGoals || null,
        preferredStudyDuration: user.preferredStudyDuration || null,
        dailyGoalMinutes: user.dailyGoalMinutes,
        remindersEnabled: user.remindersEnabled,
        reminderTime: user.reminderTime,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt,
      },
      activity: {
        totalStudyMinutes: statistics?.totalStudyMinutes ?? ((focusAgg && focusAgg._sum && focusAgg._sum.minutes) || 0),
        focusSessions: statistics?.totalFocusSessions ?? focusSessions,
        lastSessionAt: statistics?.lastSessionAt ?? (lastSession ? lastSession.startedAt : null),
        todayMinutes: statistics?.todayMinutes || 0,
        last7Minutes: statistics?.last7Minutes || 0,
        activeDaysLast7: statistics?.activeDaysLast7 || 0,
        tasksTotal: statistics?.totalTasks ?? taskTotal,
        tasksCompleted: statistics?.completedTasks ?? taskDone,
        completionRate: statistics?.completionRate ?? (taskTotal ? Math.round((taskDone / taskTotal) * 100) : 0),
        quizAttempts: statistics?.quizzesTaken ?? quizAttempts,
        averageQuizScore: statistics?.averageQuizScore ?? (quizTotal ? Math.round((quizScored / quizTotal) * 100) : 0),
        quizCompletionRate: statistics?.quizCompletionRate || 0,
        flashcards: statistics?.flashcards ?? cards,
        notes: statistics?.notes ?? notesCount,
        aiConversations: statistics?.aiConversations ?? conversations,
        aiMessages: statistics?.aiMessages ?? messages,
        xp: statistics?.xp ?? user.xp,
        level: statistics?.level ?? user.currentLevel,
        streak: statistics?.streak ?? user.streakCount,
        longestStreak: statistics?.longestStreak ?? user.longestStreak,
      },
      statistics,
      premium: premiumState(user),
      subscription: subscription
        ? {
            status: subscription.status,
            plan: subscription.plan,
            startedAt: subscription.startedAt,
            expiresAt: subscription.expiresAt,
          }
        : null,
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.paymentMethod,
        paidAt: p.paidAt,
      })),
    });
  } catch (err) {
    console.error("Admin user detail failed", err);
    res.status(500).json({ error: "Could not load that user's profile" });
  }
});


router.post("/users", async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, and role are required" });
  }
  if (!["STUDENT", "ADMIN"].includes(role)) {
    return res.status(400).json({ error: "role must be STUDENT or ADMIN" });
  }
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { name, email: email.toLowerCase(), passwordHash, role } });
  await prisma.activityLog.create({ data: { userId: user.id, action: "account_created" } });
  res.status(201).json({ user: publicUser(user) });
});

router.patch("/users/:id", async (req, res) => {
const allowed = ["name", "email", "role", "status", "course", "yearLevel", "section", "studentId"];
  const data = {};
  for (const key of allowed) if (key in req.body) data[key] = req.body[key];

  if ("role" in data && !["STUDENT", "ADMIN"].includes(data.role)) {
    return res.status(400).json({ error: "role must be STUDENT or ADMIN" });
  }

  const user = await prisma.user.update({ where: { id: req.params.id }, data });
  if ("role" in data) await prisma.activityLog.create({ data: { userId: user.id, action: "role_change" } });
  if ("status" in data) {
    await prisma.activityLog.create({
      data: { userId: user.id, action: data.status === "DISABLED" ? "account_disabled" : "account_activated" },
    });
  }
  res.json({ user: publicUser(user) });
});

router.post("/users/:id/reset-password", async (req, res) => {
  const tempPassword = Math.random().toString(36).slice(2, 10);
  const passwordHash = await hashPassword(tempPassword);
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
  await prisma.activityLog.create({ data: { userId: user.id, action: "password_reset" } });
  // In production, email this rather than returning it in the response.
  res.json({ tempPassword });
});

router.delete("/users/:id", async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ---- Premium / Go Unlimited subscribers ----
// Mirrors what the student sees, in the Student | Account | Plan | Status shape
// requested for the admin dashboard.
router.get("/premium/subscribers", async (req, res) => {
  const { search, status } = req.query;

  // Expire lapsed terms first so the admin never sees a stale "Active".
  try {
    await expireLapsedSubscriptions();
  } catch (e) {
    // non-fatal
  }

  const users = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
              ],
          }
        : {}),
      ...(status === "premium"
        ? { isPremium: true }
        : status === "basic"
        ? { isPremium: false }
        : {}),
    },
    orderBy: [{ isPremium: "desc" }, { premiumSince: "desc" }, { name: "asc" }],
    take: 300,
  });

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
  });
  const subsByUser = new Map(subscriptions.map((s) => [s.userId, s]));

  const payments = await prisma.payment.findMany({
    where: { userId: { in: users.map((u) => u.id) }, status: "PAID" },
    orderBy: { paidAt: "desc" },
  });
  const lastPaymentByUser = new Map();
  for (const p of payments) {
    if (!lastPaymentByUser.has(p.userId)) lastPaymentByUser.set(p.userId, p);
  }

  const subscribers = users.map((u) => {
    const state = premiumState(u);
    const sub = subsByUser.get(u.id) || null;
    const lastPayment = lastPaymentByUser.get(u.id) || null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      accountStatus: u.status,
      plan: state.planLabel,
      planId: state.plan,
      status: state.isPremium ? "Active" : state.expired ? "Expired" : "Basic",
      isPremium: state.isPremium,
      premiumSince: u.premiumSince,
      premiumUntil: u.premiumUntil,
      daysRemaining: state.daysRemaining,
      subscriptionStatus: sub ? sub.status : null,
      lastPayment: lastPayment
        ? {
            id: lastPayment.id,
            amount: lastPayment.amount,
            currency: lastPayment.currency,
            paidAt: lastPayment.paidAt,
            method: lastPayment.paymentMethod,
          }
        : null,
    };
  });

  const premiumCount = subscribers.filter((s) => s.isPremium).length;

  res.json({
    subscribers,
    stats: {
      totalStudents: subscribers.length,
      premium: premiumCount,
      basic: subscribers.length - premiumCount,
      // Recurring revenue for the currently active term (simple flat-rate).
      monthlyRevenue: subscribers
        .filter((s) => s.isPremium && s.lastPayment)
        .reduce((sum, s) => sum + (s.lastPayment.amount || 0), 0),
    },
  });
});

// Manual grant/revoke for support cases (refunds, comps, goodwill).
router.post("/premium/subscribers/:userId", async (req, res) => {
  const { action, days } = req.body || {};
  const userId = req.params.userId;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return res.status(404).json({ error: "Student not found" });

  try {
    if (action === "grant") {
      await grantPremium({ userId, plan: "unlimited", durationDays: Number(days) || undefined });
    } else if (action === "revoke") {
      await revokePremium({ userId, status: "CANCELLED" });
    } else {
      return res.status(400).json({ error: "action must be grant or revoke" });
    }

    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: action === "grant" ? "admin_grant_premium" : "admin_revoke_premium",
        meta: { studentId: userId },
      },
    });

    const fresh = await prisma.user.findUnique({ where: { id: userId } });
    res.json({ user: publicUser(fresh), premium: premiumState(fresh) });
  } catch (err) {
    console.error("Admin premium update failed", err);
    res.status(500).json({ error: "Could not update that subscription" });
  }
});

// ---- Activity logs ----
router.get("/logs", async (req, res) => {
  const { search } = req.query;
  const logs = await prisma.activityLog.findMany({
    where: search
      ? { OR: [{ action: { contains: search, mode: "insensitive" } }, { user: { name: { contains: search, mode: "insensitive" } } }] }
      : undefined,
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ logs });
});

// ---- Analytics ----
router.get("/analytics", async (req, res) => {
  const [
    totalUsers,
    activeUsers,
    students,
    totalMaterials,
    totalQuizzes,
    totalSessions,
    totalTasks,
    totalCompletedTasks,
    totalSessionsAgg,
    totalAttempts,
    totalQuizIncludes,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.studyMaterial.count(),
    prisma.quiz.count(),
    prisma.pomodoroSession.count({ where: { type: "focus" } }),
    prisma.task.count(),
    prisma.task.count({ where: { completed: true } }),
    prisma.pomodoroSession.aggregate({ where: { type: "focus" }, _sum: { minutes: true } }),
    prisma.quizAttempt.count(),
    prisma.quizAttempt.aggregate({ _sum: { score: true, total: true } }),
  ]);

  const totalStudyMinutes = totalSessionsAgg._sum.minutes || 0;
  const avgStudyMinutes = students ? Math.round(totalStudyMinutes / students) : 0;

  const taskCompletionRate = totalTasks ? Math.round((totalCompletedTasks / totalTasks) * 100) : 0;
  const quizTotal = totalQuizIncludes?._sum?.total || 0;
  const quizScored = totalQuizIncludes?._sum?.score || 0;
  const averageQuizScore = quizTotal ? Math.round((quizScored / quizTotal) * 100) : 0;
  const quizCompletionRate = totalQuizzes ? Math.round((totalAttempts / totalQuizzes) * 100) : 0;

  const topStudents = await prisma.pomodoroSession.groupBy({
    by: ["userId"],
    where: { type: "focus" },
    _sum: { minutes: true },
    orderBy: { _sum: { minutes: "desc" } },
    take: 6,
  });

  const topStudentUsers = await prisma.user.findMany({
    where: { id: { in: topStudents.map((t) => t.userId) } },
    select: { id: true, name: true },
  });

  const mostActiveUsers = topStudents.map((t) => ({
    name: topStudentUsers.find((u) => u.id === t.userId)?.name || "Unknown",
    minutes: t._sum.minutes || 0,
  }));

  const now = new Date();
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const daySessions = await prisma.pomodoroSession.findMany({
      where: {
        type: "focus",
        startedAt: {
          gte: new Date(`${key}T00:00:00.000Z`),
          lt: new Date(`${key}T23:59:59.999Z`),
        },
      },
      select: { minutes: true },
    });
    const minutes = daySessions.reduce((sum, session) => sum + (session.minutes || 0), 0);
    last7Days.push({ date: key, minutes });
  }

  res.json({
    totalUsers,
    activeUsers,
    students,
    totalMaterials,
    totalQuizzes,
    totalSessions,
    totalFocusSessions: totalSessions,
    totalStudyMinutes,
    avgStudyMinutes,
    mostActiveUsers,
    totalTasks,
    totalCompletedTasks,
    taskCompletionRate,
    totalAttempts,
    averageQuizScore,
    quizCompletionRate,
    last7Days,
    completionRate: taskCompletionRate,
    averageStudyMinutes: avgStudyMinutes,
    quizCompletionRate,
    totalCompletedTasks,
  });
});

// ---- System settings ----
router.get("/system", async (req, res) => {
  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 }, update: {}, create: { id: 1 },
  });
  res.json({ settings });
});

router.patch("/system", async (req, res) => {
  const allowed = ["maintenanceMode", "allowSignups", "defaultDailyGoal"];
  const data = {};
  for (const key of allowed) if (key in req.body) data[key] = req.body[key];
  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 }, update: data, create: { id: 1, ...data },
  });
  res.json({ settings });
});

// ---- Content oversight (Cards / Notes / AI Coach) ----
// Admins can inspect and moderate student-generated study content. These
// endpoints read the SAME tables the student screens write to, so the admin
// side always reflects what users create (kept in sync by the database).

function normalizeSearch(search) {
  return search && String(search).trim() ? String(search).trim() : null;
}

// Aggregate counts for the admin content dashboard.
router.get("/content-stats", async (req, res) => {
  const countOrZero = (p) => p.catch(() => 0);
  const results = await Promise.all([
    countOrZero(prisma.flashcardCollection.count()),
    countOrZero(prisma.flashcard.count()),
    countOrZero(prisma.studyNote.count()),
    countOrZero(prisma.studyNote.count({ where: { source: "ai" } })),
    countOrZero(prisma.studyNote.count({ where: { source: "manual" } })),
    countOrZero(prisma.coachInsight.count()),
  ]);
  const totalCollections = results[0];
  const totalFlashcards = results[1];
  const totalNotes = results[2];
  const aiNotes = results[3];
  const manualNotes = results[4];
  const totalCoachInsights = results[5];
  res.json({
    stats: {
      totalCollections,
      totalFlashcards,
      totalNotes,
      aiNotes,
      manualNotes,
      totalCoachInsights,
    },
  });
});

// ---- Cards ----
// List flashcard collections across all users (optionally filtered).
router.get("/flashcards", async (req, res) => {
  const search = normalizeSearch(req.query.search);
  const { userId } = req.query;
  const collections = await prisma.flashcardCollection.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    include: {
      _count: { select: { flashcards: true } },
      user: { select: { id: true, name: true, email: true } },
      flashcards: { take: 5 },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ collections });
});

// Read one collection with all its cards.
router.get("/flashcards/collections/:id", async (req, res) => {
  const collection = await prisma.flashcardCollection.findUnique({
    where: { id: req.params.id },
    include: {
      flashcards: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  res.json({ collection });
});

// Delete a student collection (its cards cascade).
// Declared BEFORE /flashcards/:id on purpose — Express matches in order, so
// otherwise "collections" would be captured as the :id of the card route.
router.delete("/flashcards/collections/:id", async (req, res) => {
  const result = await prisma.flashcardCollection.deleteMany({ where: { id: req.params.id } });
  if (result.count === 0) return res.status(404).json({ error: "Collection not found" });
  await prisma.activityLog.create({
    data: { userId: req.user.id, action: "admin_delete_collection", meta: { collectionId: req.params.id } },
  });
  res.json({ ok: true });
});

// Delete a single flashcard.
router.delete("/flashcards/:id", async (req, res) => {
  const result = await prisma.flashcard.deleteMany({ where: { id: req.params.id } });
  if (result.count === 0) return res.status(404).json({ error: "Flashcard not found" });
  await prisma.activityLog.create({
    data: { userId: req.user.id, action: "admin_delete_flashcard", meta: { flashcardId: req.params.id } },
  });
  res.json({ ok: true });
});


// ---- Notes ----
// List study notes across all users (optionally filtered).
router.get("/notes", async (req, res) => {
  const search = normalizeSearch(req.query.search);
  const { userId, source } = req.query;
  const notes = await prisma.studyNote.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(source ? { source } : {}),
      ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  res.json({ notes });
});

// Read one note in full (admins can open any student note).
router.get("/notes/:id", async (req, res) => {
  const note = await prisma.studyNote.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json({ note });
});

// Delete an inappropriate note.
router.delete("/notes/:id", async (req, res) => {
  const result = await prisma.studyNote.deleteMany({ where: { id: req.params.id } });
  if (result.count === 0) return res.status(404).json({ error: "Note not found" });
  await prisma.activityLog.create({
    data: { userId: req.user.id, action: "admin_delete_note", meta: { noteId: req.params.id } },
  });
  res.json({ ok: true });
});

// ---- AI Coach ----
// List recent coach insights (all students) for admin review.
router.get("/coach-insights", async (req, res) => {
  let insights = [];
  try {
    insights = await prisma.coachInsight.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch (e) {
    insights = [];
  }
  res.json({ insights });
});

// Generate a coach insight for ANY student (admin oversight / support).
router.post("/coach/:userId", async (req, res) => {
  try {
    const { generateCoachInsight } = require("../lib/ai");
    const { buildCoachPayloadForUser } = require("../lib/coach");
    const payload = await buildCoachPayloadForUser(req.params.userId);
    if (!payload) return res.status(404).json({ error: "Student not found" });
    const insight = await generateCoachInsight(payload);
    try {
      await prisma.coachInsight.create({
        data: {
          userId: req.params.userId,
          summary: insight.summary || null,
          data: insight,
          generatedById: req.user.id,
        },
      });
    } catch (e) {
      console.warn("Could not persist coach insight:", e && e.message);
    }
    await prisma.activityLog.create({
      data: { userId: req.user.id, action: "admin_generate_coach", meta: { studentId: req.params.userId } },
    });
    res.json({ insight, payload });
  } catch (err) {
    console.error("Admin coach generation failed", err);
    res.status(502).json({ error: "Could not generate a coach insight right now. Please try again." });
  }
});

module.exports = router;
