const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const prisma = require("../lib/prisma");
const {
  SUPPORT_CATEGORIES,
  createSupportTicket,
  serializeTicket,
} = require("../lib/support");

const router = express.Router();
router.use(requireAuth, requireRole("STUDENT"));

router.get("/meta", (_req, res) => {
  res.json({ categories: SUPPORT_CATEGORIES });
});

router.get("/tickets", async (req, res) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { _count: { select: { replies: true } } },
    });
    res.json({ tickets: tickets.map((row) => serializeTicket(row)) });
  } catch (err) {
    console.error("[support/tickets]", err);
    res.status(500).json({ error: "Could not load your support requests." });
  }
});

/**
 * Student view of a single support conversation (own tickets only).
 * Used when opening a support_reply notification deep link.
 */
router.get("/tickets/:id", async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        replies: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
        _count: { select: { replies: true } },
      },
    });
    if (!ticket) {
      return res.status(404).json({ error: "Support request not found." });
    }
    res.json({
      ticket: serializeTicket(ticket, { includeReplies: true }),
    });
  } catch (err) {
    console.error("[support/ticket-detail]", err);
    res.status(500).json({ error: "Could not load this support request." });
  }
});

router.post("/tickets", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ error: "Account no longer exists" });

    const result = await createSupportTicket({
      user,
      subject: req.body?.subject,
      category: req.body?.category,
      message: req.body?.message,
      contactEmail: req.body?.contactEmail || user.email,
    });

    const payload = {
      ticket: serializeTicket(result.ticket),
      duplicate: Boolean(result.duplicate),
      emailDelivered: Boolean(result.emailDelivered),
      message: result.duplicate
        ? "You already sent this request a moment ago. We still have it."
        : result.emailDelivered
          ? "Your message was sent. Our team will follow up by email."
          : "Your request was saved. Our team can see it in the admin inbox.",
    };

    // Never claim email was sent when delivery failed.
    if (!result.duplicate && result.emailError && !result.emailDelivered) {
      payload.emailWarning = "We saved your request, but the support email notification could not be delivered yet.";
    }

    res.status(result.duplicate ? 200 : 201).json(payload);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[support/create]", err);
    res.status(500).json({ error: "Could not submit your support request." });
  }
});

module.exports = router;
