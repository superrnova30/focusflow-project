const prisma = require("./prisma");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_BATCH_SIZE = 100;
const EXPO_TOKEN_PATTERN = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function expoRequest(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.errors?.[0]?.message || `Expo push service returned HTTP ${response.status}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function removeUnregisteredTokens(tokens) {
  if (!tokens.length) return;
  await prisma.deviceToken.deleteMany({ where: { token: { in: [...new Set(tokens)] } } });
}

async function checkExpoReceipts(ticketEntries) {
  if (!ticketEntries.length) return;
  try {
    const ticketMap = new Map(ticketEntries.map((entry) => [entry.id, entry.token]));
    const json = await expoRequest(EXPO_RECEIPTS_URL, { ids: [...ticketMap.keys()] });
    const unregistered = [];
    Object.entries(json.data || {}).forEach(([id, receipt]) => {
      if (receipt?.status === "error") {
        console.warn("Expo push receipt error:", receipt.message || receipt.details?.error || "Unknown receipt error");
        if (receipt.details?.error === "DeviceNotRegistered") {
          const token = ticketMap.get(id);
          if (token) unregistered.push(token);
        }
      }
    });
    await removeUnregisteredTokens(unregistered);
  } catch (err) {
    console.warn("Expo receipt check failed:", err.message || err);
  }
}

/**
 * Send an Expo push notification to one or more device tokens.
 * Expires tokens are returned for cleanup.
 */
async function sendExpoPush(tokens, { title, body, data = {}, badge = 1, sound = "default" }) {
  const unique = [...new Set(tokens)].filter((token) => EXPO_TOKEN_PATTERN.test(String(token)));
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
    const acceptedTokens = [];
    const failedTokens = [];
    const ticketEntries = [];

    for (const batch of chunks(messages, EXPO_BATCH_SIZE)) {
      const json = await expoRequest(EXPO_PUSH_URL, batch);
      const tickets = Array.isArray(json.data) ? json.data : [];
      tickets.forEach((ticket, index) => {
        const token = batch[index]?.to;
        if (!token) return;
        if (ticket?.status === "ok") {
          acceptedTokens.push(token);
          if (ticket.id) ticketEntries.push({ id: ticket.id, token });
        } else {
          console.warn("Expo rejected push ticket:", ticket?.message || ticket?.details?.error || "Unknown ticket error");
          if (ticket?.details?.error === "DeviceNotRegistered") failedTokens.push(token);
        }
      });
    }

    await removeUnregisteredTokens(failedTokens);

    // Delivery receipts are asynchronous. Check shortly after Expo accepts the
    // tickets and clean up devices that have uninstalled the app.
    if (ticketEntries.length) {
      const receiptTimer = setTimeout(() => {
        checkExpoReceipts(ticketEntries);
      }, 15000);
      receiptTimer.unref?.();
    }

    return {
      ok: acceptedTokens.length > 0,
      accepted: acceptedTokens.length,
      rejected: messages.length - acceptedTokens.length,
      acceptedTokens,
      failedTokens,
    };
  } catch (err) {
    console.error("Expo push send failed:", err.message);
    return { ok: false, error: err.message, accepted: 0, rejected: messages.length };
  }
}

function localDateTime(now, timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      time: `${values.hour}:${values.minute}`,
    };
  } catch (e) {
    return localDateTime(now, "UTC");
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
    include: {
      deviceTokens: {
        select: { token: true, timezone: true, lastReminderKey: true },
      },
    },
  });

  const now = new Date();
  let sent = 0;
  let due = 0;
  for (const user of users) {
    const dueDevices = user.deviceTokens.filter((device) => {
      const local = localDateTime(now, device.timezone);
      const reminderKey = `${device.timezone}:${local.date}:${user.reminderTime}`;
      return local.time === user.reminderTime && device.lastReminderKey !== reminderKey;
    });
    if (!dueDevices.length) continue;

    due += dueDevices.length;
    const message = buildReminderMessage(user);
    const result = await sendExpoPush(dueDevices.map((device) => device.token), message);
    if (!result.ok) continue;

    const accepted = new Set(result.acceptedTokens || []);
    const updates = dueDevices
      .filter((device) => accepted.has(device.token))
      .map((device) => {
        const local = localDateTime(now, device.timezone);
        return prisma.deviceToken.update({
          where: { token: device.token },
          data: { lastReminderKey: `${device.timezone}:${local.date}:${user.reminderTime}` },
        });
      });
    await Promise.all(updates);
    sent += updates.length;
  }
  return { checked: users.length, due, sent };
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

