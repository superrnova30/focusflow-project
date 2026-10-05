const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { serializeNotification, notificationActorSelect, notifyWelcome } = require("../lib/notifications");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const take = Math.min(80, Math.max(10, Number(req.query.take) || 40));
    if (req.user.role === "STUDENT") {
      const existing = await prisma.notification.count({ where: { userId: req.user.id } });
      if (existing === 0) await notifyWelcome(req.user.id);
    }
    const rows = await prisma.notification.findMany({
      where: { userId: req.user.id },
      include: { actor: { select: notificationActorSelect() } },
      orderBy: { createdAt: "desc" },
      take,
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, readAt: null },
    });
    res.json({
      notifications: rows.map(serializeNotification),
      unreadCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load notifications" });
  }
});

router.get("/unread-count", async (req, res) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, readAt: null },
    });
    res.json({ unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load unread count" });
  }
});

router.post("/read-all", async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true, updated: result.count, unreadCount: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not mark notifications as read" });
  }
});

router.post("/:id/read", async (req, res) => {
  try {
    const existing = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { actor: { select: notificationActorSelect() } },
    });
    if (!existing) return res.status(404).json({ error: "Notification not found" });

    const row = existing.readAt
      ? existing
      : await prisma.notification.update({
          where: { id: existing.id },
          data: { readAt: new Date() },
          include: { actor: { select: notificationActorSelect() } },
        });

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, readAt: null },
    });
    res.json({ ok: true, notification: serializeNotification(row), unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not mark notification as read" });
  }
});

module.exports = router;
