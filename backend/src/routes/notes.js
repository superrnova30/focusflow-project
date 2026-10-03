const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateStudyNotes } = require("../lib/ai");
const { enforcePromptLimit } = require("../lib/featureLimits");

const router = express.Router();
router.use(requireAuth);

function getUserFriendlyAiError(err) {
  if (err?.message) return err.message;
  return "AI generation is temporarily unavailable. Please try again in a moment.";
}

function sanitizeNoteBlocks(blocks) {
  return (blocks || []).filter((block) => block?.text && String(block.text).trim());
}

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
      if (typeof t === "string") {
        blocks.push({ type: "text", text: t, marks: [] });
        return;
      }
      const term = t?.term ? String(t.term) : "Key term";
      const definition = t?.definition ? String(t.definition) : "";
      blocks.push({ type: "text", text: `**${term}** — ${definition}`, marks: [] });
    });
  }

  if (Array.isArray(pack.studyTips) && pack.studyTips.length) {
    blocks.push({ type: "heading", level: 2, text: "Study Tips" });
    pack.studyTips.forEach((tip) => blocks.push({ type: "numbered", text: String(tip || "") }));
  }

  if (Array.isArray(pack.learningObjectives) && pack.learningObjectives.length) {
    blocks.push({ type: "heading", level: 2, text: "Learning Objectives" });
    pack.learningObjectives.forEach((obj) =>
      blocks.push({ type: "checklist", checked: false, text: String(obj || "") })
    );
  }

  return blocks;
}

// ---- Magic Import (AI) ----
// Generates structured study notes and saves them to the student's library.
// Registered before /:id so the path is never mistaken for a note id.
router.post("/magic-import", requireRole("STUDENT"), async (req, res) => {
  try {
    if (!(await enforcePromptLimit(req, res))) return;

    const { topic, notes, isPublic, previewOnly } = req.body;
    const hasTopic = topic && String(topic).trim().length > 0;
    const hasNotes = notes && String(notes).trim().length > 0;
    if (!hasTopic && !hasNotes) {
      return res.status(400).json({
        error: "Type a topic or paste some notes to generate study notes from.",
      });
    }

    const studyTopic = hasTopic ? String(topic).trim() : "AI Study Notes";
    const pack = await generateStudyNotes(studyTopic, hasNotes ? String(notes).trim() : "");

    const contentJson = sanitizeNoteBlocks(buildNoteBlocks(pack));
    if (contentJson.length === 0) {
      return res.status(502).json({ error: "The AI did not return usable note content. Please try again." });
    }

    const draft = {
      title: hasTopic ? studyTopic : "AI Study Notes",
      contentJson,
      source: "ai",
      aiSummary: pack.summary || "",
      aiKeyConcepts: pack.keyConcepts || [],
      aiImportantTerms: pack.importantTerms || [],
      aiStudyTips: pack.studyTips || [],
      aiLearningObjectives: pack.learningObjectives || [],
      isPublic: Boolean(isPublic),
    };

    if (previewOnly) {
      return res.status(201).json({ note: draft, saved: false });
    }

    const note = await prisma.studyNote.create({
      data: {
        title: draft.title,
        contentJson: draft.contentJson,
        source: "ai",
        aiSummary: draft.aiSummary || null,
        aiKeyConcepts: draft.aiKeyConcepts || undefined,
        aiImportantTerms: draft.aiImportantTerms || undefined,
        aiStudyTips: draft.aiStudyTips || undefined,
        aiLearningObjectives: draft.aiLearningObjectives || undefined,
        isPublic: draft.isPublic,
        userId: req.user.id,
      },
    });

    await prisma.activityLog.create({ data: { userId: req.user.id, action: "magic_import_note" } });

    res.status(201).json({
      note,
      saved: true,
      message: "Your notes have been generated and added to Your Notes.",
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
});

// ---- Notes CRUD ----

// List the current user's notes (most recently updated first).
router.get("/", async (req, res) => {
  const notes = await prisma.studyNote.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ notes });
});

// Fetch one note (owner always; other students only when public).
router.get("/:id", async (req, res) => {
  const note = await prisma.studyNote.findUnique({ where: { id: req.params.id } });
  if (!note) return res.status(404).json({ error: "Note not found" });

  const isOwner = note.userId === req.user.id;
  if (!isOwner && !note.isPublic) {
    return res.status(404).json({ error: "Note not found" });
  }

  res.json({ note, isOwner });
});

// Create a note (manual or AI-sourced content).
router.post("/", requireRole("STUDENT"), async (req, res) => {
  const {
    title,
    contentJson,
    source,
    isPublic,
    aiSummary,
    aiKeyConcepts,
    aiImportantTerms,
    aiStudyTips,
    aiLearningObjectives,
  } = req.body;
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
      isPublic: Boolean(isPublic),
      userId: req.user.id,
    },
  });
  await prisma.activityLog.create({ data: { userId: req.user.id, action: "create_note" } });
  res.status(201).json({ note });
});

// Update a note (owner only).
router.patch("/:id", async (req, res) => {
  const { title, contentJson, isPublic } = req.body;
  const data = {};
  if (typeof title === "string" && title.trim()) data.title = title.trim();
  if (Array.isArray(contentJson) && contentJson.length > 0) data.contentJson = contentJson;
  if (typeof isPublic === "boolean") data.isPublic = isPublic;

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

module.exports = router;

