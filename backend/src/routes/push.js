const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { publicUser } = require("../lib/auth");
const { sendExpoPush } = require("../lib/reminders");

const router = express.Router();
router.use(requireAuth);

function normalizeTimezone(value) {
  const timezone = String(value || "UTC").trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch (e) {
    return "UTC";
  }
}

async function setPushPreference(userId, enabled) {
  return prisma.user.update({
    where: { id: userId },
    data: { pushNotificationsEnabled: Boolean(enabled) },
    include: { schoolRecord: true },
  });
}

// Current push preference + whether this account has any registered devices.
router.get("/status", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        schoolRecord: true,
        deviceTokens: { select: { id: true, platform: true, updatedAt: true } },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      enabled: Boolean(user.pushNotificationsEnabled),
      hasDeviceToken: user.deviceTokens.length > 0,
      deviceCount: user.deviceTokens.length,
      remindersEnabled: Boolean(user.remindersEnabled),
      reminderTime: user.reminderTime || "18:00",
      user: publicUser(user),
    });
  } catch (err) {
    console.error("Push status failed:", err);
    res.status(500).json({ error: "Failed to load notification status" });
  }
});

// Persist the Settings toggle without requiring a device token (e.g. Expo Go local-only).
router.post("/preference", async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  try {
    const user = await setPushPreference(req.user.id, enabled);

    // Turning the master switch off must stop remote delivery for every device.
    if (!enabled) {
      await prisma.deviceToken.deleteMany({ where: { userId: req.user.id } });
    }

    res.json({
      ok: true,
      enabled,
      user: publicUser(user),
    });
  } catch (err) {
    console.error("Push preference update failed:", err);
    res.status(500).json({ error: "Failed to save notification preference" });
  }
});

// Register (or refresh) a device push token for the authenticated user.
// `platform` is expected to be "ios" or "android".
router.post("/register", async (req, res) => {
  const { token, platform, timezone } = req.body;
  if (!token || typeof token !== "string" || token.trim().length < 10) {
    return res.status(400).json({ error: "A valid push token is required" });
  }
  try {
    const normalizedTimezone = normalizeTimezone(timezone);
    const saved = await prisma.deviceToken.upsert({
      where: { token: token.trim() },
      update: {
        userId: req.user.id,
        platform: platform || "unknown",
        timezone: normalizedTimezone,
      },
      create: {
        token: token.trim(),
        userId: req.user.id,
        platform: platform || "unknown",
        timezone: normalizedTimezone,
      },
    });

    // Owning a registered token implies the user opted into push on this device.
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        timezone: normalizedTimezone,
        pushNotificationsEnabled: true,
      },
      include: { schoolRecord: true },
    });

    res.json({ ok: true, deviceToken: saved, user: publicUser(user) });
  } catch (err) {
    console.error("Push register failed:", err);
    res.status(500).json({ error: "Failed to register device" });
  }
});

// Remove a device token (e.g. on logout or when the user disables push).
// Pass `{ clearPreference: true }` when the Settings toggle is turned off.
router.post("/unregister", async (req, res) => {
  const { token, clearPreference } = req.body || {};
  try {
    if (token && typeof token === "string") {
      // Only remove if it belongs to the requesting user.
      await prisma.deviceToken.deleteMany({
        where: { token: token.trim(), userId: req.user.id },
      });
    } else if (clearPreference) {
      // Toggle-off path with no cached token: wipe all devices for this user.
      await prisma.deviceToken.deleteMany({ where: { userId: req.user.id } });
    }

    let user = null;
    if (clearPreference) {
      user = await setPushPreference(req.user.id, false);
    } else {
      user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { schoolRecord: true },
      });
    }

    res.json({ ok: true, user: user ? publicUser(user) : undefined });
  } catch (err) {
    console.error("Push unregister failed:", err);
    res.status(500).json({ error: "Failed to unregister device" });
  }
});

// Send a test push to this user's registered devices.
router.post("/send-test", async (req, res) => {
  const { title, body } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { pushNotificationsEnabled: true },
  });
  if (!user?.pushNotificationsEnabled) {
    return res.status(400).json({
      error: "Push notifications are turned off. Enable them in Settings first.",
    });
  }

  const tokens = await prisma.deviceToken.findMany({ where: { userId: req.user.id } });
  if (tokens.length === 0) {
    return res.status(400).json({
      error: "No registered push tokens for this account. Open Settings → Push notifications to enable push on this device.",
    });
  }
  try {
    const result = await sendExpoPush(
      tokens.map((t) => t.token),
      {
        title: title || "FocusFlow test",
        body: body || "Your device is successfully registered! 🎉",
        data: { type: "test" },
      }
    );
    if (!result.ok || result.accepted === 0) {
      return res.status(502).json({
        error: result.error || "Expo did not accept the notification",
        result,
      });
    }
    res.json({ ok: true, result });
  } catch (err) {
    console.error("Test push failed:", err);
    res.status(500).json({ error: "Failed to send test push" });
  }
});

module.exports = router;
