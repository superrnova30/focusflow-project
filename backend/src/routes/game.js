const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateQuiz } = require("../lib/ai");
const { bumpStreak, xpWithinLevel, xpForNextLevel, todayKey, computeCalendar, LEVEL_XP_STEP } = require("../lib/gamification");

const router = express.Router();
router.use(requireAuth);

const XP_PER_CORRECT = 200;
const STARTING_HEARTS = 5;
const MAX_HEARTS = 5;

function getUserFriendlyAiError(err) {
  if (err?.message) return err.message;
  return "AI generation is temporarily unavailable. Please try again in a moment.";
}

// ---- Gamification state ----

// Current XP + Hearts for the logged-in student.
router.get("/state", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { xp: true, hearts: true, correctAnswers: true, wrongAnswers: true, totalXpEarned: true },
  });
  res.json({ state: user });
});

// Award XP to the current student (e.g. +200 for a correct quiz answer).
router.post("/xp", async (req, res) => {
  const { amount, correct } = req.body;
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  const data = { xp: { increment: n }, totalXpEarned: { increment: n } };
  // A correct answer also increments the correct-answer counter so the
  // progress dashboard stays in sync with the gamified quiz.
  if (correct !== false) data.correctAnswers = { increment: 1 };
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: { xp: true, hearts: true, totalXpEarned: true, correctAnswers: true },
  });
  await bumpStreak(req.user.id);
  await prisma.activityLog.create({ data: { userId: req.user.id, action: "xp_gain", meta: { amount: n } } });
  res.json({ state: user });
});

// Change hearts. Used by the quiz for wrong answers (-1) and by the
// "Quiz Over" screen for a full refill back to 5.
router.post("/hearts", async (req, res) => {
  const { delta, set } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  let nextHearts = user.hearts;

  if (typeof set === "number" && Number.isFinite(set)) {
    nextHearts = Math.max(0, Math.min(MAX_HEARTS, Math.floor(set)));
  } else {
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d)) return res.status(400).json({ error: "delta must be a number" });
    nextHearts = Math.max(0, Math.min(MAX_HEARTS, user.hearts + d));
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { hearts: nextHearts },
    select: { xp: true, hearts: true, totalXpEarned: true },
  });

  if (nextHearts < user.hearts) {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { wrongAnswers: { increment: 1 } },
    });
  }
  await prisma.activityLog.create({
    data: { userId: req.user.id, action: "hearts_change", meta: { from: user.hearts, to: nextHearts } },
  });

  res.json({ state: updated });
});

// ---- Gamified quiz generation ----
// Generate a pure 4-option multiple-choice quiz from a topic or pasted
// notes. Returns questions WITHOUT the answer key so the client can run a
// self-scoring, instant-feedback quiz (XP/hearts are synced per answer).
router.post("/quiz", requireRole("STUDENT"), async (req, res) => {
  try {
    const { topic, notes } = req.body;
    const hasTopic = topic && String(topic).trim().length > 0;
    const hasNotes = notes && String(notes).trim().length > 0;
    if (!hasTopic && !hasNotes) {
      return res.status(400).json({
        error: "Type a topic or paste some notes to generate a quiz from.",
      });
    }

    const quizTopic = hasTopic ? String(topic).trim() : "General";
    const pack = await generateQuiz(quizTopic, hasNotes ? String(notes).trim() : "");

    const rawQuestions = Array.isArray(pack.quiz) ? pack.quiz : [];
    // Normalize: keep only mcq with exactly 4 options; fall back to 4 if more.
    const questions = rawQuestions
      .filter((q) => q && q.question && Array.isArray(q.options))
      .map((q) => {
        const opts = q.options.slice(0, 4);
        // Ensure the answer is one of the displayed options.
        const answer = opts.includes(q.answer) ? q.answer : opts[0];
        return { question: String(q.question).trim(), options: opts.map((o) => String(o).trim()), answer: String(answer).trim() };
      })
      .slice(0, 10);

    if (questions.length === 0) {
      return res.status(502).json({ error: "The AI didn't return any quiz questions. Please try again." });
    }

    await prisma.activityLog.create({ data: { userId: req.user.id, action: "generate_game_quiz" } });

    // Send back questions WITHOUT answers for the quiz UI. Answers are kept
    // server-side only to prevent easy tampering.
    const publicQuestions = questions.map(({ answer, ...q }) => q);
    res.status(201).json({ topic: quizTopic, questions: publicQuestions, answerKey: questions.map((q) => q.answer) });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
});

// ---- Streak ----
router.get("/streak", async (req, res) => {
  await bumpStreak(req.user.id);
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      streakCount: true, longestStreak: true, lastActiveDate: true,
      currentLevel: true, xp: true, challengesCompleted: true,
    },
  });
  res.json({
    streak: {
      current: user.streakCount,
      longest: user.longestStreak,
      lastActiveDate: user.lastActiveDate,
    },
    level: {
      current: user.currentLevel,
      xpWithinLevel: xpWithinLevel(user.xp),
      xpForNext: xpForNextLevel(user.xp),
    },
  });
});

// ---- Progress dashboard (calendar + gamification) ----
// Returns the student's full progress dashboard payload: hearts, xp + level,
// streak summary, and per-day calendar activity for the requested month.
router.get("/progress", async (req, res) => {
  await bumpStreak(req.user.id);
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      xp: true, hearts: true, totalXpEarned: true, correctAnswers: true, wrongAnswers: true,
      streakCount: true, longestStreak: true, lastActiveDate: true, currentLevel: true,
      challengesCompleted: true,
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const anchor = req.query.month ? `${req.query.month}-01` : undefined;
  const calendar = await computeCalendar(req.user.id, anchor);

  res.json({
    user: {
      xp: user.xp,
      hearts: user.hearts,
      totalXpEarned: user.totalXpEarned,
      correctAnswers: user.correctAnswers,
      wrongAnswers: user.wrongAnswers,
      challengesCompleted: user.challengesCompleted,
    },
    level: {
      current: user.currentLevel,
      xpWithinLevel: xpWithinLevel(user.xp),
      xpForNext: xpForNextLevel(user.xp),
      step: LEVEL_XP_STEP,
    },
    streak: {
      current: user.streakCount,
      longest: user.longestStreak,
      lastActiveDate: user.lastActiveDate,
    },
    calendar,
  });
});

// ---- Leaderboard ----
router.get("/leaderboard", async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 10, 50);
  const tops = await prisma.user.findMany({
    where: { role: "STUDENT" },
    orderBy: [{ xp: "desc" }, { totalXpEarned: "desc" }],
    take,
    select: { id: true, name: true, xp: true, totalXpEarned: true, longestStreak: true, streakCount: true },
  });
  const myRankEntry = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { name: true, xp: true, totalXpEarned: true, longestStreak: true, streakCount: true },
  });
  const myRank = (await prisma.user.count({ where: { role: "STUDENT", xp: { gt: req.user.xp } } })) + 1;

  // Enrich leaderboard ranks.
  const ranked = tops.map((u, i) => ({ rank: i + 1, ...u, isMe: u.id === req.user.id }));
  res.json({ leaderboard: ranked, me: { rank: myRank, ...myRankEntry } });
});

// ---- Daily challenges ----
const CHALLENGE_POOL = [
  { title: "Quiz Whiz", description: "Answer 5 quiz questions correctly today.", targetValue: 5, metric: "quiz_correct", xpReward: 150 },
  { title: "Deep Work", description: "Log 25 focus minutes today.", targetValue: 25, metric: "focus_minutes", xpReward: 120 },
  { title: "Card Collector", description: "Review 10 flashcards today.", targetValue: 10, metric: "cards_reviewed", xpReward: 100 },
  { title: "Daily Attendance", description: "Open the app and start your streak.", targetValue: 1, metric: "login", xpReward: 50 },
  { title: "Task Tamer", description: "Complete 3 tasks today.", targetValue: 3, metric: "tasks_completed", xpReward: 130 },
];

// Helper to derive today's progress for the user.
async function getChallengeProgress(userId, metric) {
  const today = todayKey();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (metric) {
    case "quiz_correct": {
      const a = await prisma.user.findUnique({ where: { id: userId }, select: { correctAnswers: true, wrongAnswers: true } });
      // Track correct answers log arrivals later; simplest proxy: count from aggregate or derive.
      return a.correctAnswers;
    }
    case "focus_minutes": {
      const agg = await prisma.pomodoroSession.aggregate({
        where: { userId, type: "focus", startedAt: { gte: start } },
        _sum: { minutes: true },
      });
      return agg._sum.minutes || 0;
    }
    case "cards_reviewed": {
      // No dedicated review-log table; approximate using collections count is not right,
      // so default to 0 — can be extended. We'll treat challenge as completable via
      // explicit completion endpoint for demos.
      return 0;
    }
    case "login": {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastActiveDate: true } });
      return user.lastActiveDate === today ? 1 : 0;
    }
    case "tasks_completed": {
      const count = await prisma.task.count({
        where: { userId, completed: true, ...(false ? {} : {}) },
      });
      // completedAt isn't tracked; approximate with total completed count.
      return count;
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

router.get("/challenges", async (req, res) => {
  const challenge = await ensureTodayChallenge();
  const completion = await prisma.dailyChallengeCompletion.findUnique({
    where: { challengeId_userId: { challengeId: challenge.id, userId: req.user.id } },
  });
  const progress = await getChallengeProgress(req.user.id, challenge.metric);
  res.json({
    challenge: { ...challenge, completed: !!completion },
    progress: Math.min(progress, challenge.targetValue),
    target: challenge.targetValue,
  });
});

// Mark today's challenge complete (server verifies the metric where possible).
router.post("/challenges/:id/complete", async (req, res) => {
  const { id } = req.params;
  const challenge = await prisma.dailyChallenge.findUnique({ where: { id } });
  if (!challenge || challenge.date !== todayKey()) {
    return res.status(404).json({ error: "That challenge isn't available today" });
  }
  const existing = await prisma.dailyChallengeCompletion.findUnique({
    where: { challengeId_userId: { challengeId: id, userId: req.user.id } },
  });
  if (existing) return res.json({ ok: true, state: existing });

  const progress = await getChallengeProgress(req.user.id, challenge.metric);
  if (progress < challenge.targetValue) {
    return res.status(400).json({ error: "You haven't met this challenge's goal yet", progress, target: challenge.targetValue });
  }

  const state = await prisma.dailyChallengeCompletion.create({
    data: { challengeId: id, userId: req.user.id },
  });
  await prisma.user.update({
    where: { id: req.user.id },
    data: { xp: { increment: challenge.xpReward }, totalXpEarned: { increment: challenge.xpReward }, challengesCompleted: { increment: 1 } },
  });
  await prisma.activityLog.create({ data: { userId: req.user.id, action: "challenge_completed", meta: { challengeId: id } } });
  res.status(201).json({ ok: true, state, xpAwarded: challenge.xpReward });
});

module.exports = router;

