const prisma = require("./prisma");

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

/**
 * Build the canonical statistics payload for one student.
 *
 * Both the student dashboard and admin profile use this function so totals,
 * trends, and completion rates cannot drift between the two accounts.
 */
async function buildStudentStats(userId) {
  const now = new Date();

  const [
    user,
    focusSessions,
    tasks,
    attempts,
    availableQuizzes,
    flashcards,
    notes,
    conversations,
    messages,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        dailyGoalMinutes: true,
        xp: true,
        totalXpEarned: true,
        currentLevel: true,
        streakCount: true,
        longestStreak: true,
      },
    }),
    prisma.pomodoroSession.findMany({
      where: { userId, type: "focus" },
      select: {
        minutes: true,
        startedAt: true,
        subjectId: true,
        subject: { select: { name: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
    prisma.task.findMany({
      where: { userId },
      select: { completed: true },
    }),
    prisma.quizAttempt.findMany({
      where: { userId },
      select: { quizId: true, score: true, total: true, takenAt: true },
      orderBy: { takenAt: "desc" },
    }),
    prisma.quiz.findMany({
      where: {
        OR: [
          { createdById: userId },
          { isPublished: true, assignments: { some: { studentId: userId } } },
          { isPublished: true },
        ],
      },
      select: { id: true },
    }),
    prisma.flashcard.count({ where: { collection: { userId } } }),
    prisma.studyNote.count({ where: { userId } }),
    prisma.chatConversation.count({ where: { userId } }),
    prisma.chatMessage.count({ where: { conversation: { userId } } }),
  ]);

  if (!user) return null;

  const today = dayKey(now);
  const totalStudyMinutes = focusSessions.reduce((sum, session) => sum + (session.minutes || 0), 0);
  const todayMinutes = focusSessions
    .filter((session) => dayKey(session.startedAt) === today)
    .reduce((sum, session) => sum + (session.minutes || 0), 0);

  const minutesByDay = new Map();
  focusSessions.forEach((session) => {
    const key = dayKey(session.startedAt);
    minutesByDay.set(key, (minutesByDay.get(key) || 0) + (session.minutes || 0));
  });

  const makeTrend = (days) => {
    const trend = [];
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() - index);
      const key = dayKey(date);
      trend.push({ date: key, minutes: minutesByDay.get(key) || 0 });
    }
    return trend;
  };

  const last7Days = makeTrend(7);
  const last28Days = makeTrend(28);
  const last7Minutes = last7Days.reduce((sum, day) => sum + day.minutes, 0);
  const activeDaysLast7 = last7Days.filter((day) => day.minutes > 0).length;
  const bestDay = last28Days.reduce(
    (best, day) => (day.minutes > best.minutes ? day : best),
    { date: null, minutes: 0 }
  );

  const subjectsById = new Map();
  focusSessions.forEach((session) => {
    if (!session.subjectId || !session.subject) return;
    const previous = subjectsById.get(session.subjectId) || {
      id: session.subjectId,
      name: session.subject.name,
      minutes: 0,
    };
    previous.minutes += session.minutes || 0;
    subjectsById.set(session.subjectId, previous);
  });
  const subjects = Array.from(subjectsById.values())
    .sort((a, b) => b.minutes - a.minutes)
    .map((subject) => ({
      ...subject,
      percentage: totalStudyMinutes
        ? clampPercent((subject.minutes / totalStudyMinutes) * 100)
        : 0,
    }));
  const subjectTotals = Object.fromEntries(subjects.map((subject) => [subject.name, subject.minutes]));

  const completedTasks = tasks.filter((task) => task.completed).length;
  const totalTasks = tasks.length;
  const completionRate = totalTasks ? clampPercent((completedTasks / totalTasks) * 100) : 0;

  const totalPossible = attempts.reduce((sum, attempt) => sum + (attempt.total || 0), 0);
  const totalScored = attempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0);
  const averageQuizScore = totalPossible ? clampPercent((totalScored / totalPossible) * 100) : 0;
  const attemptedQuizIds = new Set(attempts.map((attempt) => attempt.quizId));
  const quizCompletionRate = availableQuizzes.length
    ? clampPercent((attemptedQuizIds.size / availableQuizzes.length) * 100)
    : 0;

  const dailyGoalMinutes = user.dailyGoalMinutes || 0;

  return {
    generatedAt: now.toISOString(),
    todayMinutes,
    dailyGoalMinutes,
    dailyGoalProgress: dailyGoalMinutes
      ? clampPercent((todayMinutes / dailyGoalMinutes) * 100)
      : 0,
    totalFocusSessions: focusSessions.length,
    totalStudyMinutes,
    averageSessionMinutes: focusSessions.length
      ? Math.round(totalStudyMinutes / focusSessions.length)
      : 0,
    lastSessionAt: focusSessions.length
      ? focusSessions[focusSessions.length - 1].startedAt
      : null,
    last7Minutes,
    activeDaysLast7,
    bestDay,
    last7Days,
    last28Days,
    subjectTotals,
    subjects,
    totalTasks,
    completedTasks,
    completionRate,
    quizzesTaken: attempts.length,
    averageQuizScore,
    quizCompletionRate,
    xp: user.xp || 0,
    totalXpEarned: user.totalXpEarned || user.xp || 0,
    level: user.currentLevel || 1,
    streak: user.streakCount || 0,
    longestStreak: user.longestStreak || 0,
    flashcards,
    notes,
    aiConversations: conversations,
    aiMessages: messages,
  };
}

module.exports = { buildStudentStats };
