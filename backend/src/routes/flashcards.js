const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateFlashcards } = require("../lib/ai");

const router = express.Router();
router.use(requireAuth);

function getUserFriendlyAiError(err) {
  if (err?.message) return err.message;
  return "AI generation is temporarily unavailable. Please try again in a moment.";
}

// ---- Collections ----

// List the current user's flashcard collections with card counts.
router.get("/collections", async (req, res) => {
  const collections = await prisma.flashcardCollection.findMany({
    where: { userId: req.user.id },
    include: { _count: { select: { flashcards: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ collections });
});

// Create a new collection.
router.post("/collections", async (req, res) => {
  const { name } = req.body;
  const trimmed = name && String(name).trim();
  if (!trimmed) return res.status(400).json({ error: "Collection name is required." });

  const collection = await prisma.flashcardCollection.create({
    data: { name: trimmed, userId: req.user.id },
    include: { _count: { select: { flashcards: true } } },
  });
  res.status(201).json({ collection });
});

// Rename a collection (owner only).
router.patch("/collections/:id", async (req, res) => {
  const { name } = req.body;
  const trimmed = name && String(name).trim();
  if (!trimmed) return res.status(400).json({ error: "Collection name is required." });

  const result = await prisma.flashcardCollection.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data: { name: trimmed },
  });
  if (result.count === 0) return res.status(404).json({ error: "Collection not found" });

  const collection = await prisma.flashcardCollection.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { flashcards: true } } },
  });
  res.json({ collection });
});

// Delete a collection (owner only). Cards in it are removed with it.
router.delete("/collections/:id", async (req, res) => {
  const result = await prisma.flashcardCollection.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (result.count === 0) return res.status(404).json({ error: "Collection not found" });
  res.json({ ok: true });
});

// Fetch one collection with its cards.
router.get("/collections/:id", async (req, res) => {
  const collection = await prisma.flashcardCollection.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { flashcards: true },
  });
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  res.json({ collection });
});

// ---- Flashcards ----

// Create a flashcard (either standalone or inside a collection).
router.post("/", async (req, res) => {
  const { front, back, collectionId } = req.body;
  if (!front?.trim() || !back?.trim()) {
    return res.status(400).json({ error: "Both the front and back of the card are required." });
  }

  if (collectionId) {
    const collection = await prisma.flashcardCollection.findFirst({
      where: { id: collectionId, userId: req.user.id },
    });
    if (!collection) return res.status(404).json({ error: "Collection not found" });
  }

  const flashcard = await prisma.flashcard.create({
    data: {
      front: front.trim(),
      back: back.trim(),
      collectionId: collectionId || null,
      materialId: null,
    },
  });
  res.status(201).json({ flashcard });
});

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

// ---- Magic Import (AI) ----
// Generates flashcards from a topic, pasted notes, an AI study pack, or an
// uploaded PDF. Requires a target collection (or creates one).
router.post("/magic-import", requireRole("STUDENT"), async (req, res) => {
  try {
    const { topic, notes, materialId, collectionName } = req.body;
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

    // Determine target collection: use collectionName (create if needed) or
    // an auto-created one named after the source.
    let collection = null;
    if (collectionName && String(collectionName).trim()) {
      const existing = await prisma.flashcardCollection.findFirst({
        where: { userId: req.user.id, name: String(collectionName).trim() },
      });
      collection =
        existing ||
        (await prisma.flashcardCollection.create({
          data: { userId: req.user.id, name: String(collectionName).trim() },
        }));
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

    let saved = null;
    if (collection) {
      saved = await prisma.flashcard.createMany({
        data: validCards.map((c) => ({
          front: c.front,
          back: c.back,
          collectionId: collection.id,
          materialId: materialId || null,
        })),
      });
    }

    await prisma.activityLog.create({ data: { userId: req.user.id, action: "magic_import" } });

    res.status(201).json({
      flashcards: validCards,
      savedCount: saved ? saved.count : 0,
      collection: collection ? { id: collection.id, name: collection.name } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
});

module.exports = router;

