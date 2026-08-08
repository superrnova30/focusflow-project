const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { sendExpoPush } = require("../lib/reminders");

const router = express.Router();
router.use(requireAuth);

// Register (or refresh) a device push token for the authenticated user.
// `platform` is expected to be "ios" or "android".
router.post("/register", async (req, res) => {
  const { token, platform } = req.body;
  if (!token || typeof token !== "string" || token.trim().length < 10) {
    return res.status(400).json({ error: "A valid push token is required" });
  }
  try {
    const saved = await prisma.deviceToken.upsert({
      where: { token: token.trim() },
      update: { userId: req.user.id, platform: platform || "unknown" },
      create: { token: token.trim(), userId: req.user.id, platform: platform || "unknown" },
    });
    res.json({ ok: true, deviceToken: saved });
  } catch (err) {
    console.error("Push register failed:", err);
    res.status(500).json({ error: "Failed to register device" });
  }
});

// Remove a device token (e.g. on logout or when the user disables push).
router.post("/unregister", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token is required" });
  try {
    // Only remove if it belongs to the requesting user.
    await prisma.deviceToken.deleteMany({ where: { token: token.trim(), userId: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("Push unregister failed:", err);
    res.status(500).json({ error: "Failed to unregister device" });
  }
});

// Send a test push to this user's registered devices.
router.post("/send-test", async (req, res) => {
  const { title, body } = req.body;
  const tokens = await prisma.deviceToken.findMany({ where: { userId: req.user.id } });
  if (tokens.length === 0) {
    return res.status(400).json({ error: "No registered push tokens for this account. Open Settings → Notifications to enable push." });
  }
  try {
    const result = await sendExpoPush(
      tokens.map((t) => t.token),
      { title: title || "FocusFlow test", body: body || "Your device is successfully registered! 🎉", data: { type: "test" } }
    );
    res.json({ ok: true, result });
  } catch (err) {
    console.error("Test push failed:", err);
    res.status(500).json({ error: "Failed to send test push" });
  }
});

module.exports = router;

