const express = require("express");
const prisma = require("../lib/prisma");
const { hashPassword, verifyPassword, signToken, publicUser } = require("../lib/auth");
const { requireAuth } = require("../middleware/auth");
const { bumpStreak } = require("../lib/gamification");

const router = express.Router();

// Public signup — always creates a STUDENT account. Admin accounts are
// provisioned by an existing admin via POST /api/admin/users instead.
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }

    // Honor the admin-controlled allowSignups system setting.
    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    if (settings && settings.allowSignups === false) {
      return res.status(403).json({ error: "New signups are currently disabled by the administrator" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: "An account with that email already exists" });

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { name, email: email.toLowerCase(), passwordHash, role: "STUDENT" },
    });

    await prisma.activityLog.create({ data: { userId: user.id, action: "account_created" } });

    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(401).json({ error: "Incorrect email or password" });
    if (user.status === "DISABLED") return res.status(403).json({ error: "This account has been disabled" });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Incorrect email or password" });

    await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    await bumpStreak(user.id);
    await prisma.activityLog.create({ data: { userId: user.id, action: "login" } });

    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    const token = signToken(refreshed);
    res.json({ token, user: publicUser(refreshed) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch("/me", requireAuth, async (req, res) => {
  const allowed = [
    "name", "profilePicture", "studentId", "course", "yearLevel", "section", "studyGoals",
    "preferredStudyDuration", "dailyGoalMinutes", "focusMinutes", "shortBreakMinutes",
    "longBreakMinutes", "sessionsBeforeLongBreak", "remindersEnabled", "reminderTime",
  ];
  const data = {};
  for (const key of allowed) if (key in req.body) data[key] = req.body[key];

  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ user: publicUser(user) });
});

module.exports = router;
