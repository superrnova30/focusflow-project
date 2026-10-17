const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { randomUUID } = require("crypto");
const { generateFlashcards, generateDeckTutorLesson } = require("../lib/ai");
const { loadUserGamification, bumpStreak, xpWithinLevel, xpForNextLevel, LEVEL_XP_STEP, heartsDepletedPayload, heartsRefillAtFrom, loseHeart, awardCorrectAnswer, adjustXp } = require("../lib/gamification");
const { isPremiumActive } = require("../lib/premium");
const { enforcePromptLimit, enforceTutorLimit, buildLimitsPayload, consumeHint } = require("../lib/featureLimits");
const {
  XP_PER_CORRECT,
  HALF_XP_WITH_HINT3,
  LIGHTNING_SECONDS,
  buildGameState,
  buildClue,
  answersMatch,
  pickQuestionType,
} = require("../lib/memorize");
const {
  canonicalAnswer,
  displayHighlight,
  eliminateOneIncorrectOption,
  explainTutorChoice,
  resolveTutorAnswerKey,
  answersEquivalent,
  normalizeImportedCard,
  normalizeGeneratedCards,
  pickAnswerHighlight,
  buildValidatedMcqOptions,
  resolveSavedHighlight,
  snapHighlightToBack,
  parseHighlights,
  serializeHighlights,
  remapHighlights,
} = require("../lib/flashcardAnswer");

const router = express.Router();
router.use(requireAuth);

const FLASHCARDS_INCLUDE = { flashcards: { orderBy: { id: "asc" } } };
const PRACTICE_UNLOCK_TARGET = 100;
const TUTOR_MCQ_XP = 10;
const TUTOR_HINT_XP = 0;
const VALID_DECK_COLORS = ["violet", "mint", "amber", "tomato"];

function normalizeColor(color) {
  const id = String(color || "violet").toLowerCase();
  return VALID_DECK_COLORS.includes(id) ? id : "violet";
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildMcqOptions(cards, card) {
  const correct = canonicalAnswer(card);
  const distractors = (cards || [])
    .filter((item) => item.id !== card.id)
    .map((item) => canonicalAnswer(item));
  return shuffle(buildValidatedMcqOptions(card.front, correct, distractors, card.back));
}

function buildPracticeQuestions(cards, count = 10) {
  if (!cards.length) return [];
  const pool = shuffle(cards);
  const take = Math.min(count, pool.length);

  return pool.slice(0, take).map((card, idx) => {
    const options = buildMcqOptions(cards, card);
    return {
      id: `${card.id}-${idx}`,
      cardId: card.id,
      question: card.front,
      options,
      answer: canonicalAnswer(card),
      back: card.back,
      answerHighlight: serializeHighlights(parseHighlights(card.answerHighlight, card.back), card.back) || displayHighlight(card),
    };
  });
}

function buildMemorizeQuestions(cards, settings) {
  const pool = shuffle(cards);
  return pool.map((card, idx) => {
    const type = pickQuestionType(settings, idx + card.front.length);
    const answer = canonicalAnswer(card);
    const base = {
      id: `${card.id}-m${idx}`,
      cardId: card.id,
      question: card.front,
      answer,
      back: card.back,
      answerHighlight: serializeHighlights(parseHighlights(card.answerHighlight, card.back), card.back) || displayHighlight(card),
      explanation: card.explanation || "",
      type,
    };
    if (type === "mcq") {
      base.options = buildMcqOptions(cards, card);
    }
    return base;
  });
}

async function getOrCreateProgress(userId, collectionId) {
  const existing = await prisma.deckStudyProgress.findUnique({
    where: { userId_collectionId: { userId, collectionId } },
  });
  if (existing) return existing;
  return prisma.deckStudyProgress.create({
    data: { userId, collectionId },
  });
}

function isPracticeUnlocked(progress) {
  return Boolean(progress?.practiceUnlocked) || (progress?.practiceAnswered || 0) >= PRACTICE_UNLOCK_TARGET;
}

async function recordQuestionTowardPractice(userId, collectionId) {
  const progress = await getOrCreateProgress(userId, collectionId);
  const nextCount = progress.practiceAnswered + 1;
  const unlocked = nextCount >= PRACTICE_UNLOCK_TARGET || progress.practiceUnlocked;
  return prisma.deckStudyProgress.update({
    where: { id: progress.id },
    data: {
      practiceAnswered: nextCount,
      practiceUnlocked: unlocked,
    },
  });
}

async function getOwnedCollection(userId, collectionId) {
  return prisma.flashcardCollection.findFirst({
    where: { id: collectionId, userId },
    include: FLASHCARDS_INCLUDE,
  });
}

async function getAccessibleCollection(userId, collectionId) {
  const collection = await prisma.flashcardCollection.findUnique({
    where: { id: collectionId },
    include: FLASHCARDS_INCLUDE,
  });
  if (!collection) return null;
  if (collection.userId === userId || collection.isPublic) return collection;
  return null;
}

function toPublicQuizPayload(collection, questions) {
  const publicQuestions = questions.map(({ answer, ...q }) => q);
  return {
    topic: collection.name,
    collection: {
      id: collection.id,
      name: collection.name,
      color: collection.color,
      cardCount: collection.flashcards.length,
      isPublic: collection.isPublic,
    },
    questions: publicQuestions,
    answerKey: questions.map((q) => q.answer),
  };
}

function getUserFriendlyAiError(err) {
  if (err?.message) return err.message;
  return "AI generation is temporarily unavailable. Please try again in a moment.";
}

function safe(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error("[flashcards]", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Could not complete the flashcard request. Please try again." });
      }
    }
  };
}

// ---- Collections ----

// List the current user's flashcard collections with card counts.
router.get("/collections", safe(async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const publicScope = String(req.query.scope || "").toLowerCase() === "public";
  const collections = await prisma.flashcardCollection.findMany({
    where: publicScope ? { isPublic: true } : { userId: req.user.id },
    include: {
      _count: { select: { flashcards: true } },
      ...(publicScope ? { user: { select: { id: true, name: true, profilePicture: true, school: true } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: publicScope ? 80 : undefined,
  });
  res.json({ collections });
}));

// Create a new collection.
router.post("/collections", safe(async (req, res) => {
  const { name, isPublic, color } = req.body;
  const trimmed = name && String(name).trim();
  if (!trimmed) return res.status(400).json({ error: "Collection name is required." });

  const collection = await prisma.flashcardCollection.create({
    data: {
      name: trimmed,
      userId: req.user.id,
      isPublic: Boolean(isPublic),
      color: normalizeColor(color),
    },
    include: { _count: { select: { flashcards: true } } },
  });
  if (collection.isPublic) {
    const { recordPublicContentActivity } = require("../lib/social");
    recordPublicContentActivity(req.user.id, "deck", collection).catch(() => {});
  }
  res.status(201).json({ collection });
}));

// Update a collection (owner only).
router.patch("/collections/:id", safe(async (req, res) => {
  const { name, isPublic, color } = req.body;
  const data = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof isPublic === "boolean") data.isPublic = isPublic;
  if (typeof color === "string" && color.trim()) data.color = normalizeColor(color);
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  const result = await prisma.flashcardCollection.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data,
  });
  if (result.count === 0) return res.status(404).json({ error: "Collection not found" });

  const collection = await prisma.flashcardCollection.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { flashcards: true } } },
  });
  if (typeof isPublic === "boolean" && isPublic) {
    const { recordPublicContentActivity } = require("../lib/social");
    recordPublicContentActivity(req.user.id, "deck", collection).catch(() => {});
  }
  res.json({ collection });
}));

// Delete a collection (owner only). Cards and task links are removed with it.
router.delete("/collections/:id", safe(async (req, res) => {
  const collection = await prisma.flashcardCollection.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: { id: true },
  });
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const linkedTasks = await prisma.taskDeck.findMany({
    where: { collectionId: collection.id },
    select: { taskId: true },
  });
  const taskIds = [...new Set(linkedTasks.map((row) => row.taskId))];

  await prisma.$transaction([
    prisma.taskDeck.deleteMany({ where: { collectionId: collection.id } }),
    prisma.deckStudyProgress.deleteMany({ where: { collectionId: collection.id } }),
    prisma.flashcard.deleteMany({ where: { collectionId: collection.id } }),
    prisma.flashcardCollection.deleteMany({ where: { id: collection.id, userId: req.user.id } }),
  ]);

  // Recalculate progress for tasks that referenced this deck.
  if (taskIds.length) {
    const { syncTaskProgressFromDecks, progressFromRounds, requiredRoundsForTask, clampProgress } = require("../lib/taskProgress");
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { focusMinutes: true },
    });
    for (const taskId of taskIds) {
      const remaining = await prisma.taskDeck.count({ where: { taskId } });
      if (remaining > 0) {
        await syncTaskProgressFromDecks(taskId, req.user.id);
        continue;
      }
      const task = await prisma.task.findFirst({ where: { id: taskId, userId: req.user.id } });
      if (!task || task.completed) continue;
      const focusMinutes = user?.focusMinutes ?? 25;
      const progress = progressFromRounds(task, focusMinutes);
      await prisma.task.updateMany({
        where: { id: taskId, userId: req.user.id },
        data: { progress: clampProgress(progress) },
      });
    }
  }

  res.set("Cache-Control", "no-store");
  res.json({ ok: true, id: collection.id });
}));

// Fetch one collection with its cards (owner always; other students only when public).
router.get("/collections/:id", safe(async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const collection = await prisma.flashcardCollection.findUnique({
    where: { id: req.params.id },
    include: FLASHCARDS_INCLUDE,
  });
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const isOwner = collection.userId === req.user.id;
  if (!isOwner && !collection.isPublic) {
    return res.status(404).json({ error: "Collection not found" });
  }

  const owner = await prisma.user.findUnique({
    where: { id: collection.userId },
    select: { id: true, name: true },
  });

  res.json({ collection, isOwner, owner });
}));

// ---- Deck study modes ----

router.get("/collections/:id/study/progress", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const progress = await getOrCreateProgress(req.user.id, collection.id);
  const isOwner = collection.userId === req.user.id;
  res.json({
    progress,
    target: PRACTICE_UNLOCK_TARGET,
    cardCount: collection.flashcards.length,
    isOwner,
    unlocked: isPracticeUnlocked(progress) || (!isOwner && collection.isPublic),
    collection: {
      id: collection.id,
      name: collection.name,
      color: collection.color,
      cardCount: collection.flashcards.length,
      isPublic: collection.isPublic,
    },
  });
}));

router.get("/collections/:id/study/memorize", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  if (!collection.flashcards.length) {
    return res.status(400).json({ error: "Add cards to this deck before studying." });
  }

  const user = await loadUserGamification(req.user.id);
  const premium = isPremiumActive(user);
  const game = buildGameState(user, premium);
  const questions = buildMemorizeQuestions(collection.flashcards, game.settings);

  res.json({
    collection: {
      id: collection.id,
      name: collection.name,
      color: collection.color,
      cardCount: collection.flashcards.length,
    },
    questions,
    cards: collection.flashcards,
    game,
    lightningSeconds: LIGHTNING_SECONDS,
  });
}));

router.post("/collections/:id/study/memorize/hint", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const hintType = Number(req.body?.hintType);
  if (![1, 2, 3].includes(hintType)) {
    return res.status(400).json({ error: "Choose Eliminate choices, Reveal a clue, or Show answer." });
  }

  const card = collection.flashcards.find((c) => c.id === String(req.body?.cardId || ""));
  if (!card) return res.status(404).json({ error: "Card not found in this deck." });

  let options = Array.isArray(req.body?.options)
    ? req.body.options.map((opt) => String(opt || "").trim()).filter(Boolean)
    : [];
  if (hintType === 1 && options.length < 2) {
    options = buildMcqOptions(collection.flashcards, card);
  }
  const correct = canonicalAnswer(card);
  if (hintType === 1) {
    const wrong = options.filter((opt) => opt !== correct);
    if (!wrong.length) {
      return res.status(400).json({ error: "No more incorrect choices to remove." });
    }
  }

  let consumed;
  try {
    consumed = await consumeHint(req.user.id);
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({
        error: err.message || "No hints remaining.",
        code: err.code || "NO_HINTS_REMAINING",
        upgradeRequired: true,
        limits: err.limits,
      });
    }
    throw err;
  }

  const payload = {
    hintType,
    hintsRemaining: consumed.hints,
    unlimitedHints: consumed.unlimitedHints,
  };

  if (hintType === 1) {
    const wrong = shuffle(options.filter((opt) => opt !== correct));
    payload.options = options;
    payload.eliminatedOptions = wrong.slice(0, 1);
  } else if (hintType === 2) {
    payload.clue = buildClue(correct);
  } else {
    payload.answer = correct;
  }

  res.json(payload);
}));

router.post("/collections/:id/study/memorize/answer", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const {
    cardId,
    answer,
    questionType,
    timedOut = false,
    selfCorrect,
    usedHint3 = false,
    skipped = false,
    answerRevealed = false,
  } = req.body || {};

  const card = collection.flashcards.find((c) => c.id === cardId);
  if (!card) return res.status(404).json({ error: "Card not found in this deck." });

  let user = await loadUserGamification(req.user.id);
  const premium = isPremiumActive(user);
  if (user && !premium && user.hearts <= 0) {
    return res.status(403).json(heartsDepletedPayload(user));
  }
  const previousLevel = user?.currentLevel || 1;
  const settings = buildGameState(user, premium).settings;
  const flashcardsOnly = settings.questionStyle === "flashcards";

  if (!skipped) {
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: "flashcard_reviewed",
        meta: { cardId, collectionId: collection.id, usedHint3: Boolean(usedHint3), answerRevealed: Boolean(answerRevealed) },
      },
    });
    await recordQuestionTowardPractice(req.user.id, collection.id);
  }

  let isCorrect = false;
  if (skipped) {
    isCorrect = false;
  } else if (questionType === "flashcard") {
    // Flashcards-only: self-rating after reveal is not an independently correct answer.
    if (flashcardsOnly && answerRevealed) {
      isCorrect = false;
    } else {
      isCorrect = Boolean(selfCorrect);
    }
  } else if (timedOut) {
    isCorrect = false;
  } else if (questionType === "mcq") {
    isCorrect = String(answer || "").trim() === canonicalAnswer(card);
  } else {
    isCorrect =
      answersMatch(answer, canonicalAnswer(card), settings.spellingMistakesAllowed) ||
      answersMatch(answer, card.back, settings.spellingMistakesAllowed);
  }

  // Flashcards-only after reveal: no EXP on "I knew it", no heart loss on "I missed it".
  const flashcardsOnlyAfterReveal =
    flashcardsOnly && questionType === "flashcard" && Boolean(answerRevealed);

  let reward = null;
  let lost = null;
  if (!skipped) {
    if (isCorrect) {
      const baseXp = usedHint3 ? HALF_XP_WITH_HINT3 : XP_PER_CORRECT;
      if (baseXp > 0) {
        reward = await awardCorrectAnswer(req.user.id, { baseXp });
      }
    } else if (!flashcardsOnlyAfterReveal) {
      try {
        lost = await loseHeart(req.user.id, "memorize");
      } catch (err) {
        if (err.status === 403 && err.payload) return res.status(403).json(err.payload);
        throw err;
      }
    }
  }

  user = await loadUserGamification(req.user.id);
  const game = buildGameState(user, isPremiumActive(user));
  const { scheduleDailyChallengeCheck } = require("../lib/dailyChallenge");
  scheduleDailyChallengeCheck(req.user.id);

  res.json({
    correct: isCorrect,
    selfRatedKnown: questionType === "flashcard" && Boolean(selfCorrect),
    xpAwarded: reward?.xpAwarded || 0,
    comboHit: Boolean(reward?.comboHit),
    coinsEarned: reward?.coinsEarned || 0,
    bonusXp: reward?.bonusXp || 0,
    leveledUp: Boolean(isCorrect && (user?.currentLevel || 1) > previousLevel),
    gameOver: Boolean(lost?.gameOver),
    heartsBlocked: Boolean(lost?.heartsBlocked),
    heartsRefillAt: lost?.heartsRefillAt || game.heartsRefillAt,
    correctAnswer: canonicalAnswer(card),
    game,
  });
}));

router.post("/collections/:id/study/memorize/complete", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const { correct = 0, total = 0, xpEarned = 0, answered = 0 } = req.body || {};
  const deckSize = (collection.flashcards || []).length;
  const answeredCount = Math.max(0, Number(answered) || Number(total) || 0);
  const allCardsReviewed = deckSize > 0 && answeredCount >= deckSize;

  const progress = await prisma.deckStudyProgress.upsert({
    where: { userId_collectionId: { userId: req.user.id, collectionId: collection.id } },
    create: { userId: req.user.id, collectionId: collection.id, memorizeSessions: 1 },
    update: { memorizeSessions: { increment: 1 } },
  });

  await prisma.activityLog.create({
    data: {
      userId: req.user.id,
      action: "memorize_complete",
      meta: {
        collectionId: collection.id,
        correct: Number(correct) || 0,
        total: Number(total) || 0,
        answered: answeredCount,
        xpEarned: Number(xpEarned) || 0,
        allCardsReviewed,
      },
    },
  });

  let taskSync = { updated: 0, taskIds: [] };
  if (allCardsReviewed) {
    const { markCollectionDecksCompletedForUser } = require("../lib/taskProgress");
    taskSync = await markCollectionDecksCompletedForUser(req.user.id, collection.id);
  }

  res.json({
    progress,
    summary: {
      correct: Number(correct) || 0,
      total: Number(total) || 0,
      answered: answeredCount,
      xpEarned: Number(xpEarned) || 0,
      completed: allCardsReviewed,
    },
    taskSync,
  });
}));

async function tutorGamePayload(userId) {
  const user = await loadUserGamification(userId);
  return buildGameState(user, isPremiumActive(user));
}

function readTutorState(progress) {
  const raw = progress?.tutorLessonAwards;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { lessonId: "", answers: {}, options: {}, prompts: {}, whys: {}, awards: {} };
  }
  return {
    lessonId: String(raw.lessonId || ""),
    answers: raw.answers && typeof raw.answers === "object" ? raw.answers : {},
    options: raw.options && typeof raw.options === "object" ? raw.options : {},
    prompts: raw.prompts && typeof raw.prompts === "object" ? raw.prompts : {},
    whys: raw.whys && typeof raw.whys === "object" ? raw.whys : {},
    awards: raw.awards && typeof raw.awards === "object" ? raw.awards : {},
  };
}

function pinAnswerToOptions(answer, options) {
  const list = Array.isArray(options) ? options : [];
  const key = String(answer || "").trim();
  if (!key) return "";
  const exact = list.find((item) => String(item || "").trim().toLowerCase() === key.toLowerCase());
  return exact || key;
}

function uniqueNonEmptyOptions(options) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(options) ? options : []) {
    const text = String(item || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function tutorCorrectAnswer(card, state, qIndex) {
  const key = `${card.id}:${qIndex}`;
  const stored = String(state.answers[key] || canonicalAnswer(card)).trim();
  const prompt = String(state.prompts?.[key] || "").trim();
  const options = Array.isArray(state.options[key]) ? state.options[key] : [];
  if (!prompt || options.length < 2) return pinAnswerToOptions(stored, options) || stored;
  const resolved = resolveTutorAnswerKey(prompt, options, card, stored) || stored;
  return pinAnswerToOptions(resolved, options) || resolved;
}

function tutorAnswerFeedback(card, state, qIndex, selected, revealed) {
  const key = `${card.id}:${qIndex}`;
  return explainTutorChoice({
    card,
    question: String(state.prompts?.[key] || "").trim(),
    correct: tutorCorrectAnswer(card, state, qIndex),
    selected,
    why: String(state.whys?.[key] || "").trim(),
    revealed,
  });
}

router.post("/collections/:id/study/tutor-lesson", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  if (!collection.flashcards.length) {
    return res.status(400).json({ error: "Add cards to this deck before starting a tutor lesson." });
  }

  if (!(await enforceTutorLimit(req, res))) return;

  try {
    const lessonCards = await generateDeckTutorLesson(collection.name, collection.flashcards);
    const lessonId = randomUUID();
    const answers = {};
    const options = {};
    const prompts = {};
    const whys = {};

    const isValidMcq = (question) => {
      const opts = uniqueNonEmptyOptions(question?.options);
      const answer = String(question?.answer || "").trim();
      const prompt = String(question?.question || "").trim();
      if (!prompt || !answer || opts.length !== 4) return false;
      const matches = opts.filter((item) => item.toLowerCase() === answer.toLowerCase());
      return matches.length === 1;
    };

    const cleanedCards = [];
    for (const card of lessonCards.cards || []) {
      const validQuestions = [];
      (card.questions || []).forEach((question) => {
        const opts = uniqueNonEmptyOptions(question?.options);
        let pinned = pinAnswerToOptions(question.answer, opts) || String(question.answer || "").trim();
        if (pinned && !opts.some((item) => item.toLowerCase() === pinned.toLowerCase())) {
          opts.unshift(pinned);
        }
        const nextOpts = uniqueNonEmptyOptions(opts).slice(0, 4);
        pinned = pinAnswerToOptions(pinned, nextOpts) || pinned;
        const nextQuestion = {
          ...question,
          question: String(question.question || "").trim(),
          answer: pinned,
          options: nextOpts,
          why: String(question.why || "").trim(),
        };
        if (!isValidMcq(nextQuestion)) return;
        validQuestions.push(nextQuestion);
      });
      if (!validQuestions.length) continue;
      cleanedCards.push({ ...card, questions: validQuestions });
      validQuestions.forEach((question, index) => {
        const key = `${card.cardId}:${index}`;
        answers[key] = question.answer;
        options[key] = question.options;
        prompts[key] = question.question;
        whys[key] = question.why;
      });
    }

    if (!cleanedCards.length || !Object.keys(answers).length) {
      console.error("Tutor lesson validation failed: no valid MCQ questions after assembly", {
        collectionId: collection.id,
        cardCount: (collection.flashcards || []).length,
      });
      return res.status(502).json({
        error: "Could not build a valid tutor lesson for this deck. Please try again.",
      });
    }

    const progress = await getOrCreateProgress(req.user.id, collection.id);
    await prisma.deckStudyProgress.update({
      where: { id: progress.id },
      data: { tutorLessonAwards: { lessonId, answers, options, prompts, whys, awards: {} } },
    });

    if (collection.userId === req.user.id) {
      await Promise.all(
        cleanedCards.map(async (item) => {
          const original = collection.flashcards.find((card) => card.id === item.cardId);
          if (!original) return;
          const data = {};
          if (!String(original.explanation || "").trim() && item.explanation) data.explanation = item.explanation;
          if (!String(original.answerHighlight || "").trim() && item.answerHighlight) {
            data.answerHighlight = pickAnswerHighlight(original.front, original.back, item.answerHighlight);
          }
          if (Object.keys(data).length) {
            await prisma.flashcard.update({ where: { id: original.id }, data });
          }
        })
      );
    }

    res.json({
      lesson: { title: lessonCards.title, cards: cleanedCards, lessonId },
      game: await tutorGamePayload(req.user.id),
      xpRules: { correct: TUTOR_MCQ_XP, hint: 0, reveal: 0 },
    });
  } catch (err) {
    console.error("Tutor lesson error:", err?.message || err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
}));

router.post("/collections/:id/study/tutor-lesson/hint", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const { lessonId, cardId, questionIndex = 0, options: clientOptions } = req.body || {};
  const card = collection.flashcards.find((item) => item.id === String(cardId || ""));
  if (!card) return res.status(404).json({ error: "Card not found in this deck." });

  const progress = await getOrCreateProgress(req.user.id, collection.id);
  const state = readTutorState(progress);
  if (!lessonId || state.lessonId !== String(lessonId)) {
    return res.status(400).json({ error: "Start the tutor lesson again to use hints." });
  }

  const qIndex = Number(questionIndex) || 0;
  const optionKey = `${card.id}:${qIndex}`;
  const hintKey = `${card.id}:${qIndex}:hint`;
  const eliminatedKey = `${card.id}:${qIndex}:eliminated`;
  const xpKey = `${card.id}:${qIndex}:xp`;
  const revealKey = `${card.id}:${qIndex}:reveal`;
  if (state.awards[xpKey] || state.awards[revealKey]) {
    return res.status(400).json({ error: "This question is already finished." });
  }

  const storedAnswer = String(state.answers[optionKey] || canonicalAnswer(card)).trim();
  const storedOptions = Array.isArray(state.options[optionKey]) ? state.options[optionKey] : [];
  const incoming = Array.isArray(clientOptions) ? clientOptions.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const options = storedOptions.length ? storedOptions : incoming;
  if (!storedOptions.length && options.length) {
    state.options[optionKey] = options;
  }
  const alreadyEliminated = Array.isArray(state.awards[eliminatedKey])
    ? state.awards[eliminatedKey]
    : state.awards[eliminatedKey]
      ? [state.awards[eliminatedKey]]
      : [];
  const eliminated = eliminateOneIncorrectOption(options, storedAnswer, alreadyEliminated);
  if (!eliminated) {
    return res.status(400).json({ error: "No incorrect choices left to remove." });
  }

  try {
    await consumeHint(req.user.id);
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({
        error: err.message || "No hints remaining.",
        code: err.code || "NO_HINTS_REMAINING",
        upgradeRequired: true,
        limits: err.limits,
      });
    }
    throw err;
  }
  // Hints mark the question as assisted — full correct EXP is not awarded later.
  const eliminatedOptions = [...alreadyEliminated, eliminated];
  state.awards[hintKey] = true;
  state.awards[eliminatedKey] = eliminatedOptions;
  await prisma.deckStudyProgress.update({
    where: { id: progress.id },
    data: { tutorLessonAwards: { ...state, awards: state.awards } },
  });

  res.json({
    eliminatedOptions,
    xpDeducted: 0,
    alreadyHinted: true,
    hintsRemainingOnQuestion: options.filter(
      (item) => item !== storedAnswer && !eliminatedOptions.some((entry) => String(entry).toLowerCase() === String(item).toLowerCase())
    ).length,
    game: await tutorGamePayload(req.user.id),
  });
}));

router.post("/collections/:id/study/tutor-lesson/answer", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const { lessonId, cardId, questionIndex = 0, answer, revealed = false } = req.body || {};
  const card = collection.flashcards.find((item) => item.id === String(cardId || ""));
  if (!card) return res.status(404).json({ error: "Card not found in this deck." });

  let user = await loadUserGamification(req.user.id);
  const premium = isPremiumActive(user);
  if (user && !premium && user.hearts <= 0) {
    return res.status(403).json(heartsDepletedPayload(user));
  }

  const progress = await getOrCreateProgress(req.user.id, collection.id);
  const state = readTutorState(progress);
  if (!lessonId || state.lessonId !== String(lessonId)) {
    return res.status(400).json({ error: "Start the tutor lesson again to answer questions." });
  }

  const qIndex = Number(questionIndex) || 0;
  const storedAnswer = tutorCorrectAnswer(card, state, qIndex);
  if (storedAnswer && state.answers[`${card.id}:${qIndex}`] !== storedAnswer) {
    state.answers[`${card.id}:${qIndex}`] = storedAnswer;
  }
  const xpKey = `${card.id}:${qIndex}:xp`;
  const revealKey = `${card.id}:${qIndex}:reveal`;
  const alreadyAwarded = Boolean(state.awards[xpKey]);
  const alreadyRevealed = Boolean(state.awards[revealKey]);

  if (alreadyAwarded || alreadyRevealed) {
    return res.json({
      correct: alreadyAwarded,
      xpAwarded: 0,
      alreadyAwarded: true,
      revealed: alreadyRevealed,
      correctAnswer: storedAnswer,
      feedback: tutorAnswerFeedback(card, state, qIndex, answer, alreadyRevealed && !alreadyAwarded),
      game: await tutorGamePayload(req.user.id),
    });
  }

  if (revealed) {
    state.awards[revealKey] = true;
    await prisma.deckStudyProgress.update({
      where: { id: progress.id },
      data: { tutorLessonAwards: { ...state } },
    });
    return res.json({
      correct: false,
      xpAwarded: 0,
      revealed: true,
      correctAnswer: storedAnswer,
      feedback: tutorAnswerFeedback(card, state, qIndex, "", true),
      game: await tutorGamePayload(req.user.id),
    });
  }

  const key = `${card.id}:${qIndex}`;
  const hintKey = `${card.id}:${qIndex}:hint`;
  const usedHint = Boolean(state.awards[hintKey]);
  const optionList = Array.isArray(state.options[key]) ? state.options[key] : [];
  if (optionList.length < 4) {
    return res.status(400).json({ error: "This question is missing answer choices. Please restart the lesson." });
  }
  const selected = pinAnswerToOptions(String(answer || "").trim(), optionList) || String(answer || "").trim();
  const isCorrect =
    Boolean(selected)
    && Boolean(storedAnswer)
    && (selected.toLowerCase() === String(storedAnswer).toLowerCase() || answersEquivalent(selected, storedAnswer));
  let xpAwarded = 0;
  let lost = null;
  if (isCorrect) {
    // Full EXP only for independent correct answers (no hint, no reveal).
    if (!usedHint) {
      await adjustXp(req.user.id, TUTOR_MCQ_XP, {
        action: "tutor_mcq",
        meta: { collectionId: collection.id, cardId: card.id, questionIndex: qIndex, lessonId, xp: TUTOR_MCQ_XP },
        countCorrect: true,
      });
      state.awards[xpKey] = true;
      xpAwarded = TUTOR_MCQ_XP;
    } else {
      // Assisted correct: mark finished without EXP so it cannot be re-awarded.
      state.awards[`${card.id}:${qIndex}:assisted`] = true;
      state.awards[revealKey] = true;
    }
  } else {
    try {
      lost = await loseHeart(req.user.id, "tutor");
    } catch (err) {
      if (err.status === 403 && err.payload) return res.status(403).json(err.payload);
      throw err;
    }
    // Wrong answers can be retried — do not permanently close the question.
  }
  await prisma.deckStudyProgress.update({
    where: { id: progress.id },
    data: { tutorLessonAwards: { ...state, awards: state.awards } },
  });

  res.json({
    correct: isCorrect && !usedHint ? Boolean(xpAwarded) : isCorrect,
    independentlyCorrect: Boolean(xpAwarded),
    assisted: Boolean(usedHint && isCorrect),
    xpAwarded,
    alreadyAwarded: false,
    revealed: Boolean(usedHint && isCorrect),
    canRetry: !isCorrect,
    correctAnswer: storedAnswer,
    feedback: tutorAnswerFeedback(card, state, qIndex, selected, false),
    gameOver: Boolean(lost?.gameOver),
    heartsBlocked: Boolean(lost?.heartsBlocked),
    heartsRefillAt: lost?.heartsRefillAt || null,
    game: await tutorGamePayload(req.user.id),
  });
}));

router.post("/collections/:id/study/tutor-lesson/complete", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const { lessonId } = req.body || {};
  const progressRow = await getOrCreateProgress(req.user.id, collection.id);
  const state = readTutorState(progressRow);
  if (!lessonId || state.lessonId !== String(lessonId)) {
    return res.status(400).json({ error: "Start the tutor lesson again to complete it." });
  }

  const questionKeys = Object.keys(state.answers || {});
  if (!questionKeys.length) {
    return res.status(400).json({ error: "This lesson has no graded questions to complete." });
  }

  const unfinished = questionKeys.filter((key) => {
    const xpKey = `${key}:xp`;
    const revealKey = `${key}:reveal`;
    const hintKey = `${key}:hint`;
    const assistedKey = `${key}:assisted`;
    // Only independently correct answers (XP awarded, no hint/reveal/assist) count.
    if (state.awards[hintKey] || state.awards[revealKey] || state.awards[assistedKey]) return true;
    return !state.awards[xpKey];
  });

  if (unfinished.length) {
    return res.status(400).json({
      error: "Answer every question correctly without using a hint or reveal before completing the lesson.",
      unfinishedCount: unfinished.length,
    });
  }

  const progress = await prisma.deckStudyProgress.update({
    where: { id: progressRow.id },
    data: { tutorCompleted: true },
  });

  const { markCollectionDecksCompletedForUser } = require("../lib/taskProgress");
  const taskSync = await markCollectionDecksCompletedForUser(req.user.id, collection.id);

  res.json({ progress, game: await tutorGamePayload(req.user.id), taskSync, completed: true });
}));

router.get("/collections/:id/study/practice/questions", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  if (!collection.flashcards.length) {
    return res.status(400).json({ error: "Add cards to this deck before taking a practice test." });
  }

  const player = await loadUserGamification(req.user.id);
  if (player && !isPremiumActive(player) && player.hearts <= 0) {
    return res.status(403).json(heartsDepletedPayload(player));
  }

  const progress = await getOrCreateProgress(req.user.id, collection.id);
  const isOwner = collection.userId === req.user.id;
  const unlocked = isPracticeUnlocked(progress) || (!isOwner && collection.isPublic);
  if (!unlocked) {
    return res.status(403).json({
      error: `Answer ${PRACTICE_UNLOCK_TARGET} questions to unlock Practice Test.`,
      code: "PRACTICE_LOCKED",
      progress,
      target: PRACTICE_UNLOCK_TARGET,
      unlocked: false,
    });
  }

  const batchSize = Math.min(Number(req.query.count) || 10, 20);
  const questions = buildPracticeQuestions(collection.flashcards, batchSize);

  res.json({
    questions,
    progress,
    target: PRACTICE_UNLOCK_TARGET,
    unlocked: true,
  });
}));

// Instant quiz from a public (or owned) deck — no practice-unlock gate.
router.get("/collections/:id/study/quiz", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  if (!collection.flashcards.length) {
    return res.status(400).json({ error: "This deck has no cards to quiz yet." });
  }

  const player = await loadUserGamification(req.user.id);
  if (player && !isPremiumActive(player) && player.hearts <= 0) {
    return res.status(403).json(heartsDepletedPayload(player));
  }

  const count = Math.min(Number(req.query.count) || 10, 20);
  const questions = buildPracticeQuestions(collection.flashcards, count);
  if (!questions.length) {
    return res.status(400).json({ error: "Could not build a quiz from this deck." });
  }

  res.json(toPublicQuizPayload(collection, questions));
}));

router.post("/collections/:id/study/practice/answer", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const player = await loadUserGamification(req.user.id);
  if (player && !isPremiumActive(player) && player.hearts <= 0) {
    return res.status(403).json(heartsDepletedPayload(player));
  }

  const { correct } = req.body || {};
  const progress = await getOrCreateProgress(req.user.id, collection.id);
  const isOwner = collection.userId === req.user.id;
  if (!isPracticeUnlocked(progress) && (isOwner || !collection.isPublic)) {
    return res.status(403).json({
      error: `Answer ${PRACTICE_UNLOCK_TARGET} questions to unlock Practice Test.`,
      code: "PRACTICE_LOCKED",
      progress,
      target: PRACTICE_UNLOCK_TARGET,
      unlocked: false,
    });
  }
  const nextCount = progress.practiceAnswered + 1;
  const unlocked = nextCount >= PRACTICE_UNLOCK_TARGET || progress.practiceUnlocked;

  const updated = await prisma.deckStudyProgress.update({
    where: { id: progress.id },
    data: {
      practiceAnswered: nextCount,
      practiceUnlocked: unlocked,
    },
  });

  res.json({
    progress: updated,
    target: PRACTICE_UNLOCK_TARGET,
    correct: Boolean(correct),
    justUnlocked: !progress.practiceUnlocked && unlocked,
  });
}));

// ---- Flashcards ----

// Create a flashcard inside a collection.
router.post("/", safe(async (req, res) => {
  const { front, back, collectionId, answerHighlight, explanation } = req.body;
  if (!front?.trim() || !back?.trim()) {
    return res.status(400).json({ error: "Both the front and back of the card are required." });
  }
  if (!collectionId) {
    return res.status(400).json({ error: "Choose a deck for this card." });
  }

    const collection = await prisma.flashcardCollection.findFirst({
      where: { id: collectionId, userId: req.user.id },
    });
    if (!collection) return res.status(404).json({ error: "Collection not found" });

  const normalized = normalizeImportedCard({ front, back, answerHighlight, explanation });
  const savedHighlight = resolveSavedHighlight(normalized.front, normalized.back, answerHighlight);
  const flashcard = await prisma.flashcard.create({
    data: {
      front: normalized.front,
      back: normalized.back,
      answerHighlight: savedHighlight || normalized.answerHighlight,
      explanation: normalized.explanation,
      collectionId: collection.id,
      materialId: null,
    },
  });
  res.status(201).json({ flashcard, collection: { id: collection.id, name: collection.name } });
}));

// Update a flashcard (owner via collection or material ownership).
router.patch("/:id", async (req, res) => {
  const { front, back, answerHighlight, explanation } = req.body;
  const card = await prisma.flashcard.findUnique({ where: { id: req.params.id } });
  if (!card) return res.status(404).json({ error: "Flashcard not found" });

  const data = {};
  if (typeof front === "string" && front.trim()) data.front = front.trim();
  if (typeof back === "string" && back.trim()) data.back = back.trim();
  if (typeof explanation === "string") data.explanation = explanation.trim();
  if (typeof answerHighlight === "string" || data.back) {
    const body = data.back || card.back || "";
    const requested = typeof answerHighlight === "string" ? answerHighlight : card.answerHighlight;
    data.answerHighlight =
      typeof answerHighlight === "string"
        ? resolveSavedHighlight(data.front || card.front, body, requested)
        : remapHighlights(card.back, body, requested) ||
          snapHighlightToBack(body, requested) ||
          pickAnswerHighlight(data.front || card.front, body, requested);
  }

  const owned =
    (card.collectionId &&
      (await prisma.flashcardCollection.findFirst({
        where: { id: card.collectionId, userId: req.user.id },
      }))) ||
    (card.materialId &&
      (await prisma.studyMaterial.findFirst({
        where: { id: card.materialId, uploadedById: req.user.id },
      })));
  if (!owned) return res.status(404).json({ error: "Flashcard not found" });

  const updated = await prisma.flashcard.update({ where: { id: req.params.id }, data });
  res.json({ flashcard: updated });
});

// Delete a flashcard (owner via collection or material ownership).
router.delete("/:id", safe(async (req, res) => {
  const card = await prisma.flashcard.findUnique({ where: { id: req.params.id } });
  if (!card) return res.status(404).json({ error: "Flashcard not found" });

  const owned =
    (card.collectionId &&
      (await prisma.flashcardCollection.findFirst({
        where: { id: card.collectionId, userId: req.user.id },
      }))) ||
    (card.materialId &&
      (await prisma.studyMaterial.findFirst({
        where: { id: card.materialId, uploadedById: req.user.id },
      })));
  if (!owned) return res.status(404).json({ error: "Flashcard not found" });

  await prisma.flashcard.delete({ where: { id: req.params.id } });
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, id: card.id });
}));

async function resolveUserCollection(userId, { collectionId, collectionName }) {
  if (collectionId) {
    return prisma.flashcardCollection.findFirst({
      where: { id: collectionId, userId },
    });
  }
  const trimmed = collectionName && String(collectionName).trim();
  if (!trimmed) return null;
  const existing = await prisma.flashcardCollection.findFirst({
    where: { userId, name: trimmed },
  });
  if (existing) return existing;
  return prisma.flashcardCollection.create({
    data: { userId, name: trimmed },
  });
}

async function saveCardsToCollection(userId, collection, validCards, materialId = null) {
  const saved = await prisma.flashcard.createMany({
    data: validCards.map((c) => {
      const normalized = normalizeImportedCard(c);
      return {
        front: normalized.front,
        back: normalized.back,
        answerHighlight: normalized.answerHighlight,
        explanation: normalized.explanation,
        collectionId: collection.id,
        materialId: materialId || null,
      };
    }),
  });
  await prisma.activityLog.create({ data: { userId, action: "magic_import" } });
  const withCount = await prisma.flashcardCollection.findUnique({
    where: { id: collection.id },
    include: { _count: { select: { flashcards: true } } },
  });
  return {
    savedCount: saved.count,
    collection: withCount
      ? { id: withCount.id, name: withCount.name, _count: withCount._count }
      : { id: collection.id, name: collection.name },
  };
}

// ---- Magic Import (AI) ----
// Generates flashcards from a topic, pasted notes, an AI study pack, or an
// uploaded PDF. Requires a target collection (or creates one).
router.post("/magic-import", requireRole("STUDENT"), async (req, res) => {
  try {
    const { topic, notes, materialId, collectionName, collectionId, cards: providedCards } = req.body;

    if (Array.isArray(providedCards) && providedCards.length > 0) {
      const validCards = providedCards
        .map((c) => normalizeImportedCard(c))
        .filter((c) => c.front && c.back);
      if (validCards.length === 0) {
        return res.status(400).json({ error: "Add at least one valid card to save." });
      }
      const collection = await resolveUserCollection(req.user.id, { collectionId, collectionName });
      if (!collection) {
        return res.status(400).json({ error: "Choose a deck or enter a new deck name." });
      }
      const { savedCount, collection: savedCollection } = await saveCardsToCollection(
        req.user.id,
        collection,
        validCards,
        materialId || null
      );
      return res.status(201).json({
        flashcards: validCards,
        savedCount,
        collection: savedCollection,
      });
    }

    const hasTopic = topic && String(topic).trim().length > 0;
    const hasNotes = notes && String(notes).trim().length > 0;

    let sourceText = "";
    let sourceTitle = hasTopic ? String(topic).trim() : "General";

    if (hasNotes) {
      sourceText = String(notes).trim();
    } else if (materialId) {
      const material = await prisma.studyMaterial.findFirst({
        where: { id: materialId, uploadedById: req.user.id },
        include: FLASHCARDS_INCLUDE,
      });
      if (!material) return res.status(404).json({ error: "Study pack not found" });
      sourceTitle = material.title;
      sourceText = material.rawText || "";
      // If the study pack has flashcards, use them directly instead of
      // spending another AI call.
      if (!sourceText.trim() && material.flashcards?.length) {
        const cards = normalizeGeneratedCards(material.flashcards);
        return res.json({ flashcards: cards, sourceTitle });
      }
    } else if (!hasTopic) {
      return res.status(400).json({
        error: "Choose a topic, paste notes, or pick a study pack to generate flashcards from.",
      });
    }

    if (!(await enforcePromptLimit(req, res))) return;

    const collection = await resolveUserCollection(req.user.id, { collectionId, collectionName });
    if ((collectionId || collectionName) && !collection) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const pack = await generateFlashcards(sourceTitle, sourceText);

    const validCards = normalizeGeneratedCards(pack.flashcards || []).filter(
      (c) => c.front && c.back && c.answerHighlight
    );
    if (validCards.length === 0) {
      return res.status(502).json({ error: "The AI didn't return any flashcards. Please try again." });
    }

    if (collection) {
      const { savedCount, collection: savedCollection } = await saveCardsToCollection(
        req.user.id,
        collection,
        validCards,
        materialId || null
      );
      return res.status(201).json({
        flashcards: validCards,
        savedCount,
        collection: savedCollection,
      });
    }

    res.status(201).json({
      flashcards: validCards,
      savedCount: 0,
      collection: null,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
});

module.exports = router;

