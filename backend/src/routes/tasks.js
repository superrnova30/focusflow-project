const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { sanitizeRichTextBlocks } = require("../lib/richTextBlocks");
const {
  buildLimitsPayload,
  loadUserWithLimits,
  countActiveTasks,
  enforceTaskCreationLimit,
  sendLimitResponse,
} = require("../lib/featureLimits");

const router = express.Router();
router.use(requireAuth);

async function taskLimitsForUser(userId) {
  const user = await loadUserWithLimits(userId);
  if (!user) return null;
  const activeTaskCount = await countActiveTasks(userId);
  return buildLimitsPayload(user, { activeTaskCount });
}

router.get("/", async (req, res) => {
  const archived = req.query.archived === "true";
  const tasks = await prisma.task.findMany({
    where: { userId: req.user.id, archived },
    include: { subject: true },
    orderBy: { createdAt: "desc" },
  });
  const limits = await taskLimitsForUser(req.user.id);
  res.json({ tasks, limits });
});

router.post("/", async (req, res) => {
  try {
    await enforceTaskCreationLimit(req.user.id);
  } catch (err) {
    if (err.upgradeRequired) return sendLimitResponse(res, err);
    throw err;
  }

  const { title, subjectId, estMinutes, descriptionJson } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "title is required" });

  if (subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, ownerId: req.user.id },
    });
    if (!subject) return res.status(400).json({ error: "subject not found" });
  }

  const description = sanitizeRichTextBlocks(descriptionJson);

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      descriptionJson: description,
      subjectId,
      estMinutes: estMinutes || 25,
      userId: req.user.id,
    },
    include: { subject: true },
  });
  const limits = await taskLimitsForUser(req.user.id);
  res.status(201).json({ task, limits });
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
  const limits = await taskLimitsForUser(req.user.id);
  res.json({ task: updated, limits });
});

router.post("/:id/restore", async (req, res) => {
  try {
    await enforceTaskCreationLimit(req.user.id);
  } catch (err) {
    if (err.upgradeRequired) {
      return sendLimitResponse(res, {
        ...err,
        message:
          err.message ||
          "Basic plan task limit reached. Archive another task or upgrade to Go Unlimited before restoring this one.",
      });
    }
    throw err;
  }

  const task = await prisma.task.updateMany({
    where: { id: req.params.id, userId: req.user.id, archived: true },
    data: { archived: false, archivedAt: null },
  });

  if (task.count === 0) return res.status(404).json({ error: "Task not found or not archived" });
  const updated = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { subject: true },
  });
  const limits = await taskLimitsForUser(req.user.id);
  res.json({ task: updated, limits });
});

router.patch("/:id", async (req, res) => {
  const allowed = ["title", "completed", "estMinutes", "subjectId", "pomodorosSpent", "descriptionJson"];
  const data = {};
  for (const key of allowed) {
    if (key in req.body) data[key] = req.body[key];
  }
  if ("descriptionJson" in req.body) {
    data.descriptionJson = sanitizeRichTextBlocks(req.body.descriptionJson);
  }

  const previous = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!previous) return res.status(404).json({ error: "Task not found" });

  const result = await prisma.task.updateMany({ where: { id: req.params.id, userId: req.user.id }, data });
  if (result.count === 0) return res.status(404).json({ error: "Task not found" });

  if (data.completed === true && !previous.completed) {
    await prisma.activityLog.create({
      data: { userId: req.user.id, action: "task_completed", meta: { taskId: req.params.id } },
    });
    const { scheduleDailyChallengeCheck } = require("../lib/dailyChallenge");
    scheduleDailyChallengeCheck(req.user.id);
  }

  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { subject: true },
  });
  res.json({ task });
});

router.delete("/:id", async (req, res) => {
  const result = await prisma.task.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
  if (result.count === 0) return res.status(404).json({ error: "Task not found" });
  const limits = await taskLimitsForUser(req.user.id);
  res.json({ ok: true, limits });
});

module.exports = router;
