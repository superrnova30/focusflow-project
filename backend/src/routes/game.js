const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateQuiz } = require("../lib/ai");
const {
  bumpStreak,
  xpWithinLevel,
  xpForNextLevel,
  levelForXp,
  todayKey,
  computeCalendar,
  syncHeartRefill,
  loadUserGamification,
  LEVEL_XP_STEP,
  MAX_HEARTS,
} = require("../lib/gamification");
const { isPremiumActive, premiumState } = require("../lib/premium");
const { normalizeMemorizeSettings, buildGameState } = require("../lib/memorize");
const { buildLimitsPayload, consumeAiPrompt, sendLimitResponse, countActiveTasks } = require("../lib/featureLimits");
const {
  getChallengeProgress,
  ensureTodayChallenge,
  tryAutoCompleteDailyChallenge,
  scheduleDailyChallengeCheck,
} = require("../lib/dailyChallenge");

const router = express.Router();
router.use(requireAuth);

const XP_PER_CORRECT = 200;

function getUserFriendlyAiError(err) {
  if (err?.message) return err.message;
  return "AI generation is temporarily unavailable. Please try again in a moment.";
}

// ---- Gamification state ----

// Current XP + Hearts + Hints for the logged-in student.
router.get("/state", async (req, res) => {
  let user = await loadUserGamification(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const premium = premiumState(user);
  const game = buildGameState(user, premium.isPremium);
  const activeTaskCount = await countActiveTasks(req.user.id);
  res.json({
    state: {
      xp: game.xp,
      hearts: game.hearts,
      hints: game.hints,
      correctAnswers: user.correctAnswers,
      wrongAnswers: user.wrongAnswers,
      totalXpEarned: user.totalXpEarned,
      heartsRefillAt: game.heartsRefillAt,
      level: game.level,
    },
    premium,
    limits: buildLimitsPayload(user, { activeTaskCount }),
  });
});

// Memorize quiz settings (persisted per student).
router.get("/memorize-settings", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { memorizeSettings: true },
  });
  res.json({ settings: normalizeMemorizeSettings(user?.memorizeSettings) });
});

router.put("/memorize-settings", async (req, res) => {
  const current = normalizeMemorizeSettings(
    (await prisma.user.findUnique({ where: { id: req.user.id }, select: { memorizeSettings: true } }))?.memorizeSettings
  );
  const body = req.body || {};
  const next = normalizeMemorizeSettings({ ...current, ...body });
  await prisma.user.update({
    where: { id: req.user.id },
    data: { memorizeSettings: next },
  });
  res.json({ settings: next });
});

// Award XP to the current student (e.g. +200 for a correct quiz answer).
router.post("/xp", async (req, res) => {
  const { amount, correct } = req.body;
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  const before = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { currentLevel: true },
  });
  const data = { xp: { increment: n }, totalXpEarned: { increment: n } };
  // A correct answer also increments the correct-answer counter so the
  // progress dashboard stays in sync with the gamified quiz.
  if (correct !== false) data.correctAnswers = { increment: 1 };
  await prisma.user.update({ where: { id: req.user.id }, data });
  await bumpStreak(req.user.id);
  const refreshed = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { xp: true, hearts: true, hints: true, totalXpEarned: true, correctAnswers: true, currentLevel: true },
  });
  await prisma.activityLog.create({
    data: { userId: req.user.id, action: "xp_gain", meta: { amount: n, source: "game_quiz" } },
  });
  scheduleDailyChallengeCheck(req.user.id);
  const leveledUp = refreshed.currentLevel > (before?.currentLevel || 1);
  res.json({
    state: refreshed,
    level: {
      current: refreshed.currentLevel,
      xpWithinLevel: xpWithinLevel(refreshed.xp),
      xpForNext: xpForNextLevel(refreshed.xp),
      step: LEVEL_XP_STEP,
    },
    leveledUp,
  });
});

// Change hearts. Used by the quiz for wrong answers (-1) and by the
// "Quiz Over" screen for a full refill back to 5.
router.post("/hearts", async (req, res) => {
  const { delta, set } = req.body;
  let user = await loadUserGamification(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Unlimited Hearts: a premium student can never be drained. We still
  // record the attempt so the quiz flow works identically, but the stored
  // value stays pinned at the maximum.
  if (isPremiumActive(user)) {
    const pinned = await prisma.user.update({
      where: { id: req.user.id },
      data: { hearts: MAX_HEARTS, heartsDepletedAt: null },
      select: { xp: true, hearts: true, hints: true, totalXpEarned: true },
    });
    return res.json({ state: pinned, unlimitedHearts: true, gameOver: false });
  }

  let nextHearts = user.hearts;

  if (typeof set === "number" && Number.isFinite(set)) {
    const target = Math.floor(set);
    if (target >= MAX_HEARTS) {
      user = await syncHeartRefill(user);
      if (user.hearts <= 0) {
        return res.status(403).json({
          error: "Hearts depleted. Wait 24 hours for a refill, or upgrade to Go Unlimited for unlimited hearts.",
          code: "HEARTS_DEPLETED",
          gameOver: true,
          upgradeRequired: true,
          heartsRefillAt: user.heartsDepletedAt
            ? new Date(new Date(user.heartsDepletedAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
            : null,
        });
      }
      nextHearts = user.hearts;
    } else {
      nextHearts = Math.max(0, Math.min(MAX_HEARTS, target));
    }
  } else {
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d)) return res.status(400).json({ error: "delta must be a number" });
    nextHearts = Math.max(0, Math.min(MAX_HEARTS, user.hearts + d));
  }

  const heartData = { hearts: nextHearts };
  if (nextHearts <= 0 && user.hearts > 0) {
    heartData.heartsDepletedAt = new Date();
  } else if (nextHearts > 0) {
    heartData.heartsDepletedAt = null;
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: heartData,
    select: { xp: true, hearts: true, hints: true, totalXpEarned: true, heartsDepletedAt: true },
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

  const gameOver = nextHearts <= 0;
  const heartsRefillAt =
    gameOver && updated.heartsDepletedAt
      ? new Date(new Date(updated.heartsDepletedAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : null;

  res.json({ state: updated, gameOver, heartsRefillAt });
});

// Use a hint key during Memorize mode.
router.post("/hints", async (req, res) => {
  let user = await loadUserGamification(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (isPremiumActive(user)) {
    return res.json({ hints: 999, unlimitedHints: true });
  }

  if (user.hints <= 0) {
    return res.status(403).json({
      error: "No hints remaining today. Upgrade to Go Unlimited for unlimited hints.",
      code: "HINTS_DEPLETED",
      upgradeRequired: true,
      limits: buildLimitsPayload(user),
    });
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { hints: { decrement: 1 } },
    select: { hints: true },
  });

  await prisma.activityLog.create({
    data: { userId: req.user.id, action: "hint_used", meta: req.body || {} },
  });

  res.json({ hints: updated.hints, unlimitedHints: false });
});

// ---- Gamified quiz generation ----
// Generate a pure 4-option multiple-choice quiz from a topic or pasted
// notes. Returns questions WITHOUT the answer key so the client can run a
// self-scoring, instant-feedback quiz (XP/hearts are synced per answer).
router.post("/quiz", requireRole("STUDENT"), async (req, res) => {
  try {
    try {
      await consumeAiPrompt(req.user.id);
    } catch (limitErr) {
      if (limitErr.upgradeRequired) return sendLimitResponse(res, limitErr);
      throw limitErr;
    }

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

router.get("/challenges", async (req, res) => {
  const challenge = await ensureTodayChallenge();
  const autoResult = await tryAutoCompleteDailyChallenge(req.user.id);
  const completed = autoResult.completed;
  const progress = completed
    ? challenge.targetValue
    : Math.min(autoResult.progress ?? (await getChallengeProgress(req.user.id, challenge.metric)), challenge.targetValue);

  res.json({
    challenge: { ...challenge, completed },
    progress,
    target: challenge.targetValue,
    autoCompleted: Boolean(autoResult.autoCompleted),
    xpAwarded: autoResult.xpAwarded || 0,
  });
});

// Legacy manual claim — auto-complete is preferred; this endpoint delegates to the same logic.
router.post("/challenges/:id/complete", async (req, res) => {
  const { id } = req.params;
  const challenge = await prisma.dailyChallenge.findUnique({ where: { id } });
  if (!challenge || challenge.date !== todayKey()) {
    return res.status(404).json({ error: "That challenge isn't available today" });
  }

  const result = await tryAutoCompleteDailyChallenge(req.user.id);
  if (!result.completed) {
    return res.status(400).json({
      error: "You haven't met this challenge's goal yet",
      progress: result.progress ?? 0,
      target: challenge.targetValue,
    });
  }

  res.status(result.autoCompleted ? 201 : 200).json({
    ok: true,
    state: result.state,
    xpAwarded: result.xpAwarded || 0,
    alreadyDone: Boolean(result.alreadyDone),
  });
});

module.exports = router;

