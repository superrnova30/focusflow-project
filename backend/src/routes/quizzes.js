const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { bumpStreak } = require("../lib/gamification");

const router = express.Router();
router.use(requireAuth);

const QUIZ_XP_PER_CORRECT = 100;

// Role-aware quiz listing:
//  - Students see published quizzes assigned to them (or their own generated ones)
//  - Admins see quizzes they created
router.get("/", async (req, res) => {
  const mine = req.query.mine === "true";
  const where =
    req.user.role === "STUDENT"
      ? {
          OR: [
            { createdById: req.user.id },
            { isPublished: true, assignments: { some: { studentId: req.user.id } } },
            { isPublished: true },
          ],
        }
      : { createdById: req.user.id };

  if (mine) delete where.OR;

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
  }

  const questions = quiz.questions.map(({ answer, ...q }) => q);
  res.json({ quiz: { ...quiz, questions, total: quiz.questions.length } });
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

  const attempt = await prisma.quizAttempt.create({
    data: { quizId: quiz.id, userId: req.user.id, score, total: quiz.questions.length },
  });

  // Gamification: award XP for correct answers and update correct/wrong
  // counters so quiz performance automatically feeds the progress dashboard.
  if (req.user.role === "STUDENT") {
    const xpGained = score * QUIZ_XP_PER_CORRECT;
    const wrong = quiz.questions.length - score;
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        correctAnswers: { increment: score },
        wrongAnswers: { increment: wrong },
        xp: { increment: xpGained },
        totalXpEarned: { increment: xpGained },
      },
    });
    if (xpGained > 0) {
      await prisma.activityLog.create({
        data: { userId: req.user.id, action: "xp_gain", meta: { amount: xpGained, source: "quiz_attempt" } },
      });
    }
    await bumpStreak(req.user.id);
  }

  await prisma.activityLog.create({ data: { userId: req.user.id, action: "quiz_attempt" } });

  res.status(201).json({ attempt, score, total: quiz.questions.length, xpEarned: req.user.role === "STUDENT" ? score * QUIZ_XP_PER_CORRECT : 0 });
});

module.exports = router;
