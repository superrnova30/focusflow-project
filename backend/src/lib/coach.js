const prisma = require("./prisma");

/**
 * Build the same study-activity payload the student-facing Coach screen sends
 * to the AI. Admins use this to generate a coach insight for ANY student, so
 * the admin side and user side analyze identical data.
 *
 * Returns null when the user does not exist.
 */
async function buildCoachPayloadForUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true },
  });
  if (!user) return null;

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

  const tasks = await prisma.task.findMany({ where: { userId } });
  const completedTasks = tasks.filter((task) => task.completed).length;
  const totalTasks = tasks.length;
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const focusSessions = sessions.filter((s) => s.type === "focus");
  const totalFocusSessions = focusSessions.length;
  const totalStudyMinutes = focusSessions.reduce((a, s) => a + s.minutes, 0);

  return {
    studentName: user.name,
    todayMinutes,
    last7Days,
    totalFocusSessions,
    totalStudyMinutes,
    subjectTotals,
    totalTasks,
    completedTasks,
    completionRate,
  };
}

module.exports = { buildCoachPayloadForUser };
