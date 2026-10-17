const prisma = require("./prisma");

function clampProgress(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function progressFromDeckRows(deckRows) {
  const total = Array.isArray(deckRows) ? deckRows.length : 0;
  if (!total) return null;
  const done = deckRows.filter((row) => row.completed).length;
  return clampProgress((done / total) * 100);
}

function requiredRoundsForTask(task, focusMinutes = 25) {
  const est = Math.max(1, Number(task?.estMinutes) || 25);
  const focus = Math.max(1, Number(focusMinutes) || 25);
  return Math.max(1, Math.ceil(est / focus));
}

function progressFromRounds(task, focusMinutes = 25) {
  const required = requiredRoundsForTask(task, focusMinutes);
  const spent = Math.max(0, Number(task?.pomodorosSpent) || 0);
  return clampProgress((Math.min(spent, required) / required) * 100);
}

async function markTaskCompletedIfNeeded(userId, taskId, wasCompleted) {
  if (wasCompleted) return;
  await prisma.activityLog.create({
    data: { userId, action: "task_completed", meta: { taskId } },
  });
  try {
    const { scheduleDailyChallengeCheck } = require("./dailyChallenge");
    scheduleDailyChallengeCheck(userId);
  } catch {
    // optional
  }
}

/**
 * Recompute task.progress from linked TaskDeck rows.
 * Completes the task when every deck is done; reopens if a deck is unchecked.
 */
async function syncTaskProgressFromDecks(taskId, userId) {
  const rows = await prisma.taskDeck.findMany({ where: { taskId } });
  if (!rows.length) return null;
  const progress = progressFromDeckRows(rows);
  const allDone = progress >= 100;
  const previous = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: { completed: true },
  });
  if (!previous) return null;

  const data = { progress };
  if (allDone && !previous.completed) data.completed = true;
  if (!allDone && previous.completed) data.completed = false;

  await prisma.task.updateMany({
    where: { id: taskId, userId },
    data,
  });

  if (data.completed === true && !previous.completed) {
    await markTaskCompletedIfNeeded(userId, taskId, false);
  }
  const completed =
    typeof data.completed === "boolean" ? data.completed : previous.completed;
  return { progress, completed };
}

/**
 * Mark every incomplete TaskDeck link for this collection as completed,
 * then sync each parent task's progress. Idempotent per link.
 */
async function markCollectionDecksCompletedForUser(userId, collectionId) {
  if (!userId || !collectionId) return { updated: 0, taskIds: [] };
  const links = await prisma.taskDeck.findMany({
    where: {
      collectionId,
      completed: false,
      task: { userId, archived: false },
    },
    select: { id: true, taskId: true },
  });
  if (!links.length) return { updated: 0, taskIds: [] };

  const now = new Date();
  await prisma.taskDeck.updateMany({
    where: { id: { in: links.map((row) => row.id) } },
    data: { completed: true, completedAt: now },
  });

  const taskIds = [...new Set(links.map((row) => row.taskId))];
  for (const taskId of taskIds) {
    await syncTaskProgressFromDecks(taskId, userId);
  }
  return { updated: links.length, taskIds };
}

/**
 * After a focus pomodoro: bump rounds and, for deck-less tasks, update progress / auto-complete.
 * Tasks with decks are never completed by rounds alone.
 */
async function applyFocusRoundToTask(userId, taskId) {
  if (!userId || !taskId) return null;

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: { decks: { select: { id: true } } },
  });
  if (!task) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { focusMinutes: true },
  });

  await prisma.task.updateMany({
    where: { id: taskId, userId },
    data: { pomodorosSpent: { increment: 1 } },
  });

  // Deck-backed tasks: study activities drive completion, not focus rounds.
  if ((task.decks || []).length > 0) {
    return prisma.task.findFirst({ where: { id: taskId, userId } });
  }

  if (task.completed) {
    return prisma.task.findFirst({ where: { id: taskId, userId } });
  }

  const after = await prisma.task.findFirst({ where: { id: taskId, userId } });
  const focusMinutes = user?.focusMinutes ?? 25;
  const required = requiredRoundsForTask(after, focusMinutes);
  const spent = Math.max(0, Number(after?.pomodorosSpent) || 0);
  const progress = progressFromRounds(after, focusMinutes);
  const data = { progress };
  if (spent >= required) data.completed = true;

  await prisma.task.updateMany({
    where: { id: taskId, userId },
    data,
  });

  if (data.completed) {
    await markTaskCompletedIfNeeded(userId, taskId, task.completed);
  }
  return prisma.task.findFirst({ where: { id: taskId, userId } });
}

module.exports = {
  clampProgress,
  progressFromDeckRows,
  progressFromRounds,
  requiredRoundsForTask,
  syncTaskProgressFromDecks,
  markCollectionDecksCompletedForUser,
  applyFocusRoundToTask,
};
