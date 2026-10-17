const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const prisma = require("../lib/prisma");
const {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  STATUS_SET,
  serializeTicket,
  serializeReply,
  addStaffReply,
  supportInboxEmail,
} = require("../lib/support");
const { isEmailConfigured, sendSupportInboxEmail } = require("../lib/mailer");

const router = express.Router();
router.use(requireAuth, requireRole("ADMIN"));

router.get("/meta", (_req, res) => {
  res.json({
    categories: SUPPORT_CATEGORIES,
    statuses: SUPPORT_STATUSES,
    supportEmailConfigured: Boolean(supportInboxEmail() && isEmailConfigured()),
  });
});

router.get("/tickets", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim().toUpperCase();
    const status = String(req.query.status || "").trim().toUpperCase();
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const take = Math.min(100, Math.max(10, Number(req.query.take) || 40));

    const where = {
      ...(category ? { category } : {}),
      ...(status && STATUS_SET.has(status) ? { status } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
              ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { ticketCode: { contains: q, mode: "insensitive" } },
              { subject: { contains: q, mode: "insensitive" } },
              { message: { contains: q, mode: "insensitive" } },
              { contactEmail: { contains: q, mode: "insensitive" } },
              { user: { name: { contains: q, mode: "insensitive" } } },
              { user: { email: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [tickets, openCount] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        include: {
          user: { select: { id: true, name: true, email: true, school: true, schoolRecord: true } },
          _count: { select: { replies: true } },
        },
      }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    ]);

    res.json({
      tickets: tickets.map((row) => serializeTicket(row)),
      openCount,
    });
  } catch (err) {
    console.error("[admin/support/list]", err);
    res.status(500).json({ error: "Could not load support requests." });
  }
});

router.get("/tickets/:id", async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true, school: true, schoolRecord: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
        _count: { select: { replies: true } },
      },
    });
    if (!ticket) return res.status(404).json({ error: "Support request not found." });
    res.json({ ticket: serializeTicket(ticket, { includeReplies: true }) });
  } catch (err) {
    console.error("[admin/support/detail]", err);
    res.status(500).json({ error: "Could not load this support request." });
  }
});

router.patch("/tickets/:id/status", async (req, res) => {
  try {
    const status = String(req.body?.status || "").trim().toUpperCase();
    if (!STATUS_SET.has(status)) {
      return res.status(400).json({ error: "Choose Open, In Progress, or Resolved." });
    }
    const existing = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Support request not found." });

    const ticket = await prisma.supportTicket.update({
      where: { id: existing.id },
      data: { status },
      include: {
        user: { select: { id: true, name: true, email: true, school: true, schoolRecord: true } },
        _count: { select: { replies: true } },
      },
    });
    res.json({ ticket: serializeTicket(ticket) });
  } catch (err) {
    console.error("[admin/support/status]", err);
    res.status(500).json({ error: "Could not update ticket status." });
  }
});

router.post("/tickets/:id/replies", async (req, res) => {
  try {
    const admin = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!admin) return res.status(401).json({ error: "Account no longer exists" });

    const result = await addStaffReply({
      ticketId: req.params.id,
      admin,
      body: req.body?.body,
    });

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: result.ticket.id },
      include: {
        user: { select: { id: true, name: true, email: true, school: true, schoolRecord: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
        _count: { select: { replies: true } },
      },
    });

    res.status(201).json({
      ticket: serializeTicket(ticket, { includeReplies: true }),
      reply: serializeReply(result.reply),
      emailDelivered: Boolean(result.emailDelivered),
      emailError: result.emailError || null,
      message: result.emailDelivered
        ? "Reply saved and emailed to the student."
        : "Reply saved. Email delivery failed — you can retry from the ticket.",
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[admin/support/reply]", err);
    res.status(500).json({ error: "Could not send the reply." });
  }
});

/** Retry the inbound support-inbox email for a ticket that saved but failed to notify. */
router.post("/tickets/:id/retry-email", async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!ticket) return res.status(404).json({ error: "Support request not found." });

    const inbox = supportInboxEmail();
    if (!isEmailConfigured() || !inbox) {
      return res.status(503).json({ error: "Email delivery is not configured on this server." });
    }

    await sendSupportInboxEmail({ to: inbox, ticket, user: ticket.user });
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { emailNotifiedAt: new Date(), emailError: null },
      include: {
        user: { select: { id: true, name: true, email: true, school: true, schoolRecord: true } },
        _count: { select: { replies: true } },
      },
    });
    res.json({ ticket: serializeTicket(updated), emailDelivered: true });
  } catch (err) {
    console.error("[admin/support/retry-email]", err);
    res.status(500).json({ error: err.message || "Could not resend the support email." });
  }
});

module.exports = router;
