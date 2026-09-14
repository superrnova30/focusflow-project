const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { hashPassword, publicUser } = require("../lib/auth");

const router = express.Router();
router.use(requireAuth, requireRole("ADMIN"));

// ---- User management ----
router.get("/users", async (req, res) => {
  const { search, role, status } = req.query;
  const users = await prisma.user.findMany({
    where: {
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users: users.map(publicUser) });
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
