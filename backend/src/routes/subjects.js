const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const archived = req.query.archived === "true";
  const subjects = await prisma.subject.findMany({
    where: { ownerId: req.user.id, archived },
    orderBy: { createdAt: "desc" },
  });
  res.json({ subjects });
});

router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });
  const subject = await prisma.subject.create({ data: { name: name.trim(), ownerId: req.user.id } });
  res.status(201).json({ subject });
});

router.post("/:id/archive", async (req, res) => {
  const subject = await prisma.subject.updateMany({
    where: { id: req.params.id, ownerId: req.user.id },
    data: { archived: true, archivedAt: new Date() },
  });
  if (subject.count === 0) return res.status(404).json({ error: "Subject not found" });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req, res) => {
  const subject = await prisma.subject.updateMany({
    where: { id: req.params.id, ownerId: req.user.id },
    data: { archived: false, archivedAt: null },
  });
  if (subject.count === 0) return res.status(404).json({ error: "Subject not found" });
  res.json({ ok: true });
});

// Permanent delete — only allowed once already archived, and only cascades
// to that subject's own tasks/sessions/materials (Prisma relations handle
// the cascade via onDelete rules where applicable).
router.delete("/:id", async (req, res) => {
  const subject = await prisma.subject.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  if (!subject.archived) return res.status(400).json({ error: "Archive the subject before permanently deleting it" });

  await prisma.$transaction([
    prisma.task.deleteMany({ where: { subjectId: subject.id } }),
    prisma.pomodoroSession.deleteMany({ where: { subjectId: subject.id } }),
    prisma.studyMaterial.deleteMany({ where: { subjectId: subject.id } }),
    prisma.subject.delete({ where: { id: subject.id } }),
  ]);

  res.json({ ok: true });
});

module.exports = router;
