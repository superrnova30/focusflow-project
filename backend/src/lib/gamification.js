const prisma = require("./prisma");

/**
 * Shared gamification helpers used by both the auth (login) and game
 * routes so the streak can be bumped from a single place without circular
 * imports.
 */

const LEVEL_XP_STEP = 500;

function levelForXp(xp) {
  return Math.floor(xp / LEVEL_XP_STEP) + 1;
}

function xpWithinLevel(xp) {
  return xp % LEVEL_XP_STEP;
}

function xpForNextLevel(xp) {
  return LEVEL_XP_STEP - (xp % LEVEL_XP_STEP);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Bump the user's daily streak / level based on the current date. */
async function bumpStreak(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const today = todayKey();
  const last = user.lastActiveDate;

  const todayData = {};
  if (last !== today) {
    // If yesterday was active, continue the streak; otherwise reset to 1.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const newStreak = last === yesterday ? user.streakCount + 1 : 1;
    todayData.streakCount = newStreak;
    todayData.longestStreak = Math.max(user.longestStreak, newStreak);
    todayData.lastActiveDate = today;
  }

  const xp = user.xp;
  const newLevel = levelForXp(xp);
  if (newLevel !== user.currentLevel) todayData.currentLevel = newLevel;

  if (Object.keys(todayData).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: todayData });
  }
}

function dayKeyAt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Compute per-day study activity for the calendar dashboard.
 * Aggregates data from existing models (PomodoroSession, QuizAttempt,
 * ActivityLog) plus the user's gamification counters so the calendar is
 * fully connected to the study system.
 *
 * Returns an array of day entries in ascending date order for the month
 * that contains `anchor` (defaults to today). Each entry:
 *   { date, focusMinutes, sessions, quizzes, xpEarned, correct, wrong, active }
 */
async function computeCalendar(userId, anchorDate) {
  // Parse the anchor month (expected "YYYY-MM" or a Date). If invalid, fall
  // back to the current month so the calendar never crashes on bad input.
  let anchor = anchorDate ? new Date(anchorDate) : new Date();
  if (isNaN(anchor.getTime())) anchor = new Date();
  const year = anchor.getFullYear();
  const month = anchor.getMonth(); // 0-based
  const start = new Date(year, month, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month + 1, 1);
  end.setHours(0, 0, 0, 0);

  const focusSessions = await prisma.pomodoroSession.findMany({
    where: { userId, type: "focus", startedAt: { gte: start, lt: end } },
    select: { startedAt: true, minutes: true },
  });

  const quizAttempts = await prisma.quizAttempt.findMany({
    where: { userId, takenAt: { gte: start, lt: end } },
    select: { takenAt: true, score: true, total: true },
  });

  const xpLogs = await prisma.activityLog.findMany({
    where: { userId, action: "xp_gain", createdAt: { gte: start, lt: end } },
    select: { createdAt: true, meta: true },
  });

  const days = new Map();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dayKeyAt(new Date(year, month, d));
    days.set(key, {
      date: key,
      focusMinutes: 0,
      sessions: 0,
      quizzes: 0,
      xpEarned: 0,
      correct: 0,
      wrong: 0,
      active: false,
    });
  }

  const add = (day, patch) => {
    if (!days.has(day)) return;
    const entry = days.get(day);
    Object.keys(patch).forEach((k) => {
      if (typeof patch[k] === "number") entry[k] += patch[k];
      else entry[k] = patch[k];
    });
  };

  focusSessions.forEach((s) => {
    const day = dayKeyAt(s.startedAt);
    add(day, { focusMinutes: s.minutes, sessions: 1, active: true });
  });

  quizAttempts.forEach((a) => {
    const day = dayKeyAt(a.takenAt);
    add(day, { quizzes: 1, correct: a.score, wrong: a.total - a.score, active: true });
  });

  xpLogs.forEach((l) => {
    const day = dayKeyAt(l.createdAt);
    const amount = Number(l.meta && l.meta.amount) || 0;
    add(day, { xpEarned: amount, active: true });
  });

  return Array.from(days.values());
}

module.exports = {
  bumpStreak,
  levelForXp,
  xpWithinLevel,
  xpForNextLevel,
  todayKey,
  computeCalendar,
  LEVEL_XP_STEP,
};

