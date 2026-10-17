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
const {
  clampProgress,
  progressFromDeckRows,
  progressFromRounds,
  requiredRoundsForTask,
  syncTaskProgressFromDecks,
} = require("../lib/taskProgress");

const router = express.Router();
router.use(requireAuth);

const taskInclude = {
  subject: true,
  user: { select: { focusMinutes: true } },
  decks: {
    orderBy: { sortOrder: "asc" },
    include: {
      collection: {
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { flashcards: true } },
        },
      },
    },
  },
};

function studyPercentFromProgress(row, completed) {
  if (completed) return 100;
  if (!row) return 0;
  let score = 0;
  if (row.tutorCompleted) score += 50;
  if ((row.memorizeSessions || 0) > 0) score += 50;
  else if ((row.practiceAnswered || 0) > 0) {
    score = Math.max(score, Math.min(40, Math.round((Number(row.practiceAnswered) / 10) * 40)));
  }
  return Math.min(99, score);
}

function serializeTask(task, studyByCollectionId = null) {
  if (!task) return null;
  const decks = Array.isArray(task.decks)
    ? task.decks
        .map((row) => {
          const c = row.collection;
          if (!c) return null;
          const completed = Boolean(row.completed);
          const study = studyByCollectionId?.get?.(c.id) || null;
          return {
            id: c.id,
            name: c.name,
            color: c.color || "violet",
            cardCount: c._count?.flashcards ?? 0,
            completed,
            completedAt: row.completedAt || null,
            studyPercent: studyPercentFromProgress(study, completed),
            tutorCompleted: Boolean(study?.tutorCompleted),
            memorizeSessions: Number(study?.memorizeSessions) || 0,
            practiceAnswered: Number(study?.practiceAnswered) || 0,
          };
        })
        .filter(Boolean)
    : [];
  const { decks: _omit, user: taskUser, ...rest } = task;
  const focusMinutes = taskUser?.focusMinutes ?? 25;
  const deckProgress = progressFromDeckRows(task.decks);
  const roundsRequired = requiredRoundsForTask(task, focusMinutes);
  const roundsCompleted = Math.max(0, Number(task.pomodorosSpent) || 0);
  const roundProgress = progressFromRounds(task, focusMinutes);
  const progress =
    deckProgress != null
      ? deckProgress
      : task.completed
        ? 100
        : roundProgress;
  const allDecksDone = decks.length > 0 && decks.every((d) => d.completed);
  return {
    ...rest,
    // Keep API progress aligned with completed/total decks; auto-complete at 100%.
    completed: decks.length > 0 ? allDecksDone || Boolean(task.completed) : Boolean(task.completed),
    progress: clampProgress(progress),
    decks,
    roundsRequired,
    roundsCompleted: Math.min(roundsCompleted, roundsRequired),
    progressSource: deckProgress != null ? "decks" : "rounds",
  };
}

async function loadStudyProgressMap(userId, tasksOrTask) {
  const list = Array.isArray(tasksOrTask) ? tasksOrTask : tasksOrTask ? [tasksOrTask] : [];
  const collectionIds = [
    ...new Set(
      list.flatMap((task) =>
        (task?.decks || [])
          .map((row) => row?.collection?.id || row?.collectionId)
          .filter(Boolean)
      )
    ),
  ];
  if (!collectionIds.length) return new Map();
  const rows = await prisma.deckStudyProgress.findMany({
    where: { userId, collectionId: { in: collectionIds } },
  });
  return new Map(rows.map((row) => [row.collectionId, row]));
}

async function taskLimitsForUser(userId) {
  const user = await loadUserWithLimits(userId);
  if (!user) return null;
  const activeTaskCount = await countActiveTasks(userId);
  return buildLimitsPayload(user, { activeTaskCount });
}

async function resolveOwnedCollectionIds(userId, collectionIds) {
  const ids = Array.from(
    new Set(
      (Array.isArray(collectionIds) ? collectionIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  if (!ids.length) return [];
  const owned = await prisma.flashcardCollection.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((row) => row.id));
  // Preserve caller order for selected decks that still exist.
  return ids.filter((id) => ownedSet.has(id));
}

async function replaceTaskDecks(taskId, collectionIds) {
  const existing = await prisma.taskDeck.findMany({ where: { taskId } });
  const prior = new Map(
    existing.map((row) => [
      row.collectionId,
      { completed: Boolean(row.completed), completedAt: row.completedAt || null },
    ])
  );
  await prisma.taskDeck.deleteMany({ where: { taskId } });
  if (!collectionIds.length) return;
  await prisma.taskDeck.createMany({
    data: collectionIds.map((collectionId, index) => {
      const kept = prior.get(collectionId);
      return {
        taskId,
        collectionId,
        sortOrder: index,
        completed: Boolean(kept?.completed),
        completedAt: kept?.completed ? kept.completedAt || new Date() : null,
      };
    }),
  });
}

async function loadTask(taskId, userId) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: taskInclude,
  });
  if (!task) return null;
  const studyMap = await loadStudyProgressMap(userId, task);
  return serializeTask(task, studyMap);
}

router.get("/", async (req, res) => {
  const archived = String(req.query.archived || "").toLowerCase() === "true";
  const tasks = await prisma.task.findMany({
    where: { userId: req.user.id, archived },
    include: taskInclude,
    orderBy: [{ completed: "asc" }, { createdAt: "desc" }],
  });
  const studyMap = await loadStudyProgressMap(req.user.id, tasks);
  const limits = await taskLimitsForUser(req.user.id);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({ tasks: tasks.map((task) => serializeTask(task, studyMap)), limits });
});

router.post("/", async (req, res) => {
  try {
    await enforceTaskCreationLimit(req.user.id);
  } catch (err) {
    if (err.upgradeRequired) return sendLimitResponse(res, err);
    throw err;
  }

  const { title, subjectId, estMinutes, descriptionJson, description, collectionIds, progress } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "title is required" });

  if (subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, ownerId: req.user.id },
    });
    if (!subject) return res.status(400).json({ error: "subject not found" });
  }

  const notes = sanitizeRichTextBlocks(descriptionJson ?? description);
  const deckIds = await resolveOwnedCollectionIds(req.user.id, collectionIds);

  const created = await prisma.task.create({
    data: {
      title: title.trim(),
      descriptionJson: notes,
      subjectId,
      estMinutes: Math.max(1, Number(estMinutes) || 25),
      progress: clampProgress(progress),
      userId: req.user.id,
    },
  });

  await replaceTaskDecks(created.id, deckIds);
  if (deckIds.length) await syncTaskProgressFromDecks(created.id, req.user.id);
  const task = await loadTask(created.id, req.user.id);
  const limits = await taskLimitsForUser(req.user.id);
  res.status(201).json({ task, limits });
});

router.post("/:id/archive", async (req, res) => {
  const result = await prisma.task.updateMany({
    where: { id: req.params.id, userId: req.user.id, archived: false },
    data: { archived: true, archivedAt: new Date() },
  });

  if (result.count === 0) return res.status(404).json({ error: "Task not found or already archived" });
  const task = await loadTask(req.params.id, req.user.id);
  const limits = await taskLimitsForUser(req.user.id);
  res.json({ task, limits });
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

  const result = await prisma.task.updateMany({
    where: { id: req.params.id, userId: req.user.id, archived: true },
    data: { archived: false, archivedAt: null },
  });

  if (result.count === 0) return res.status(404).json({ error: "Task not found or not archived" });
  const task = await loadTask(req.params.id, req.user.id);
  const limits = await taskLimitsForUser(req.user.id);
  res.json({ task, limits });
});

router.patch("/:id/decks/:collectionId", async (req, res) => {
  const taskId = req.params.id;
  const collectionId = String(req.params.collectionId || "").trim();
  if (!collectionId) return res.status(400).json({ error: "collectionId is required" });

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: req.user.id },
    select: { id: true },
  });
  if (!task) return res.status(404).json({ error: "Task not found" });

  const row = await prisma.taskDeck.findFirst({
    where: { taskId, collectionId },
  });
  if (!row) return res.status(404).json({ error: "Deck not linked to this task" });

  const completed = Boolean(req.body.completed);
  if (row.completed === completed) {
    const current = await loadTask(taskId, req.user.id);
    return res.json({ task: current });
  }

  await prisma.taskDeck.update({
    where: { id: row.id },
    data: {
      completed,
      completedAt: completed ? new Date() : null,
    },
  });
  await syncTaskProgressFromDecks(taskId, req.user.id);
  const updated = await loadTask(taskId, req.user.id);
  res.json({ task: updated });
});

router.patch("/:id", async (req, res) => {
  const allowed = ["title", "completed", "estMinutes", "subjectId", "pomodorosSpent", "descriptionJson", "progress"];
  const data = {};
  for (const key of allowed) {
    if (key in req.body) data[key] = req.body[key];
  }
  if ("descriptionJson" in req.body || "description" in req.body) {
    data.descriptionJson = sanitizeRichTextBlocks(
      "descriptionJson" in req.body ? req.body.descriptionJson : req.body.description
    );
  }
  if ("progress" in data) {
    data.progress = clampProgress(data.progress);
  }
  if ("estMinutes" in data) {
    data.estMinutes = Math.max(1, Number(data.estMinutes) || 25);
  }
  // Completing a task bumps progress to 100; un-completing does not wipe progress.
  if (data.completed === true && data.progress == null) {
    data.progress = 100;
  }
  // Reaching 100% progress auto-completes the task (unless explicitly un-completing).
  if (data.progress != null && data.progress >= 100 && data.completed !== false) {
    data.completed = true;
    data.progress = 100;
  }

  const previous = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!previous) return res.status(404).json({ error: "Task not found" });

  if (Object.keys(data).length) {
    const result = await prisma.task.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data,
    });
    if (result.count === 0) return res.status(404).json({ error: "Task not found" });
  }

  if ("collectionIds" in req.body) {
    const deckIds = await resolveOwnedCollectionIds(req.user.id, req.body.collectionIds);
    await replaceTaskDecks(req.params.id, deckIds);
    await syncTaskProgressFromDecks(req.params.id, req.user.id);
  }

  if (data.completed === true && !previous.completed) {
    await prisma.activityLog.create({
      data: { userId: req.user.id, action: "task_completed", meta: { taskId: req.params.id } },
    });
    const { scheduleDailyChallengeCheck } = require("../lib/dailyChallenge");
    scheduleDailyChallengeCheck(req.user.id);
  }

  const task = await loadTask(req.params.id, req.user.id);
  res.json({ task });
});

router.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: "Task not found" });

    await prisma.pomodoroSession.updateMany({
      where: { userId: req.user.id, taskId: req.params.id },
      data: { taskId: null },
    });

    const result = await prisma.task.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (result.count === 0) return res.status(404).json({ error: "Task not found" });
    const limits = await taskLimitsForUser(req.user.id);
    res.json({ ok: true, limits });
  } catch (err) {
    console.error("Failed to delete task:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

module.exports = router;
