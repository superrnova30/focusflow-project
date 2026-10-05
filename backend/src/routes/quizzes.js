const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { bumpStreak, loadUserGamification, heartsDepletedPayload, heartsRefillAtFrom, loseHeart, awardCorrectAnswer, MAX_HEARTS } = require("../lib/gamification");
const { isPremiumActive } = require("../lib/premium");

const router = express.Router();
router.use(requireAuth);

const QUIZ_XP_PER_CORRECT = 100;

// Role-aware quiz listing:
//  - Students see published quizzes assigned to them (or their own generated ones)
//  - Admins see quizzes they created
router.get("/", async (req, res) => {
  const mine = req.query.mine === "true";
  let where;

  if (req.user.role === "STUDENT") {
    if (mine) {
      where = {
        createdById: req.user.id,
        material: { uploadedById: req.user.id, archived: false },
      };
    } else {
      where = {
        OR: [
          {
            createdById: req.user.id,
            material: { uploadedById: req.user.id, archived: false },
          },
          {
            isPublished: true,
            assignments: { some: { studentId: req.user.id } },
          },
        ],
      };
    }
  } else {
    where = { createdById: req.user.id };
  }

  const quizzes = await prisma.quiz.findMany({
    where,
    include: {
      questions: { orderBy: { order: "asc" } },
      assignments: true,
      material: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ quizzes });
});

router.get("/:id", async (req, res) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.id },
    include: { questions: { orderBy: { order: "asc" } }, assignments: true },
  });
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  res.json({ quiz });
});

// Edit questions, add custom ones, delete, or update the quiz title —
// only the creator of the quiz can edit it.
router.patch("/:id", async (req, res) => {
  const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id } });
  if (!quiz || quiz.createdById !== req.user.id) return res.status(404).json({ error: "Quiz not found" });

  const { title, questions } = req.body;
  const data = {};
  if (title) data.title = title;

  if (Array.isArray(questions)) {
    await prisma.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
    data.questions = {
      create: questions.map((q, i) => ({
        type: q.type, question: q.question, options: q.options || null, answer: q.answer, order: i,
      })),
    };
  }

  const updated = await prisma.quiz.update({ where: { id: quiz.id }, data, include: { questions: true } });
  res.json({ quiz: updated });
});

router.post("/:id/publish", requireRole("ADMIN"), async (req, res) => {
  const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id } });
  if (!quiz || quiz.createdById !== req.user.id) return res.status(404).json({ error: "Quiz not found" });
  const updated = await prisma.quiz.update({ where: { id: quiz.id }, data: { isPublished: true } });
  res.json({ quiz: updated });
});

router.post("/:id/assign", requireRole("ADMIN"), async (req, res) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ error: "studentIds must be a non-empty array" });
  }
  const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id } });
  if (!quiz || quiz.createdById !== req.user.id) return res.status(404).json({ error: "Quiz not found" });

  await prisma.quiz.update({ where: { id: quiz.id }, data: { isPublished: true } });
  await prisma.quizAssignment.createMany({
    data: studentIds.map((studentId) => ({ quizId: quiz.id, studentId })),
    skipDuplicates: true,
  });
  const { notifyQuizAssigned } = require("../lib/notifications");
  notifyQuizAssigned(studentIds, quiz).catch(() => {});
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const result = await prisma.quiz.deleteMany({ where: { id: req.params.id, createdById: req.user.id } });
  if (result.count === 0) return res.status(404).json({ error: "Quiz not found" });
  res.json({ ok: true });
});

// Take a quiz — returns questions WITHOUT the answer key so students can
// actually attempt it. Eligibility: published, and either assigned to the
// student or created by them (self-study generation).
router.get("/:id/take", async (req, res) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.id },
    include: { questions: { orderBy: { order: "asc" } }, assignments: true },
  });
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });

  if (req.user.role === "STUDENT") {
    const eligible =
      quiz.createdById === req.user.id ||
      quiz.isPublished ||
      quiz.assignments.some((a) => a.studentId === req.user.id);
    if (!eligible) return res.status(403).json({ error: "This quiz hasn't been assigned to you yet" });

    const player = await loadUserGamification(req.user.id);
    if (player && !isPremiumActive(player) && player.hearts <= 0) {
      return res.status(403).json(heartsDepletedPayload(player));
    }
  }

  const questions = quiz.questions.map(({ answer, ...q }) => q);
  res.json({ quiz: { ...quiz, questions, total: quiz.questions.length } });
});

router.post("/:id/check", async (req, res) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.id },
    include: { questions: true, assignments: true },
  });
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });

  if (req.user.role === "STUDENT") {
    const eligible =
      quiz.createdById === req.user.id ||
      quiz.isPublished ||
      quiz.assignments.some((a) => a.studentId === req.user.id);
    if (!eligible) return res.status(403).json({ error: "This quiz hasn't been assigned to you yet" });
  }

  const player = await loadUserGamification(req.user.id);
  const premium = isPremiumActive(player);
  if (req.user.role === "STUDENT" && player && !premium && player.hearts <= 0) {
    return res.status(403).json(heartsDepletedPayload(player));
  }

  const question = quiz.questions.find((q) => q.id === req.body?.questionId);
  if (!question) return res.status(404).json({ error: "Question not found" });

  const norm = (s) => (s || "").toString().trim().toLowerCase();
  const correct = norm(req.body?.answer) === norm(question.answer);
  let lost = null;

  let reward = null;
  if (req.user.role === "STUDENT" && !correct) {
    try {
      lost = await loseHeart(req.user.id, "quiz_check");
    } catch (err) {
      if (err.status === 403 && err.payload) return res.status(403).json(err.payload);
      throw err;
    }
  } else if (req.user.role === "STUDENT" && correct) {
    reward = await awardCorrectAnswer(req.user.id, { baseXp: QUIZ_XP_PER_CORRECT });
  }

  const hearts = lost?.hearts ?? (premium ? MAX_HEARTS : player?.hearts ?? 0);
  res.json({
    correct,
    hearts,
    coins: reward?.user?.coins ?? lost?.coins ?? player?.coins ?? 0,
    xp: reward?.user?.xp ?? player?.xp ?? 0,
    currentLevel: reward?.user?.currentLevel ?? player?.currentLevel ?? 1,
    comboHit: Boolean(reward?.comboHit),
    coinsEarned: reward?.coinsEarned || 0,
    bonusXp: reward?.bonusXp || 0,
    xpAwarded: reward?.xpAwarded || 0,
    gameOver: Boolean(lost?.gameOver),
    heartsBlocked: Boolean(lost?.heartsBlocked),
    heartsRefillAt: lost?.heartsRefillAt || null,
  });
});

// Submit answers — scored server-side so the client never sees the answer
// key ahead of time in a way that could be tampered with.
router.post("/:id/attempt", async (req, res) => {
  const { answers } = req.body; // { [questionId]: "answer text" }
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.id },
    include: { questions: true, assignments: true },
  });
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });

  // Students may only attempt quizzes that are published/assigned to them
  // (or their own). Admins may attempt their own as a preview.
  if (req.user.role === "STUDENT" && quiz.createdById !== req.user.id) {
    const eligible = quiz.isPublished && quiz.assignments.some((a) => a.studentId === req.user.id);
    if (!eligible) return res.status(403).json({ error: "You aren't assigned this quiz" });
  }

  const norm = (s) => (s || "").toString().trim().toLowerCase();
  let score = 0;
  quiz.questions.forEach((q) => {
    if (norm(answers?.[q.id]) === norm(q.answer)) score += 1;
  });

  let heartsState = null;
  let player = null;
  let premium = false;
  const heartsAlreadyApplied = Boolean(req.body?.heartsAlreadyApplied);
  if (req.user.role === "STUDENT") {
    player = await loadUserGamification(req.user.id);
    premium = isPremiumActive(player);
    if (!premium && player?.hearts <= 0 && !heartsAlreadyApplied) {
      return res.status(403).json(heartsDepletedPayload(player));
    }
  }

  const attempt = await prisma.quizAttempt.create({
    data: { quizId: quiz.id, userId: req.user.id, score, total: quiz.questions.length },
  });

  // Gamification: award XP for correct answers and update correct/wrong
  // counters so quiz performance automatically feeds the progress dashboard.
  if (req.user.role === "STUDENT") {

    const xpGained = heartsAlreadyApplied ? 0 : score * QUIZ_XP_PER_CORRECT;
    const wrong = quiz.questions.length - score;
    const heartLoss = !premium && !heartsAlreadyApplied ? Math.min(wrong, player?.hearts || 0) : 0;
    const nextHearts = heartLoss > 0 ? Math.max(0, player.hearts - heartLoss) : player?.hearts;
    const heartData = heartLoss > 0 ? { hearts: nextHearts } : {};
    if (heartLoss > 0 && nextHearts <= 0) heartData.heartsDepletedAt = new Date();

    const updateData = {
      ...(heartsAlreadyApplied
        ? {}
        : {
            correctAnswers: { increment: score },
            wrongAnswers: { increment: wrong },
            xp: { increment: xpGained },
            totalXpEarned: { increment: xpGained },
          }),
      ...heartData,
    };
    const updated = Object.keys(updateData).length
      ? await prisma.user.update({ where: { id: req.user.id }, data: updateData })
      : player;
    if (xpGained > 0) {
      await prisma.activityLog.create({
        data: { userId: req.user.id, action: "xp_gain", meta: { amount: xpGained, source: "quiz_attempt" } },
      });
    }
    if (heartLoss > 0) {
      await prisma.activityLog.create({
        data: { userId: req.user.id, action: "hearts_change", meta: { from: player.hearts, to: nextHearts, source: "quiz_attempt" } },
      });
    }
    await bumpStreak(req.user.id);
    heartsState = {
      hearts: updated.hearts,
      coins: updated.coins || 0,
      heartsBlocked: !premium && updated.hearts <= 0,
      heartsRefillAt: !premium && updated.hearts <= 0 ? heartsRefillAtFrom(updated) : null,
    };
  }

  await prisma.activityLog.create({ data: { userId: req.user.id, action: "quiz_attempt" } });

  if (req.user.role === "STUDENT") {
    const { scheduleDailyChallengeCheck } = require("../lib/dailyChallenge");
    scheduleDailyChallengeCheck(req.user.id);
  }

  res.status(201).json({
    attempt,
    score,
    total: quiz.questions.length,
    xpEarned: req.user.role === "STUDENT" ? score * QUIZ_XP_PER_CORRECT : 0,
    ...(heartsState || {}),
  });
});

module.exports = router;
