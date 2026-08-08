const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const archived = req.query.archived === "true";
  const tasks = await prisma.task.findMany({
    where: { userId: req.user.id, archived },
    include: { subject: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ tasks });
});

router.post("/", async (req, res) => {
  const { title, subjectId, estMinutes } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "title is required" });

  // If a subjectId is provided, verify it belongs to this user.
  if (subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, ownerId: req.user.id },
    });
    if (!subject) return res.status(400).json({ error: "subject not found" });
  }

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      subjectId,
      estMinutes: estMinutes || 25,
      userId: req.user.id,
    },
    include: { subject: true },
  });
  res.status(201).json({ task });
});

router.post("/:id/archive", async (req, res) => {
  const task = await prisma.task.updateMany({
    where: { id: req.params.id, userId: req.user.id, archived: false },
    data: { archived: true, archivedAt: new Date() },
  });

  if (task.count === 0) return res.status(404).json({ error: "Task not found or already archived" });
  const updated = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { subject: true },
  });
  res.json({ task: updated });
});

router.post("/:id/restore", async (req, res) => {
  const task = await prisma.task.updateMany({
    where: { id: req.params.id, userId: req.user.id, archived: true },
    data: { archived: false, archivedAt: null },
  });

  if (task.count === 0) return res.status(404).json({ error: "Task not found or not archived" });
  const updated = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { subject: true },
  });
  res.json({ task: updated });
});

router.patch("/:id", async (req, res) => {
  const allowed = ["title", "completed", "estMinutes", "subjectId", "pomodorosSpent"];
  const data = {};
  for (const key of allowed) if (key in req.body) data[key] = req.body[key];

  const result = await prisma.task.updateMany({ where: { id: req.params.id, userId: req.user.id }, data });
  if (result.count === 0) return res.status(404).json({ error: "Task not found" });
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  res.json({ task });
});

router.delete("/:id", async (req, res) => {
  const result = await prisma.task.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
  if (result.count === 0) return res.status(404).json({ error: "Task not found" });
  res.json({ ok: true });
});

module.exports = router;
