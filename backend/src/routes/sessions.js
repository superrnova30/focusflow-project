const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Log a completed Pomodoro session (focus / short break / long break)
router.post("/", async (req, res) => {
  const { type, minutes, subjectId, taskId } = req.body;
  if (!["focus", "short", "long"].includes(type)) {
    return res.status(400).json({ error: 'type must be "focus", "short", or "long"' });
  }
  const session = await prisma.pomodoroSession.create({
    data: { type, minutes, subjectId: subjectId || null, taskId: taskId || null, userId: req.user.id },
  });

  if (type === "focus" && taskId) {
    await prisma.task.updateMany({
      where: { id: taskId, userId: req.user.id },
      data: { pomodorosSpent: { increment: 1 } },
    });
  }
  await prisma.activityLog.create({ data: { userId: req.user.id, action: "session_complete" } });

  res.status(201).json({ session });
});

// Aggregated stats for the dashboard: today's minutes, 7-day trend,
// 4-week trend, per-subject breakdown.
router.get("/stats", async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const startOf28DaysAgo = new Date(now);
  startOf28DaysAgo.setDate(now.getDate() - 27);
  startOf28DaysAgo.setHours(0, 0, 0, 0);

  const sessions = await prisma.pomodoroSession.findMany({
    where: { userId, startedAt: { gte: startOf28DaysAgo } },
    include: { subject: true },
    orderBy: { startedAt: "asc" },
  });

  const dayKey = (d) => d.toISOString().slice(0, 10);
  const today = dayKey(now);

  const todayMinutes = sessions
    .filter((s) => s.type === "focus" && dayKey(s.startedAt) === today)
    .reduce((a, s) => a + s.minutes, 0);

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const minutes = sessions
      .filter((s) => s.type === "focus" && dayKey(s.startedAt) === key)
      .reduce((a, s) => a + s.minutes, 0);
    last7Days.push({ date: key, minutes });
  }

  const subjectTotals = {};
  sessions
    .filter((s) => s.type === "focus" && s.subject)
    .forEach((s) => {
      subjectTotals[s.subject.name] = (subjectTotals[s.subject.name] || 0) + s.minutes;
    });

  const tasks = await prisma.task.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const completedTasks = tasks.filter((task) => task.completed).length;
  const totalTasks = tasks.length;
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const totalFocusSessions = sessions.filter((s) => s.type === "focus").length;
  const totalStudyMinutes = sessions.filter((s) => s.type === "focus").reduce((a, s) => a + s.minutes, 0);

  // ---- Quiz performance stats ----
  const attempts = await prisma.quizAttempt.findMany({ where: { userId } });
  const quizzesTaken = attempts.length;
  const totalPossible = attempts.reduce((a, at) => a + at.total, 0);
  const totalScored = attempts.reduce((a, at) => a + at.score, 0);
  const averageQuizScore = totalPossible
    ? Math.round((totalScored / totalPossible) * 100)
    : 0;

  // Quiz completion rate: of the quizzes available to this student (created by
  // them, assigned to them, or published), how many have been attempted.
  const availableQuizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { createdById: userId },
        { isPublished: true, assignments: { some: { studentId: userId } } },
        { isPublished: true },
      ],
    },
    select: { id: true },
  });
  const attemptedCount = attempts.map((a) => a.quizId).filter((v, i, arr) => arr.indexOf(v) === i).length;
  const quizCompletionRate = availableQuizzes.length
    ? Math.round((attemptedCount / availableQuizzes.length) * 100)
    : 0;

  res.json({
    todayMinutes,
    last7Days,
    subjectTotals,
    totalFocusSessions,
    totalStudyMinutes,
    totalTasks,
    completedTasks,
    completionRate,
    quizzesTaken,
    averageQuizScore,
    quizCompletionRate,
  });
});

module.exports = router;
