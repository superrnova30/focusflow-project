const prisma = require("./prisma");
const { isPremiumActive } = require("./premium");

/**
 * Shared gamification helpers used by both the auth (login) and game
 * routes so the streak can be bumped from a single place without circular
 * imports.
 */

const LEVEL_XP_STEP = 500;
const MAX_HEARTS = 5;
const MAX_STREAK_FREEZES = 5;
const HEART_REFILL_MS = 24 * 60 * 60 * 1000;
const STREAK_LEVELS = [
  { key: "starting", name: "Getting started", minDays: 0 },
  { key: "yellow", name: "Spark", minDays: 1 },
  { key: "orange", name: "Momentum", minDays: 10 },
  { key: "red", name: "On fire", minDays: 30 },
  { key: "blue", name: "Unstoppable", minDays: 50 },
  { key: "purple", name: "Elite", minDays: 100 },
  { key: "teal", name: "Legendary", minDays: 200 },
  { key: "gold", name: "Iconic", minDays: 365 },
  { key: "pink", name: "Mythic", minDays: 730 },
  { key: "cyan", name: "Eternal", minDays: 1000 },
];

function normalizeXpAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // Preserve half-EXP awards (e.g. 2.5) without float drift.
  return Math.round(n * 10) / 10;
}

function levelForXp(xp) {
  return Math.floor(Number(xp) / LEVEL_XP_STEP) + 1;
}

function xpWithinLevel(xp) {
  const within = Number(xp) % LEVEL_XP_STEP;
  return Math.round(within * 10) / 10;
}

function xpForNextLevel(xp) {
  const remaining = LEVEL_XP_STEP - (Number(xp) % LEVEL_XP_STEP);
  return Math.round(remaining * 10) / 10;
}

function normalizeTimezone(value) {
  const timezone = String(value || "UTC").trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch (e) {
    return "UTC";
  }
}

function todayKey(timezone = "UTC", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDayKey(day) {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function daysBetweenKeys(from, to) {
  if (!from || !to) return Number.POSITIVE_INFINITY;
  const start = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function getStreakLevel(days) {
  const count = Math.max(0, Number(days) || 0);
  let current = STREAK_LEVELS[0];
  for (const level of STREAK_LEVELS) {
    if (count >= level.minDays) current = level;
  }
  const currentIndex = STREAK_LEVELS.findIndex((level) => level.key === current.key);
  const next = STREAK_LEVELS[currentIndex + 1] || null;
  return {
    ...current,
    levelIndex: currentIndex,
    nextMilestone: next?.minDays || null,
    daysToNext: next ? Math.max(0, next.minDays - count) : 0,
  };
}

/** Bump the user's daily streak / level based on the current date. */
async function bumpStreakOnce(userId, timezoneOverride) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const timezone = normalizeTimezone(timezoneOverride || user.timezone);
    const today = todayKey(timezone);
    const last = user.lastActiveDate;
    const timezoneChanged = user.timezone !== timezone;
    let resultingStreak = user.streakCount;

    const data = {};
    let freezeUsed = 0;
    if (last !== today) {
      const yesterday = previousDayKey(today);
      if (timezoneChanged && last === yesterday) {
        resultingStreak = Math.max(1, user.streakCount);
      } else if (last === yesterday) {
        resultingStreak = user.streakCount + 1;
      } else {
        const missedDays = Math.max(0, daysBetweenKeys(last, today) - 1);
        const availableFreezes = Math.max(0, user.streakFreezes || 0);
        if (missedDays > 0 && availableFreezes >= missedDays) {
          freezeUsed = missedDays;
          resultingStreak = user.streakCount + 1;
          data.streakFreezes = { decrement: missedDays };
        } else {
          resultingStreak = 1;
        }
      }
      data.streakCount = resultingStreak;
      data.longestStreak = Math.max(user.longestStreak, resultingStreak);
      data.lastActiveDate = today;
    }
    if (user.timezone !== timezone) data.timezone = timezone;

    const newLevel = levelForXp(user.xp);
    if (newLevel !== user.currentLevel) data.currentLevel = newLevel;

    const streakLevel = getStreakLevel(resultingStreak);
    const earnedLevels = Math.max(0, streakLevel.levelIndex - user.streakRewardLevel);
    const streakCoinsEarned = earnedLevels * 20;
    if (earnedLevels > 0) {
      data.streakRewardLevel = streakLevel.levelIndex;
      data.coins = { increment: streakCoinsEarned };
    }

    const updated = Object.keys(data).length
      ? await tx.user.update({ where: { id: userId }, data })
      : user;

    if (streakCoinsEarned > 0) {
      await tx.activityLog.create({
        data: {
          userId,
          action: "streak_coins_earned",
          meta: {
            amount: streakCoinsEarned,
            streak: resultingStreak,
            level: streakLevel.key,
            levelsGained: earnedLevels,
          },
        },
      });
    }

    if (freezeUsed > 0) {
      await tx.activityLog.create({
        data: {
          userId,
          action: "streak_freeze_used",
          meta: { used: freezeUsed, streak: resultingStreak },
        },
      });
    }

    return { ...updated, streakCoinsEarned, streakBumped: last !== today, freezeUsed };
  }, { isolationLevel: "Serializable" });
}

async function bumpStreak(userId, timezoneOverride) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await bumpStreakOnce(userId, timezoneOverride);
      if (result?.streakBumped) {
        const { recordStreakActivity } = require("./social");
        recordStreakActivity(userId, result.streakCount, result.lastActiveDate).catch(() => {});
        const { notifyStreakMilestone } = require("./notifications");
        notifyStreakMilestone(userId, result.streakCount).catch(() => {});
      }
      return result;
    } catch (err) {
      if (err.code !== "P2034" || attempt === 2) throw err;
    }
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dayKeyAt(d, timezone = "UTC") {
  return todayKey(timezone, d instanceof Date ? d : new Date(d));
}

function parseMonthAnchor(anchorDate, timezone = "UTC") {
  if (typeof anchorDate === "string") {
    const match = String(anchorDate).match(/^(\d{4})-(\d{2})/);
    if (match) return { year: Number(match[1]), month: Number(match[2]) - 1 };
  }
  if (anchorDate instanceof Date && !isNaN(anchorDate.getTime())) {
    const key = todayKey(timezone, anchorDate);
    return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 };
  }
  const key = todayKey(timezone);
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 };
}

function currentStreakDateSet(lastActiveDate, streakCount) {
  const dates = new Set();
  const count = Math.max(0, Number(streakCount) || 0);
  if (!lastActiveDate || count <= 0) return dates;
  let key = String(lastActiveDate);
  for (let i = 0; i < count; i += 1) {
    dates.add(key);
    key = previousDayKey(key);
  }
  return dates;
}

/**
 * Compute per-day study activity for the calendar dashboard.
 * Aggregates data from existing models (PomodoroSession, QuizAttempt,
 * ActivityLog) plus the user's gamification counters so the calendar is
 * fully connected to the study system.
 *
 * Returns an array of day entries in ascending date order for the month
 * that contains `anchor` (defaults to today). Each entry:
 *   { date, focusMinutes, sessions, quizzes, xpEarned, correct, wrong, active, streak, inCurrentStreak }
 */
async function computeCalendar(userId, anchorDate, options = {}) {
  const timezone = normalizeTimezone(options.timezone);
  const { year, month } = parseMonthAnchor(anchorDate, timezone);
  const monthPrefix = `${year}-${pad2(month + 1)}`;
  const start = new Date(Date.UTC(year, month, 1) - 36 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month + 1, 1) + 36 * 60 * 60 * 1000);

  const [focusSessions, quizAttempts, xpLogs] = await Promise.all([
    prisma.pomodoroSession.findMany({
      where: { userId, type: "focus", startedAt: { gte: start, lt: end } },
      select: { startedAt: true, minutes: true },
    }),
    prisma.quizAttempt.findMany({
      where: { userId, takenAt: { gte: start, lt: end } },
      select: { takenAt: true, score: true, total: true },
    }),
    prisma.activityLog.findMany({
      where: { userId, action: "xp_gain", createdAt: { gte: start, lt: end } },
      select: { createdAt: true, meta: true },
    }),
  ]);

  const days = new Map();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${monthPrefix}-${pad2(d)}`;
    days.set(key, {
      date: key,
      focusMinutes: 0,
      sessions: 0,
      quizzes: 0,
      xpEarned: 0,
      correct: 0,
      wrong: 0,
      active: false,
      streak: false,
      inCurrentStreak: false,
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
    add(dayKeyAt(s.startedAt, timezone), { focusMinutes: s.minutes, sessions: 1, active: true });
  });

  quizAttempts.forEach((a) => {
    add(dayKeyAt(a.takenAt, timezone), { quizzes: 1, correct: a.score, wrong: a.total - a.score, active: true });
  });

  xpLogs.forEach((l) => {
    const amount = Number(l.meta && l.meta.amount) || 0;
    add(dayKeyAt(l.createdAt, timezone), { xpEarned: amount, active: true });
  });

  const streakDates = currentStreakDateSet(options.lastActiveDate, options.streakCount);
  for (const entry of days.values()) {
    const inCurrentStreak = streakDates.has(entry.date);
    entry.inCurrentStreak = inCurrentStreak;
    // Flame days: the live streak window, plus any day with real study activity.
    entry.streak = inCurrentStreak || entry.active;
  }

  return Array.from(days.values());
}

function heartsRefillAtFrom(user) {
  if (!user?.heartsDepletedAt) return null;
  return new Date(new Date(user.heartsDepletedAt).getTime() + HEART_REFILL_MS).toISOString();
}

function heartsDepletedPayload(user, extra = {}) {
  return {
    error: "You are out of hearts. Wait 24 hours for a full refill, or spend 5 coins to revive 1 heart.",
    code: "HEARTS_DEPLETED",
    gameOver: true,
    heartsBlocked: true,
    hearts: 0,
    coins: user?.coins || 0,
    heartsRefillAt: heartsRefillAtFrom(user),
    ...extra,
  };
}

/** Refill hearts after 24h when fully depleted. Returns updated user fields if changed. */
async function syncHeartRefill(user) {
  if (!user || user.hearts > 0 || !user.heartsDepletedAt) return user;
  const elapsed = Date.now() - new Date(user.heartsDepletedAt).getTime();
  if (elapsed < HEART_REFILL_MS) return user;
  return prisma.user.update({
    where: { id: user.id },
    data: { hearts: MAX_HEARTS, heartsDepletedAt: null },
  });
}

/** Go Unlimited subscribers keep a full heart bar and are never locked out. */
async function syncPremiumHearts(user) {
  if (!user || !isPremiumActive(user)) return user;
  if (user.hearts === MAX_HEARTS && !user.heartsDepletedAt) return user;
  return prisma.user.update({
    where: { id: user.id },
    data: { hearts: MAX_HEARTS, heartsDepletedAt: null },
  });
}

async function loadUserGamification(userId) {
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const { syncDailyUsage } = require("./featureLimits");
  user = await syncDailyUsage(user);
  user = await syncHeartRefill(user);
  user = await syncPremiumHearts(user);
  return user;
}

/**
 * Persist a missed-answer heart loss. Basic students lock at 0 for 24h.
 * Go Unlimited subscribers never lose hearts and are never locked out.
 */
async function loseHeart(userId, source = "wrong_answer") {
  let user = await loadUserGamification(userId);
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  const premium = isPremiumActive(user);
  if (premium) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        hearts: MAX_HEARTS,
        heartsDepletedAt: null,
        wrongAnswers: { increment: 1 },
        answerCombo: 0,
      },
    });
    await prisma.activityLog.create({
      data: {
        userId,
        action: "hearts_change",
        meta: { from: user.hearts, to: MAX_HEARTS, source, unlimitedHearts: true },
      },
    });
    return {
      user: updated,
      from: user.hearts,
      hearts: MAX_HEARTS,
      coins: updated.coins || 0,
      gameOver: false,
      heartsBlocked: false,
      heartsRefillAt: null,
      unlimitedHearts: true,
      unlimitedRefill: false,
    };
  }

  if (user.hearts <= 0) {
    const err = new Error(heartsDepletedPayload(user).error);
    err.status = 403;
    err.payload = heartsDepletedPayload(user);
    throw err;
  }

  const from = user.hearts;
  let nextHearts = Math.max(0, from - 1);
  let unlimitedRefill = false;
  const data = {
    hearts: nextHearts,
    wrongAnswers: { increment: 1 },
    answerCombo: 0,
  };

  if (nextHearts <= 0) {
    data.heartsDepletedAt = new Date();
  } else {
    data.heartsDepletedAt = null;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
  });

  await prisma.activityLog.create({
    data: {
      userId,
      action: "hearts_change",
      meta: { from, to: updated.hearts, source, unlimitedRefill },
    },
  });

  const gameOver = !premium && updated.hearts <= 0;
  return {
    user: updated,
    from,
    hearts: updated.hearts,
    coins: updated.coins || 0,
    gameOver,
    heartsBlocked: gameOver,
    heartsRefillAt: gameOver ? heartsRefillAtFrom(updated) : null,
    unlimitedHearts: premium,
    unlimitedRefill,
  };
}

const COMBO_STEP = 2;
const COMBO_COIN_REWARD = 1;
const COMBO_BONUS_XP = 50;

async function awardCorrectAnswer(userId, { baseXp = 0 } = {}) {
  const xpBase = Math.max(0, normalizeXpAmount(baseXp));
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const nextCombo = (user.answerCombo || 0) + 1;
    const comboHit = nextCombo % COMBO_STEP === 0;
    const bonusXp = comboHit ? COMBO_BONUS_XP : 0;
    const coinsEarned = comboHit ? COMBO_COIN_REWARD : 0;
    const xpAwarded = normalizeXpAmount(xpBase + bonusXp);
    const nextXp = normalizeXpAmount((user.xp || 0) + xpAwarded);
    const data = {
      correctAnswers: { increment: 1 },
      answerCombo: nextCombo,
      currentLevel: levelForXp(nextXp),
    };
    if (xpAwarded > 0) {
      data.xp = { increment: xpAwarded };
      data.totalXpEarned = { increment: xpAwarded };
    }
    if (coinsEarned > 0) data.coins = { increment: coinsEarned };
    const row = await tx.user.update({ where: { id: userId }, data });
    if (xpAwarded > 0 || coinsEarned > 0) {
      await tx.activityLog.create({
        data: {
          userId,
          action: comboHit ? "combo_reward" : "xp_gain",
          meta: { baseXp: xpBase, bonusXp, xpAwarded, coinsEarned, combo: nextCombo },
        },
      });
    }
    return { user: row, combo: nextCombo, comboHit, coinsEarned, bonusXp, xpAwarded };
  });
  if (updated?.user) await bumpStreak(userId);
  return updated;
}

async function adjustXp(userId, delta, { action, meta = {}, countCorrect = false } = {}) {
  const amount = normalizeXpAmount(delta);
  if (!amount) return null;
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const nextXp = Math.max(0, normalizeXpAmount((user.xp || 0) + amount));
    const data = {
      xp: nextXp,
      currentLevel: levelForXp(nextXp),
    };
    if (amount > 0) {
      data.totalXpEarned = { increment: amount };
    }
    if (countCorrect) {
      data.correctAnswers = { increment: 1 };
      data.answerCombo = (user.answerCombo || 0) + 1;
    }
    const row = await tx.user.update({ where: { id: userId }, data });
    await tx.activityLog.create({
      data: {
        userId,
        action: action || (amount > 0 ? "xp_gain" : "xp_loss"),
        meta: { amount, ...meta },
      },
    });
    return { user: row, amount };
  });
  return updated;
}

module.exports = {
  bumpStreak,
  normalizeXpAmount,
  levelForXp,
  xpWithinLevel,
  xpForNextLevel,
  todayKey,
  computeCalendar,
  currentStreakDateSet,
  syncHeartRefill,
  loadUserGamification,
  heartsRefillAtFrom,
  heartsDepletedPayload,
  loseHeart,
  awardCorrectAnswer,
  adjustXp,
  COMBO_STEP,
  COMBO_COIN_REWARD,
  COMBO_BONUS_XP,
  LEVEL_XP_STEP,
  MAX_HEARTS,
  MAX_STREAK_FREEZES,
  HEART_REFILL_MS,
  STREAK_LEVELS,
  getStreakLevel,
  normalizeTimezone,
};

