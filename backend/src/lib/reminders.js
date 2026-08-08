const prisma = require("./prisma");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Send an Expo push notification to one or more device tokens.
 * Expires tokens are returned for cleanup.
 */
async function sendExpoPush(tokens, { title, body, data = {}, badge = 1, sound = "chime" }) {
  const unique = [...new Set(tokens)].filter(Boolean);
  if (unique.length === 0) return { ok: false, error: "No tokens" };

  const messages = unique.map((to) => ({
    to,
    title,
    body,
    data,
    sound,
    badge,
    priority: "high",
    channelId: "daily-reminder",
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(messages),
    });
    const json = await res.json();

    // Collect tokens that fail with a permanent error (device unregistered).
    const failedTokens = [];
    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((receipt, i) => {
        if (receipt && receipt.status === "error" && messages[i]) {
          const status = (receipt.details && receipt.details.error) || "";
          if (status.includes("DeviceNotRegistered") || status.includes("MessageTooBig") === false) {
            failedTokens.push(messages[i].to);
          }
        }
      });
    }

    if (failedTokens.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: failedTokens } } });
    }

    return { ok: true, json, failedTokens };
  } catch (err) {
    console.error("Expo push send failed:", err.message);
    return { ok: false, error: err.message };
  }
}

/** Build today's "YYYY-MM-DD" in UTC. */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Send daily study reminders to all users who have reminders enabled and
 * at least one registered push token. Called by the scheduler.
 */
async function sendDailyReminders() {
  const users = await prisma.user.findMany({
    where: { remindersEnabled: true, deviceTokens: { some: {} } },
    include: { deviceTokens: { select: { token: true } } },
  });

  let sent = 0;
  for (const user of users) {
    const tokens = user.deviceTokens.map((d) => d.token);
    const message = buildReminderMessage(user);
    const result = await sendExpoPush(tokens, message);
    if (result.ok) sent += tokens.length;
  }
  return { checked: users.length, sent };
}

function buildReminderMessage(user) {
  const streak = user.streakCount || 0;
  const parts = [];
  if (streak > 0) parts.push(`You're on a ${streak}-day streak 🔥`);
  parts.push("Time for today's study session!");
  return {
    title: "📚 FocusFlow study reminder",
    body: parts.join(" "),
    data: { type: "daily_reminder" },
  };
}

module.exports = {
  sendExpoPush,
  sendDailyReminders,
  todayKey,
};

