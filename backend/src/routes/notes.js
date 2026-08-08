const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateStudyNotes } = require("../lib/ai");

const router = express.Router();
router.use(requireAuth);

function getUserFriendlyAiError(err) {
  if (err?.message) return err.message;
  return "AI generation is temporarily unavailable. Please try again in a moment.";
}

// ---- Notes CRUD ----

// List the current user's notes (most recently updated first).
router.get("/", async (req, res) => {
  const notes = await prisma.studyNote.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ notes });
});

// Fetch one note.
router.get("/:id", async (req, res) => {
  const note = await prisma.studyNote.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json({ note });
});

// Create a note (manual or AI-sourced content).
router.post("/", requireRole("STUDENT"), async (req, res) => {
  const { title, contentJson, source, aiSummary, aiKeyConcepts, aiImportantTerms, aiStudyTips, aiLearningObjectives } = req.body;
  const trimmedTitle = title && String(title).trim();
  if (!trimmedTitle) return res.status(400).json({ error: "Note title is required." });

  const blocks = Array.isArray(contentJson) ? contentJson : [];
  if (blocks.length === 0) {
    return res.status(400).json({ error: "Note content cannot be empty." });
  }

  const note = await prisma.studyNote.create({
    data: {
      title: trimmedTitle,
      contentJson: blocks,
      source: source === "ai" ? "ai" : "manual",
      aiSummary: aiSummary || null,
      aiKeyConcepts: aiKeyConcepts || undefined,
      aiImportantTerms: aiImportantTerms || undefined,
      aiStudyTips: aiStudyTips || undefined,
      aiLearningObjectives: aiLearningObjectives || undefined,
      userId: req.user.id,
    },
  });
  await prisma.activityLog.create({ data: { userId: req.user.id, action: "create_note" } });
  res.status(201).json({ note });
});

// Update a note (owner only).
router.patch("/:id", async (req, res) => {
  const { title, contentJson } = req.body;
  const data = {};
  if (typeof title === "string" && title.trim()) data.title = title.trim();
  if (Array.isArray(contentJson) && contentJson.length > 0) data.contentJson = contentJson;

  const result = await prisma.studyNote.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data,
  });
  if (result.count === 0) return res.status(404).json({ error: "Note not found" });

  const note = await prisma.studyNote.findUnique({ where: { id: req.params.id } });
  res.json({ note });
});

// Delete a note (owner only).
router.delete("/:id", async (req, res) => {
  const result = await prisma.studyNote.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (result.count === 0) return res.status(404).json({ error: "Note not found" });
  res.json({ ok: true });
});

// ---- Magic Import (AI) ----
// Generate a structured study note from a topic or pasted notes. Returns the
// generated content WITHOUT saving it — the client can preview and then POST
// to /notes to persist it.
router.post("/magic-import", requireRole("STUDENT"), async (req, res) => {
  try {
    const { topic, notes } = req.body;
    const hasTopic = topic && String(topic).trim().length > 0;
    const hasNotes = notes && String(notes).trim().length > 0;
    if (!hasTopic && !hasNotes) {
      return res.status(400).json({
        error: "Type a topic or paste some notes to generate study notes from.",
      });
    }

    const studyTopic = hasTopic ? String(topic).trim() : "General";
    const pack = await generateStudyNotes(studyTopic, hasNotes ? String(notes).trim() : "");

    const contentJson = buildNoteBlocks(pack);

    const result = {
      title: hasTopic ? studyTopic : "AI Study Notes",
      contentJson,
      source: "ai",
      aiSummary: pack.summary || "",
      aiKeyConcepts: pack.keyConcepts || [],
      aiImportantTerms: pack.importantTerms || [],
      aiStudyTips: pack.studyTips || [],
      aiLearningObjectives: pack.learningObjectives || [],
    };

    await prisma.activityLog.create({ data: { userId: req.user.id, action: "magic_import_note" } });

    res.status(201).json({ note: result });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
});

// Convert the AI pack into rich-text blocks for the editor.
function buildNoteBlocks(pack) {
  const blocks = [];
  blocks.push({ type: "heading", level: 2, text: "Lesson Summary" });
  blocks.push({ type: "text", text: pack.summary || "", marks: [] });

  if (Array.isArray(pack.keyConcepts) && pack.keyConcepts.length) {
    blocks.push({ type: "heading", level: 2, text: "Key Concepts" });
    pack.keyConcepts.forEach((c) => blocks.push({ type: "bullet", text: String(c || "") }));
  }

  if (Array.isArray(pack.importantTerms) && pack.importantTerms.length) {
    blocks.push({ type: "heading", level: 2, text: "Important Terms" });
    pack.importantTerms.forEach((t) => {
      blocks.push({ type: "text", text: `**${t.term}** — ${t.definition}`, marks: [] });
    });
  }

  if (Array.isArray(pack.studyTips) && pack.studyTips.length) {
    blocks.push({ type: "heading", level: 2, text: "Study Tips" });
    pack.studyTips.forEach((tip) => blocks.push({ type: "numbered", text: String(tip || "") }));
  }

  if (Array.isArray(pack.learningObjectives) && pack.learningObjectives.length) {
    blocks.push({ type: "heading", level: 2, text: "Learning Objectives" });
    pack.learningObjectives.forEach((obj) => blocks.push({ type: "checklist", checked: false, text: String(obj || "") }));
  }

  return blocks;
}

module.exports = router;

