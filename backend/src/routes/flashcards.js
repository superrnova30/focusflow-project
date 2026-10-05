const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateFlashcards, generateDeckTutorLesson } = require("../lib/ai");
const { loadUserGamification, bumpStreak, xpWithinLevel, xpForNextLevel, LEVEL_XP_STEP, heartsDepletedPayload, heartsRefillAtFrom, loseHeart, awardCorrectAnswer } = require("../lib/gamification");
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

const router = express.Router();
router.use(requireAuth);

const PRACTICE_UNLOCK_TARGET = 247;
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
  const others = cards.filter((c) => c.id !== card.id);
  const distractors = shuffle(others).slice(0, 3).map((c) => c.back);
  const fallbacks = ["Not quite — review this card", "A related but incorrect idea", "This is a common misconception"];
  while (distractors.length < 3) {
    distractors.push(fallbacks[distractors.length] || "None of the above");
  }
  return shuffle([card.back, ...distractors.slice(0, 3)]);
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
      answer: card.back,
    };
  });
}

function buildMemorizeQuestions(cards, settings) {
  const pool = shuffle(cards);
  return pool.map((card, idx) => {
    const type = pickQuestionType(settings, idx + card.front.length);
    const base = {
      id: `${card.id}-m${idx}`,
      cardId: card.id,
      question: card.front,
      answer: card.back,
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

async function getOwnedCollection(userId, collectionId) {
  return prisma.flashcardCollection.findFirst({
    where: { id: collectionId, userId },
    include: { flashcards: true },
  });
}

async function getAccessibleCollection(userId, collectionId) {
  const collection = await prisma.flashcardCollection.findUnique({
    where: { id: collectionId },
    include: { flashcards: true },
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

// Delete a collection (owner only). Cards in it are removed with it.
router.delete("/collections/:id", safe(async (req, res) => {
  const result = await prisma.flashcardCollection.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (result.count === 0) return res.status(404).json({ error: "Collection not found" });
  res.json({ ok: true });
}));

// Fetch one collection with its cards (owner always; other students only when public).
router.get("/collections/:id", safe(async (req, res) => {
  const collection = await prisma.flashcardCollection.findUnique({
    where: { id: req.params.id },
    include: { flashcards: true },
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
    unlocked: progress.practiceUnlocked || (!isOwner && collection.isPublic),
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

  const { cardId, hintType, options = [] } = req.body || {};
  const card = collection.flashcards.find((c) => c.id === cardId);
  if (!card) return res.status(404).json({ error: "Card not found in this deck." });

  const user = await loadUserGamification(req.user.id);
  const premium = isPremiumActive(user);
  let hintsRemaining = premium ? 999 : (user.hints || 0) + (user.bonusHints || 0);

  if (!premium) {
    try {
      const result = await consumeHint(req.user.id);
      hintsRemaining = result.hints;
    } catch (err) {
      if (err.code !== "NO_HINTS_REMAINING") throw err;
      return res.status(403).json({
        error: "No hints remaining. Earn coins from streak levels or upgrade for unlimited hints.",
        code: "HINTS_DEPLETED",
        upgradeRequired: true,
        limits: err.limits || buildLimitsPayload(user),
      });
    }
    await prisma.activityLog.create({
      data: { userId: req.user.id, action: "hint_used", meta: { cardId, hintType, collectionId: collection.id } },
    });
  }

  const type = Number(hintType);
  const payload = { hintsRemaining, unlimitedHints: premium, noXpPenalty: false };

  if (type === 1) {
    const incorrect = (options.length ? options : buildMcqOptions(collection.flashcards, card)).filter(
      (opt) => opt !== card.back
    );
    payload.eliminatedOptions = shuffle(incorrect).slice(0, Math.min(2, incorrect.length));
  } else if (type === 2) {
    payload.clue = buildClue(card.back);
  } else if (type === 3) {
    payload.answer = card.back;
    payload.noXpPenalty = true;
  } else {
    return res.status(400).json({ error: "Invalid hint type." });
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
  } = req.body || {};

  const card = collection.flashcards.find((c) => c.id === cardId);
  if (!card) return res.status(404).json({ error: "Card not found in this deck." });

  let user = await loadUserGamification(req.user.id);
  const premium = isPremiumActive(user);
  const settings = buildGameState(user, premium).settings;

  if (!premium && user.hearts <= 0) {
    return res.status(403).json({
      ...heartsDepletedPayload(user, { game: buildGameState(user, premium) }),
      limits: buildLimitsPayload(user),
    });
  }

  if (!skipped) {
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: "flashcard_reviewed",
        meta: { cardId, collectionId: collection.id },
      },
    });
  }

  let isCorrect = false;
  if (questionType === "flashcard") {
    isCorrect = Boolean(selfCorrect);
  } else if (timedOut || skipped) {
    isCorrect = false;
  } else if (questionType === "mcq") {
    isCorrect = String(answer || "").trim() === String(card.back).trim();
  } else {
    isCorrect = answersMatch(answer, card.back, settings.spellingMistakesAllowed);
  }

  let xpAwarded = 0;
  let leveledUp = false;
  let gameOver = false;
  let heartsRefillAt = null;
  let comboHit = false;
  let coinsEarned = 0;
  let bonusXp = 0;

  if (isCorrect && !usedHint3) {
    xpAwarded = XP_PER_CORRECT;
  } else if (isCorrect && usedHint3) {
    xpAwarded = HALF_XP_WITH_HINT3;
  }

  if (isCorrect && xpAwarded > 0) {
    const beforeLevel = user.currentLevel;
    const reward = await awardCorrectAnswer(req.user.id, { baseXp: xpAwarded });
    user = reward.user;
    xpAwarded = reward.xpAwarded;
    comboHit = reward.comboHit;
    coinsEarned = reward.coinsEarned;
    bonusXp = reward.bonusXp;
    leveledUp = user.currentLevel > beforeLevel;
  } else if (!isCorrect) {
    try {
      const lost = await loseHeart(req.user.id, "memorize");
      user = lost.user;
      gameOver = lost.gameOver;
      heartsRefillAt = lost.heartsRefillAt;
    } catch (err) {
      if (err.status === 403 && err.payload) {
        return res.status(403).json({
          ...err.payload,
          limits: buildLimitsPayload(user),
        });
      }
      throw err;
    }
  }

  const game = buildGameState(user, premium);
  const { scheduleDailyChallengeCheck } = require("../lib/dailyChallenge");
  scheduleDailyChallengeCheck(req.user.id);

  res.json({
    correct: isCorrect,
    xpAwarded,
    comboHit,
    coinsEarned,
    bonusXp,
    leveledUp,
    gameOver,
    heartsRefillAt,
    correctAnswer: card.back,
    game,
  });
}));

router.post("/collections/:id/study/memorize/complete", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const { correct = 0, total = 0, xpEarned = 0 } = req.body || {};
  const progress = await prisma.deckStudyProgress.upsert({
    where: { userId_collectionId: { userId: req.user.id, collectionId: collection.id } },
    create: { userId: req.user.id, collectionId: collection.id, memorizeSessions: 1 },
    update: { memorizeSessions: { increment: 1 } },
  });

  await prisma.activityLog.create({
    data: {
      userId: req.user.id,
      action: "memorize_complete",
      meta: { collectionId: collection.id, correct: Number(correct) || 0, total: Number(total) || 0, xpEarned: Number(xpEarned) || 0 },
    },
  });

  res.json({ progress, summary: { correct: Number(correct) || 0, total: Number(total) || 0, xpEarned: Number(xpEarned) || 0 } });
}));

router.post("/collections/:id/study/tutor-lesson", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  if (!collection.flashcards.length) {
    return res.status(400).json({ error: "Add cards to this deck before starting a tutor lesson." });
  }

  if (!(await enforceTutorLimit(req, res))) return;

  try {
    const lesson = await generateDeckTutorLesson(collection.name, collection.flashcards);
    res.json({ lesson });
  } catch (err) {
    console.error("Tutor lesson error:", err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
}));

router.post("/collections/:id/study/tutor-lesson/complete", safe(async (req, res) => {
  const collection = await getAccessibleCollection(req.user.id, req.params.id);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const progress = await prisma.deckStudyProgress.upsert({
    where: { userId_collectionId: { userId: req.user.id, collectionId: collection.id } },
    create: { userId: req.user.id, collectionId: collection.id, tutorCompleted: true },
    update: { tutorCompleted: true },
  });

  res.json({ progress });
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
  const batchSize = Math.min(Number(req.query.count) || 10, 20);
  const questions = buildPracticeQuestions(collection.flashcards, batchSize);
  const isOwner = collection.userId === req.user.id;

  res.json({
    questions,
    progress,
    target: PRACTICE_UNLOCK_TARGET,
    unlocked: progress.practiceUnlocked || (!isOwner && collection.isPublic),
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
  const { front, back, collectionId } = req.body;
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

  const flashcard = await prisma.flashcard.create({
    data: {
      front: front.trim(),
      back: back.trim(),
      collectionId: collection.id,
      materialId: null,
    },
  });
  res.status(201).json({ flashcard, collection: { id: collection.id, name: collection.name } });
}));

// Update a flashcard (owner via collection or material ownership).
router.patch("/:id", async (req, res) => {
  const { front, back } = req.body;
  const data = {};
  if (typeof front === "string" && front.trim()) data.front = front.trim();
  if (typeof back === "string" && back.trim()) data.back = back.trim();

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

  const updated = await prisma.flashcard.update({ where: { id: req.params.id }, data });
  res.json({ flashcard: updated });
});

// Delete a flashcard (owner via collection or material ownership).
router.delete("/:id", async (req, res) => {
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
  res.json({ ok: true });
});

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
    data: validCards.map((c) => ({
      front: c.front,
      back: c.back,
      collectionId: collection.id,
      materialId: materialId || null,
    })),
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
        .map((c) => ({
          front: String(c.front || "").trim(),
          back: String(c.back || "").trim(),
        }))
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
        include: { flashcards: true },
      });
      if (!material) return res.status(404).json({ error: "Study pack not found" });
      sourceTitle = material.title;
      sourceText = material.rawText || "";
      // If the study pack has flashcards, use them directly instead of
      // spending another AI call.
      if (!sourceText.trim() && material.flashcards?.length) {
        const cards = material.flashcards.map((f) => ({ front: f.front, back: f.back }));
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

    const cards = (pack.flashcards || []).map((f) => ({
      front: String(f.front || "").trim(),
      back: String(f.back || "").trim(),
    }));
    const validCards = cards.filter((c) => c.front && c.back);
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

