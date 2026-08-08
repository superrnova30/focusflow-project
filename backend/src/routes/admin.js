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
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
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
    totalUsers, activeUsers, students, totalMaterials, totalQuizzes, totalSessions,
    totalTasks, totalCompletedTasks, totalSessionsAgg, totalAttempts, totalQuizIncludes,
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

  // System-wide completion metrics so admin analytics mirror the student stats.
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
    minutes: t._sum.minutes,
  }));

  res.json({
    totalUsers, activeUsers, students, totalMaterials, totalQuizzes,
    totalSessions, totalStudyMinutes, avgStudyMinutes, mostActiveUsers,
    totalTasks, totalCompletedTasks, taskCompletionRate,
    totalAttempts, averageQuizScore, quizCompletionRate,
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

module.exports = router;
