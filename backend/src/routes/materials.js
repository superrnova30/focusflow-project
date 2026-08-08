 const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateStudyPack, generateCoachInsight } = require("../lib/ai");

// Real PDF text extraction. Uses pdf-parse (already a dependency) to pull
// text out of an uploaded PDF buffer so uploaded documents are actually
// analyzed rather than stubbed.
async function parsePdf(buffer) {
  try {
    const pdf = require("pdf-parse");
    const result = await pdf(buffer);
    return { text: (result && result.text) || "" };
  } catch (err) {
    console.error("PDF parsing failed:", err.message);
    return { text: "" };
  }
}

// Extract text from a Word (.docx) document using mammoth.
async function parseDocx(buffer) {
  try {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: (result && result.value) || "" };
  } catch (err) {
    console.error("DOCX parsing failed:", err.message);
    return { text: "" };
  }
}

// Extract text from a PowerPoint (.pptx) / Excel (.xlsx) file using
// officeparser (handles the whole Office Open XML family).
async function parseOffice(buffer) {
  try {
    const officeParser = require("officeparser");
    // officeparser accepts a Buffer and returns a plain-text string.
    const text = await officeParser.parseOfficeAsync(buffer);
    return { text: text || "" };
  } catch (err) {
    console.error("Office parsing failed:", err.message);
    return { text: "" };
  }
}

// Dispatch parsing based on the file type. Returns extracted plain text.
async function extractTextFromBuffer(fileType, buffer) {
  switch ((fileType || "pdf").toLowerCase()) {
    case "docx":
      return (await parseDocx(buffer)).text;
    case "pptx":
    case "xlsx":
      return (await parseOffice(buffer)).text;
    default:
      return (await parsePdf(buffer)).text;
  }
}

const SUPPORTED_FILE_TYPES = ["pdf", "docx", "pptx", "xlsx"];

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

function getUserFriendlyAiError(err) {
  if (err?.message) {
    return err.message;
  }
  return "AI generation is temporarily unavailable. Please try again in a moment.";
}

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function saveUploadBuffer(base64Content, fileName) {
  ensureUploadDir();
  const safeName = fileName && fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "document.bin";
  const storedName = `${crypto.randomBytes(8).toString("hex")}_${safeName}`;
  const filePath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(filePath, Buffer.from(base64Content, "base64"));
  return `/uploads/${storedName}`;
}

const router = express.Router();
router.use(requireAuth);

// Build the study-tips array from aiKeyConcepts (TIP: prefixed entries).
function extractStudyTips(material) {
  const tips = Array.isArray(material.aiKeyConcepts)
    ? material.aiKeyConcepts.filter((item) => typeof item === "string" && item.startsWith("TIP:"))
    : [];
  return tips.map((item) => item.replace(/^TIP:\s*/, ""));
}

// List materials the current user uploaded (ownership is uploadedById
// regardless of role)
router.get("/", async (req, res) => {
  const archived = req.query.archived === "true";
  const materials = await prisma.studyMaterial.findMany({
    where: { uploadedById: req.user.id, archived },
    include: { flashcards: true, quizzes: { include: { questions: true } }, subject: true },
    orderBy: { createdAt: "desc" },
  });

  const shaped = materials.map((material) => ({
    ...material,
    studyTips: extractStudyTips(material),
  }));

  res.json({ materials: shaped });
});

// Fetch a single material with full detail.
router.get("/:id", async (req, res) => {
  const material = await prisma.studyMaterial.findFirst({
    where: { id: req.params.id, uploadedById: req.user.id },
    include: { flashcards: true, quizzes: { include: { questions: true } }, subject: true },
  });
  if (!material) return res.status(404).json({ error: "Material not found" });
  res.json({ material: { ...material, studyTips: extractStudyTips(material) } });
});

// Generate a study pack from pasted notes. Students can create materials
// to study from (quiz assign/publish remains an Admin capability).
router.post("/generate", requireRole("STUDENT"), async (req, res) => {
  try {
    const { title, subjectId, subjectName, fileType, rawText, topic } = req.body;
    // Topic-based generation: a student can type any topic/question and get
    // a full study pack, even without pasted notes.
    const hasTopic = topic && String(topic).trim().length > 0;
    const hasNotes = rawText && String(rawText).trim().length > 0;
    if (!hasTopic && !hasNotes) {
      return res.status(400).json({ error: "Please type a topic or paste some notes before generating a study pack." });
    }

    const studyTopic = subjectName || (hasTopic ? topic : "General");
    const notes = hasNotes ? rawText : "";
    const pack = await generateStudyPack(studyTopic, notes);
    const studyTips = Array.isArray(pack.studyTips) ? pack.studyTips : [];
    const aiKeyConcepts = [...(pack.keyConcepts || []), ...studyTips.map((tip) => `TIP: ${tip}`)];

    const material = await prisma.studyMaterial.create({
      data: {
        title: title || subjectName || "Untitled set",
        subjectId: subjectId || null,
        uploadedById: req.user.id,
        fileType: fileType || "txt",
        rawText,
        aiSummary: pack.summary,
        aiKeyConcepts,
        aiLearningObjectives: pack.learningObjectives || null,
        aiImportantTerms: pack.importantTerms || null,
        aiShortAnswer: pack.shortAnswer || null,
        aiPracticeQuestions: pack.practiceQuestions || null,
        flashcards: { create: (pack.flashcards || []).map((f) => ({ front: f.front, back: f.back })) },
        quizzes: {
          create: {
            title: title || subjectName || "Untitled quiz",
            createdById: req.user.id,
            isPublished: true,
            questions: {
              create: (pack.quiz || []).map((q, i) => ({
                type: q.type,
                question: q.question,
                options: q.options || null,
                answer: q.answer,
                order: i,
              })),
            },
          },
        },
      },
      include: { flashcards: true, quizzes: { include: { questions: true } } },
    });

    await prisma.activityLog.create({ data: { userId: req.user.id, action: "upload" } });

    res.status(201).json({ material: { ...material, studyTips } });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
});

// Upload a document (PDF, DOCX, PPTX, XLSX), extract its text, and generate
// a study pack from its content. Kept as `/upload-pdf` for backward
// compatibility with existing mobile builds; also available as
// `/upload-document`.
async function handleUpload(req, res) {
  try {
    const { title, subjectId, subjectName, fileName, fileType, base64Content, rawText } = req.body;
    if (!base64Content && !rawText?.trim()) {
      return res.status(400).json({ error: "Please provide a document file or extracted text before uploading." });
    }
    const normalizedType = (fileType || "pdf").toLowerCase();
    if (!SUPPORTED_FILE_TYPES.includes(normalizedType)) {
      return res.status(400).json({ error: `Unsupported file type "${fileType}". Supported: ${SUPPORTED_FILE_TYPES.join(", ")}.` });
    }

    let extractedText = rawText?.trim() || "";
    let fileUrl = null;
    if (base64Content && !extractedText) {
      const buffer = Buffer.from(base64Content, "base64");
      extractedText = await extractTextFromBuffer(normalizedType, buffer);
      fileUrl = saveUploadBuffer(base64Content, fileName || `document.${normalizedType}`);
    }

    // If extraction produced nothing, fall back to a helpful message and
    // still let the AI generate a pack from the file metadata.
    const contentForAi = extractedText || `Uploaded document: ${fileName || normalizedType.toUpperCase()}`;
    const pack = await generateStudyPack(subjectName || `Uploaded ${normalizedType.toUpperCase()}`, contentForAi);
    const studyTips = Array.isArray(pack.studyTips) ? pack.studyTips : [];
    const aiKeyConcepts = [...(pack.keyConcepts || []), ...studyTips.map((tip) => `TIP: ${tip}`)];

    const material = await prisma.studyMaterial.create({
      data: {
        title: title || subjectName || fileName || `Uploaded ${normalizedType.toUpperCase()} study pack`,
        subjectId: subjectId || null,
        uploadedById: req.user.id,
        fileType: normalizedType,
        fileUrl,
        rawText: extractedText || `Uploaded ${normalizedType.toUpperCase()} file: ${fileName || `document.${normalizedType}`}`,
        aiSummary: pack.summary,
        aiKeyConcepts,
        aiLearningObjectives: pack.learningObjectives || null,
        aiImportantTerms: pack.importantTerms || null,
        aiShortAnswer: pack.shortAnswer || null,
        aiPracticeQuestions: pack.practiceQuestions || null,
        flashcards: { create: (pack.flashcards || []).map((f) => ({ front: f.front, back: f.back })) },
        quizzes: {
          create: {
            title: title || subjectName || fileName || `Uploaded ${normalizedType.toUpperCase()} quiz`,
            createdById: req.user.id,
            isPublished: true,
            questions: {
              create: (pack.quiz || []).map((q, i) => ({
                type: q.type,
                question: q.question,
                options: q.options || null,
                answer: q.answer,
                order: i,
              })),
            },
          },
        },
      },
      include: { flashcards: true, quizzes: { include: { questions: true } } },
    });

    await prisma.activityLog.create({ data: { userId: req.user.id, action: "upload_document", meta: { fileType: normalizedType } } });

    res.status(201).json({ material: { ...material, studyTips, uploadedFileName: fileName || null } });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
}

router.post("/upload-pdf", requireRole("STUDENT"), handleUpload);
router.post("/upload-document", requireRole("STUDENT"), handleUpload);

// Edit a material's title/subject.
router.patch("/:id", async (req, res) => {
  const { title, subjectId } = req.body;
  const data = {};
  if (typeof title === "string") data.title = title;
  if (typeof subjectId === "string") data.subjectId = subjectId;

  const result = await prisma.studyMaterial.updateMany({
    where: { id: req.params.id, uploadedById: req.user.id },
    data,
  });
  if (result.count === 0) return res.status(404).json({ error: "Material not found" });

  const material = await prisma.studyMaterial.findFirst({
    where: { id: req.params.id, uploadedById: req.user.id },
    include: { flashcards: true, quizzes: { include: { questions: true } }, subject: true },
  });
  res.json({ material: { ...material, studyTips: extractStudyTips(material) } });
});

// Regenerate the AI study pack from the stored rawText.
router.post("/:id/regenerate", async (req, res) => {
  try {
    const existing = await prisma.studyMaterial.findFirst({
      where: { id: req.params.id, uploadedById: req.user.id },
      include: { flashcards: true, quizzes: { include: { questions: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Material not found" });
    if (!existing.rawText?.trim()) {
      return res.status(400).json({ error: "This material has no source text to regenerate from." });
    }

    const pack = await generateStudyPack(existing.title, existing.rawText);
    const studyTips = Array.isArray(pack.studyTips) ? pack.studyTips : [];
    const aiKeyConcepts = [...(pack.keyConcepts || []), ...studyTips.map((tip) => `TIP: ${tip}`)];

    // Delete old flashcards & quiz questions, then recreate.
    await prisma.flashcard.deleteMany({ where: { materialId: existing.id } });
    if (existing.quizzes.length) {
      await prisma.quizQuestion.deleteMany({ where: { quizId: { in: existing.quizzes.map((q) => q.id) } } });
    }

    const material = await prisma.studyMaterial.update({
      where: { id: existing.id },
      data: {
        aiSummary: pack.summary,
        aiKeyConcepts,
        aiLearningObjectives: pack.learningObjectives || null,
        aiImportantTerms: pack.importantTerms || null,
        aiShortAnswer: pack.shortAnswer || null,
        aiPracticeQuestions: pack.practiceQuestions || null,
        flashcards: { create: (pack.flashcards || []).map((f) => ({ front: f.front, back: f.back })) },
        quizzes: {
          updateMany: existing.quizzes.map((quizItem) => ({
            where: { id: quizItem.id },
            data: {
              questions: {
                create: (pack.quiz || []).map((q, i) => ({
                  type: q.type,
                  question: q.question,
                  options: q.options || null,
                  answer: q.answer,
                  order: i,
                })),
              },
            },
          })),
        },
      },
      include: { flashcards: true, quizzes: { include: { questions: true } } },
    });

    await prisma.activityLog.create({ data: { userId: req.user.id, action: "regenerate" } });

    res.json({ material: { ...material, studyTips } });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
});

router.post("/:id/archive", async (req, res) => {
  const result = await prisma.studyMaterial.updateMany({
    where: { id: req.params.id, uploadedById: req.user.id },
    data: { archived: true },
  });
  if (result.count === 0) return res.status(404).json({ error: "Material not found" });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req, res) => {
  const result = await prisma.studyMaterial.updateMany({
    where: { id: req.params.id, uploadedById: req.user.id },
    data: { archived: false },
  });
  if (result.count === 0) return res.status(404).json({ error: "Material not found" });
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const result = await prisma.studyMaterial.deleteMany({ where: { id: req.params.id, uploadedById: req.user.id } });
  if (result.count === 0) return res.status(404).json({ error: "Material not found" });
  res.json({ ok: true });
});

// AI study coach — analyzes the student's own recent activity
router.post("/coach", requireRole("STUDENT"), async (req, res) => {
  try {
    const insight = await generateCoachInsight(req.body);
    res.json({ insight });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: getUserFriendlyAiError(err) });
  }
});

module.exports = router;
