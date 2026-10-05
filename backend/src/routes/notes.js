const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateStudyNotes, generateQuiz } = require("../lib/ai");
const { enforcePromptLimit } = require("../lib/featureLimits");
const { loadUserGamification, heartsDepletedPayload } = require("../lib/gamification");
const { isPremiumActive } = require("../lib/premium");
const { extractTextFromBuffer, clipStudySource, SUPPORTED_FILE_TYPES } = require("../lib/documentText");

const router = express.Router();
router.use(requireAuth);

function getUserFriendlyAiError(err) {
  if (err?.message) return err.message;
  return "AI generation is temporarily unavailable. Please try again in a moment.";
}

function sanitizeNoteBlocks(blocks) {
  return (blocks || []).filter((block) => block?.text && String(block.text).trim());
}

function flattenNoteText(note) {
  const blocks = Array.isArray(note?.contentJson) ? note.contentJson : [];
  const fromBlocks = blocks
    .map((block) => String(block?.text || "").trim())
    .filter(Boolean)
    .join("\n");
  const extras = [
    note?.aiSummary,
    ...(Array.isArray(note?.aiKeyConcepts) ? note.aiKeyConcepts.map((item) => (typeof item === "string" ? item : `${item?.term || ""} ${item?.definition || ""}`.trim())) : []),
    ...(Array.isArray(note?.aiStudyTips) ? note.aiStudyTips : []),
    ...(Array.isArray(note?.aiLearningObjectives) ? note.aiLearningObjectives : []),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
  return [fromBlocks, extras].filter(Boolean).join("\n\n").trim();
}

async function getAccessibleNote(userId, noteId) {
  const note = await prisma.studyNote.findUnique({ where: { id: noteId } });
  if (!note) return null;
  if (note.userId === userId || note.isPublic) return note;
  return null;
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

    const { topic, notes, isPublic, previewOnly, fileName, fileType, base64Content } = req.body;
    let studyTopic = topic && String(topic).trim() ? String(topic).trim() : "";
    let sourceNotes = notes && String(notes).trim() ? String(notes).trim() : "";

    if (base64Content && !sourceNotes) {
      const normalizedType = String(fileType || "pdf").toLowerCase();
      if (!SUPPORTED_FILE_TYPES.includes(normalizedType)) {
        return res.status(400).json({
          error: `Unsupported file type "${fileType}". Supported: ${SUPPORTED_FILE_TYPES.join(", ")}.`,
        });
      }
      const buffer = Buffer.from(String(base64Content), "base64");
      sourceNotes = (await extractTextFromBuffer(normalizedType, buffer)).trim();
      if (!studyTopic) {
        studyTopic = String(fileName || "").replace(/\.[^.]+$/, "").trim();
      }
      if (!sourceNotes && !studyTopic) {
        return res.status(400).json({
          error: "No text could be extracted from that document. Try pasted notes instead.",
        });
      }
    }

    const hasTopic = Boolean(studyTopic);
    const hasNotes = Boolean(sourceNotes);
    if (!hasTopic && !hasNotes) {
      return res.status(400).json({
        error: "Type a topic or paste some notes to generate study notes from.",
      });
    }

    studyTopic = studyTopic || "AI Study Notes";
    const pack = await generateStudyNotes(studyTopic, hasNotes ? clipStudySource(sourceNotes) : "");

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
  const publicScope = String(req.query.scope || "").toLowerCase() === "public";
  const notes = await prisma.studyNote.findMany({
    where: publicScope ? { isPublic: true } : { userId: req.user.id },
    ...(publicScope
      ? { include: { user: { select: { id: true, name: true, profilePicture: true, school: true } } } }
      : {}),
    orderBy: { updatedAt: "desc" },
    take: publicScope ? 80 : undefined,
  });
  res.json({ notes });
});

// Fetch one note (owner always; other students only when public).
router.get("/:id", async (req, res) => {
  const note = await getAccessibleNote(req.user.id, req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found" });

  res.json({ note, isOwner: note.userId === req.user.id });
});

// Quiz from a public (or owned) note.
router.post("/:id/quiz", requireRole("STUDENT"), async (req, res) => {
  try {
    const note = await getAccessibleNote(req.user.id, req.params.id);
    if (!note) return res.status(404).json({ error: "Note not found" });

    const sourceText = flattenNoteText(note);
    if (!sourceText) {
      return res.status(400).json({ error: "This note does not have enough content to quiz." });
    }

    const player = await loadUserGamification(req.user.id);
    if (player && !isPremiumActive(player) && player.hearts <= 0) {
      return res.status(403).json(heartsDepletedPayload(player));
    }

    if (!(await enforcePromptLimit(req, res))) return;

    const pack = await generateQuiz(note.title, sourceText);
    const rawQuestions = Array.isArray(pack.quiz) ? pack.quiz : [];
    const questions = rawQuestions
      .filter((q) => q && q.question && Array.isArray(q.options))
      .map((q) => {
        const opts = q.options.slice(0, 4);
        const answer = opts.includes(q.answer) ? q.answer : opts[0];
        return {
          question: String(q.question).trim(),
          options: opts.map((o) => String(o).trim()),
          answer: String(answer).trim(),
        };
      })
      .slice(0, 10);

    if (questions.length === 0) {
      return res.status(502).json({ error: "The AI didn't return any quiz questions. Please try again." });
    }

    await prisma.activityLog.create({
      data: { userId: req.user.id, action: "note_quiz", meta: { noteId: note.id } },
    });

    res.status(201).json({
      topic: note.title,
      questions: questions.map(({ answer, ...q }) => q),
      answerKey: questions.map((q) => q.answer),
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
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
  if (note.isPublic) {
    const { recordPublicContentActivity } = require("../lib/social");
    recordPublicContentActivity(req.user.id, "note", note).catch(() => {});
  }
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
  if (typeof isPublic === "boolean" && isPublic) {
    const { recordPublicContentActivity } = require("../lib/social");
    recordPublicContentActivity(req.user.id, "note", note).catch(() => {});
  }
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

