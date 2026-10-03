const prisma = require("./prisma");
const { todayKey } = require("./gamification");

const CHALLENGE_POOL = [
  { title: "Quiz Whiz", description: "Answer 5 quiz questions correctly today.", targetValue: 5, metric: "quiz_correct", xpReward: 150 },
  { title: "Deep Work", description: "Log 25 focus minutes today.", targetValue: 25, metric: "focus_minutes", xpReward: 120 },
  { title: "Card Collector", description: "Review 10 flashcards today.", targetValue: 10, metric: "cards_reviewed", xpReward: 100 },
  { title: "Daily Attendance", description: "Open the app and start your streak.", targetValue: 1, metric: "login", xpReward: 50 },
  { title: "Task Tamer", description: "Complete 3 tasks today.", targetValue: 3, metric: "tasks_completed", xpReward: 130 },
];

function dayStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

async function getChallengeProgress(userId, metric) {
  const start = dayStart();
  const today = todayKey();

  switch (metric) {
    case "quiz_correct": {
      const [xpLogs, quizScore] = await Promise.all([
        prisma.activityLog.findMany({
          where: { userId, action: "xp_gain", createdAt: { gte: start } },
          select: { meta: true },
        }),
        prisma.quizAttempt.aggregate({
          where: { userId, createdAt: { gte: start } },
          _sum: { score: true },
        }),
      ]);
      let gameQuizCorrect = 0;
      for (const log of xpLogs) {
        const source = log.meta?.source;
        if (source === "memorize" || source === "quiz_attempt") continue;
        gameQuizCorrect += 1;
      }
      return gameQuizCorrect + (quizScore._sum.score || 0);
    }
    case "focus_minutes": {
      const agg = await prisma.pomodoroSession.aggregate({
        where: { userId, type: "focus", startedAt: { gte: start } },
        _sum: { minutes: true },
      });
      return agg._sum.minutes || 0;
    }
    case "cards_reviewed": {
      return prisma.activityLog.count({
        where: { userId, action: "flashcard_reviewed", createdAt: { gte: start } },
      });
    }
    case "login": {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastActiveDate: true } });
      return user?.lastActiveDate === today ? 1 : 0;
    }
    case "tasks_completed": {
      return prisma.activityLog.count({
        where: { userId, action: "task_completed", createdAt: { gte: start } },
      });
    }
    default:
      return 0;
  }
}

async function ensureTodayChallenge() {
  const today = todayKey();
  const existing = await prisma.dailyChallenge.findUnique({ where: { date: today } });
  if (existing) return existing;
  const pick = CHALLENGE_POOL[today.length % CHALLENGE_POOL.length];
  return prisma.dailyChallenge.upsert({
    where: { date: today },
    update: pick,
    create: { date: today, ...pick },
  });
}

async function tryAutoCompleteDailyChallenge(userId) {
  const challenge = await ensureTodayChallenge();
  const existing = await prisma.dailyChallengeCompletion.findUnique({
    where: { challengeId_userId: { challengeId: challenge.id, userId } },
  });
  if (existing) {
    return { completed: true, alreadyDone: true, xpAwarded: 0, challenge };
  }

  const progress = await getChallengeProgress(userId, challenge.metric);
  if (progress < challenge.targetValue) {
    return { completed: false, progress, target: challenge.targetValue, challenge };
  }

  const state = await prisma.dailyChallengeCompletion.create({
    data: { challengeId: challenge.id, userId },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      xp: { increment: challenge.xpReward },
      totalXpEarned: { increment: challenge.xpReward },
      challengesCompleted: { increment: 1 },
    },
  });
  await prisma.activityLog.create({
    data: { userId, action: "challenge_completed", meta: { challengeId: challenge.id, auto: true } },
  });

  return {
    completed: true,
    autoCompleted: true,
    xpAwarded: challenge.xpReward,
    state,
    challenge,
    progress: challenge.targetValue,
  };
}

function scheduleDailyChallengeCheck(userId) {
  tryAutoCompleteDailyChallenge(userId).catch((err) => {
    console.error("daily challenge auto-complete failed", err);
  });
}

module.exports = {
  CHALLENGE_POOL,
  getChallengeProgress,
  ensureTodayChallenge,
  tryAutoCompleteDailyChallenge,
  scheduleDailyChallengeCheck,
};
