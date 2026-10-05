const prisma = require("./prisma");
const { todayKey } = require("./gamification");
const { isPremiumActive } = require("./premium");
const { STARTING_HINTS } = require("./memorize");

/** Daily caps for Basic (free) students. Unlimited tier bypasses all of these. */
const BASIC_LIMITS = {
  dailyPrompts: 10,
  dailyChatMessages: 15,
  dailyTutorSessions: 3,
  dailyHints: STARTING_HINTS,
  maxActiveTasks: 5,
};

function buildLimitsPayload(user, { activeTaskCount = null } = {}) {
  const premium = isPremiumActive(user);
  const promptsUsed = user.dailyPromptsUsed || 0;
  const chatUsed = user.dailyChatUsed || 0;
  const tutorUsed = user.dailyTutorUsed || 0;

  return {
    plan: premium ? "unlimited" : "basic",
    isPremium: premium,
    basicLimits: BASIC_LIMITS,
    hearts: { unlimited: premium, max: 5 },
    hints: {
      unlimited: premium,
      daily: premium ? null : BASIC_LIMITS.dailyHints,
      remaining: premium ? null : Math.max(0, (user.hints ?? 0) + (user.bonusHints ?? 0)),
    },
    prompts: {
      unlimited: premium,
      daily: premium ? null : BASIC_LIMITS.dailyPrompts,
      used: promptsUsed,
      remaining: premium ? null : Math.max(0, BASIC_LIMITS.dailyPrompts - promptsUsed),
    },
    chat: {
      unlimited: premium,
      daily: premium ? null : BASIC_LIMITS.dailyChatMessages,
      used: chatUsed,
      remaining: premium ? null : Math.max(0, BASIC_LIMITS.dailyChatMessages - chatUsed),
    },
    tutor: {
      unlimited: premium,
      daily: premium ? null : BASIC_LIMITS.dailyTutorSessions,
      used: tutorUsed,
      remaining: premium ? null : Math.max(0, BASIC_LIMITS.dailyTutorSessions - tutorUsed),
    },
    tasks: {
      unlimited: premium,
      max: premium ? null : BASIC_LIMITS.maxActiveTasks,
      used: activeTaskCount,
      remaining:
        premium || activeTaskCount == null
          ? null
          : Math.max(0, BASIC_LIMITS.maxActiveTasks - activeTaskCount),
    },
  };
}

async function countActiveTasks(userId) {
  return prisma.task.count({
    where: { userId, archived: false },
  });
}

async function enforceTaskCreationLimit(userId) {
  const user = await loadUserWithLimits(userId);
  if (!user) throw makeLimitError("USER_NOT_FOUND", "User not found");
  const activeTaskCount = await countActiveTasks(userId);
  const limits = buildLimitsPayload(user, { activeTaskCount });

  if (isPremiumActive(user)) {
    return { user, limits, activeTaskCount };
  }

  if (activeTaskCount >= BASIC_LIMITS.maxActiveTasks) {
    throw makeLimitError(
      "TASK_LIMIT_EXCEEDED",
      `Basic plan includes up to ${BASIC_LIMITS.maxActiveTasks} active tasks. Archive or delete a task, or upgrade to Go Unlimited for unlimited tasks.`,
      limits
    );
  }

  return { user, limits, activeTaskCount };
}

async function syncDailyUsage(user) {
  if (!user) return user;
  const today = todayKey();
  if (user.dailyUsageDate === today) return user;

  const premium = isPremiumActive(user);
  return prisma.user.update({
    where: { id: user.id },
    data: {
      dailyUsageDate: today,
      dailyPromptsUsed: 0,
      dailyChatUsed: 0,
      dailyTutorUsed: 0,
      hints: premium ? user.hints : BASIC_LIMITS.dailyHints,
    },
  });
}

async function loadUserWithLimits(userId) {
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return syncDailyUsage(user);
}

async function consumeHint(userId) {
  const user = await loadUserWithLimits(userId);
  if (!user) throw makeLimitError("USER_NOT_FOUND", "User not found");
  if (isPremiumActive(user)) {
    return { user, hints: 999, unlimitedHints: true };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const daily = await tx.user.updateMany({
      where: { id: userId, hints: { gt: 0 } },
      data: { hints: { decrement: 1 } },
    });
    if (daily.count === 0) {
      const bonus = await tx.user.updateMany({
        where: { id: userId, bonusHints: { gt: 0 } },
        data: { bonusHints: { decrement: 1 } },
      });
      if (bonus.count === 0) {
        throw makeLimitError("NO_HINTS_REMAINING", "No hints remaining", buildLimitsPayload(user));
      }
    }
    return tx.user.findUnique({ where: { id: userId } });
  });

  return {
    user: updated,
    hints: Math.max(0, updated.hints + updated.bonusHints),
    unlimitedHints: false,
  };
}

function makeLimitError(code, message, limits) {
  const err = new Error(message);
  err.status = 403;
  err.code = code;
  err.limits = limits;
  err.upgradeRequired = true;
  return err;
}

async function consumeAiPrompt(userId) {
  const user = await loadUserWithLimits(userId);
  if (!user) throw makeLimitError("USER_NOT_FOUND", "User not found");
  if (isPremiumActive(user)) return { user, limits: buildLimitsPayload(user) };

  const limits = buildLimitsPayload(user);
  if ((user.dailyPromptsUsed || 0) >= BASIC_LIMITS.dailyPrompts) {
    throw makeLimitError(
      "DAILY_PROMPTS_EXCEEDED",
      `Basic plan includes ${BASIC_LIMITS.dailyPrompts} AI content generations per day. Upgrade to Go Unlimited for unlimited prompts.`,
      limits
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { dailyPromptsUsed: { increment: 1 } },
  });
  return { user: updated, limits: buildLimitsPayload(updated) };
}

async function consumeAiChat(userId) {
  const user = await loadUserWithLimits(userId);
  if (!user) throw makeLimitError("USER_NOT_FOUND", "User not found");
  if (isPremiumActive(user)) return { user, limits: buildLimitsPayload(user) };

  const limits = buildLimitsPayload(user);
  if ((user.dailyChatUsed || 0) >= BASIC_LIMITS.dailyChatMessages) {
    throw makeLimitError(
      "DAILY_CHAT_EXCEEDED",
      `Basic plan includes ${BASIC_LIMITS.dailyChatMessages} AI chat messages per day. Upgrade to Go Unlimited for unlimited tutoring.`,
      limits
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { dailyChatUsed: { increment: 1 } },
  });
  return { user: updated, limits: buildLimitsPayload(updated) };
}

async function consumeAiTutor(userId) {
  const user = await loadUserWithLimits(userId);
  if (!user) throw makeLimitError("USER_NOT_FOUND", "User not found");
  if (isPremiumActive(user)) return { user, limits: buildLimitsPayload(user) };

  const limits = buildLimitsPayload(user);
  if ((user.dailyTutorUsed || 0) >= BASIC_LIMITS.dailyTutorSessions) {
    throw makeLimitError(
      "DAILY_TUTOR_EXCEEDED",
      `Basic plan includes ${BASIC_LIMITS.dailyTutorSessions} AI tutor sessions per day. Upgrade to Go Unlimited for unlimited AI tutoring.`,
      limits
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { dailyTutorUsed: { increment: 1 } },
  });
  return { user: updated, limits: buildLimitsPayload(updated) };
}

function sendLimitResponse(res, err) {
  return res.status(err.status || 403).json({
    error: err.message,
    code: err.code,
    upgradeRequired: true,
    limits: err.limits,
  });
}

async function withFeatureLimit(res, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code && err.upgradeRequired) return sendLimitResponse(res, err);
    throw err;
  }
}

async function enforcePromptLimit(req, res) {
  try {
    return await consumeAiPrompt(req.user.id);
  } catch (limitErr) {
    if (limitErr.upgradeRequired) {
      sendLimitResponse(res, limitErr);
      return null;
    }
    throw limitErr;
  }
}

async function enforceChatLimit(req, res) {
  try {
    return await consumeAiChat(req.user.id);
  } catch (limitErr) {
    if (limitErr.upgradeRequired) {
      sendLimitResponse(res, limitErr);
      return null;
    }
    throw limitErr;
  }
}

async function enforceTutorLimit(req, res) {
  try {
    return await consumeAiTutor(req.user.id);
  } catch (limitErr) {
    if (limitErr.upgradeRequired) {
      sendLimitResponse(res, limitErr);
      return null;
    }
    throw limitErr;
  }
}

module.exports = {
  BASIC_LIMITS,
  buildLimitsPayload,
  syncDailyUsage,
  loadUserWithLimits,
  consumeHint,
  countActiveTasks,
  enforceTaskCreationLimit,
  consumeAiPrompt,
  consumeAiChat,
  consumeAiTutor,
  sendLimitResponse,
  withFeatureLimit,
  enforcePromptLimit,
  enforceChatLimit,
  enforceTutorLimit,
};
