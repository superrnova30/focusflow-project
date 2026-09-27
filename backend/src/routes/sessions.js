const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { buildStudentStats } = require("../lib/student_stats");

const router = express.Router();
router.use(requireAuth);

// Log a completed Pomodoro session (focus / short break / long break)
router.post("/", async (req, res) => {
  const { type, minutes, subjectId, taskId } = req.body;
  if (!["focus", "short", "long"].includes(type)) {
    return res.status(400).json({ error: 'type must be "focus", "short", or "long"' });
  }
  const session = await prisma.pomodoroSession.create({
    data: { type, minutes, subjectId: subjectId || null, taskId: taskId || null, userId: req.user.id },
  });

  if (type === "focus" && taskId) {
    await prisma.task.updateMany({
      where: { id: taskId, userId: req.user.id },
      data: { pomodorosSpent: { increment: 1 } },
    });
  }
  await prisma.activityLog.create({ data: { userId: req.user.id, action: "session_complete" } });

  res.status(201).json({ session });
});

// Canonical student dashboard statistics. The same aggregator is used by the
// admin profile endpoint so both accounts always see matching values.
router.get("/stats", async (req, res) => {
  try {
    const stats = await buildStudentStats(req.user.id);
    if (!stats) return res.status(404).json({ error: "Student not found" });
    res.json(stats);
  } catch (error) {
    console.error("Student stats failed", error);
    res.status(500).json({ error: "Could not load your statistics" });
  }
});

module.exports = router;
