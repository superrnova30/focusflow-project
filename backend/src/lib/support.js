const crypto = require("crypto");
const prisma = require("./prisma");
const { createNotification } = require("./notifications");
const {
  isEmailConfigured,
  sendSupportInboxEmail,
  sendSupportReplyEmail,
} = require("./mailer");

const SUPPORT_CATEGORIES = [
  { value: "ACCOUNT", label: "Account" },
  { value: "SCHOOL_CHANGE", label: "School Change" },
  { value: "PAYMENTS", label: "Payments and Subscriptions" },
  { value: "SHOP_COINS", label: "Shop Coins" },
  { value: "BUG_REPORT", label: "Bug Report" },
  { value: "OTHER", label: "Other" },
];

const SUPPORT_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
];

const CATEGORY_SET = new Set(SUPPORT_CATEGORIES.map((row) => row.value));
const STATUS_SET = new Set(SUPPORT_STATUSES.map((row) => row.value));

function supportInboxEmail() {
  return String(process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || "").trim();
}

function categoryLabel(value) {
  return SUPPORT_CATEGORIES.find((row) => row.value === value)?.label || value || "Other";
}

function statusLabel(value) {
  return SUPPORT_STATUSES.find((row) => row.value === value)?.label || value || "Open";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

async function generateTicketCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `POMO-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await prisma.supportTicket.findUnique({ where: { ticketCode: code } });
    if (!existing) return code;
  }
  return `POMO-${Date.now().toString(36).toUpperCase()}`;
}

function serializeReply(reply) {
  if (!reply) return null;
  return {
    id: reply.id,
    body: reply.body,
    isStaff: Boolean(reply.isStaff),
    emailSentAt: reply.emailSentAt,
    emailError: reply.emailError || null,
    createdAt: reply.createdAt,
    author: reply.author
      ? {
          id: reply.author.id,
          name: reply.author.name,
          role: reply.author.role,
        }
      : null,
  };
}

function serializeTicket(ticket, { includeReplies = false } = {}) {
  if (!ticket) return null;
  return {
    id: ticket.id,
    ticketCode: ticket.ticketCode,
    subject: ticket.subject,
    category: ticket.category,
    categoryLabel: categoryLabel(ticket.category),
    message: ticket.message,
    contactEmail: ticket.contactEmail,
    status: ticket.status,
    statusLabel: statusLabel(ticket.status),
    emailNotifiedAt: ticket.emailNotifiedAt,
    emailError: ticket.emailError || null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    user: ticket.user
      ? {
          id: ticket.user.id,
          name: ticket.user.name,
          email: ticket.user.email,
          school: ticket.user.school || ticket.user.schoolRecord?.name || null,
        }
      : null,
    replyCount: ticket._count?.replies ?? (ticket.replies ? ticket.replies.length : 0),
    replies: includeReplies && Array.isArray(ticket.replies)
      ? ticket.replies.map(serializeReply)
      : undefined,
  };
}

async function notifyAdminsOfTicket(ticket, submitter) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });
  const name = submitter?.name || "A student";
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        actorId: submitter?.id || null,
        type: "support",
        title: "New Contact PomodAI request",
        body: `${name} · ${ticket.ticketCode} · ${categoryLabel(ticket.category)}`,
        data: {
          screen: "SupportDetail",
          ticketId: ticket.id,
          ticketCode: ticket.ticketCode,
          category: ticket.category,
        },
        dedupeKey: `support:${ticket.id}`,
        refresh: true,
      })
    )
  );
}

async function createSupportTicket({
  user,
  subject,
  category,
  message,
  contactEmail,
}) {
  const cleanSubject = String(subject || "").trim().replace(/\s+/g, " ");
  const cleanMessage = String(message || "").trim();
  const cleanCategory = String(category || "").trim().toUpperCase();
  const email = normalizeEmail(contactEmail || user.email);

  if (!cleanSubject || cleanSubject.length < 3) {
    const err = new Error("Enter a subject (at least 3 characters).");
    err.status = 400;
    throw err;
  }
  if (cleanSubject.length > 160) {
    const err = new Error("Subject must be 160 characters or fewer.");
    err.status = 400;
    throw err;
  }
  if (!CATEGORY_SET.has(cleanCategory)) {
    const err = new Error("Choose a valid category.");
    err.status = 400;
    throw err;
  }
  if (!cleanMessage || cleanMessage.length < 10) {
    const err = new Error("Enter a message (at least 10 characters).");
    err.status = 400;
    throw err;
  }
  if (cleanMessage.length > 5000) {
    const err = new Error("Message must be 5000 characters or fewer.");
    err.status = 400;
    throw err;
  }
  if (!isValidEmail(email)) {
    const err = new Error("Enter a valid email address.");
    err.status = 400;
    throw err;
  }

  // Soft duplicate guard: same user + subject + message within 2 minutes.
  const recent = await prisma.supportTicket.findFirst({
    where: {
      userId: user.id,
      subject: cleanSubject,
      message: cleanMessage,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return { ticket: recent, duplicate: true };
  }

  const ticketCode = await generateTicketCode();
  const ticket = await prisma.supportTicket.create({
    data: {
      ticketCode,
      userId: user.id,
      subject: cleanSubject,
      category: cleanCategory,
      message: cleanMessage,
      contactEmail: email,
      status: "OPEN",
    },
    include: {
      user: { select: { id: true, name: true, email: true, school: true, schoolRecord: true } },
      _count: { select: { replies: true } },
    },
  });

  await notifyAdminsOfTicket(ticket, user).catch((err) => {
    console.warn("[support] admin notify failed:", err.message);
  });

  let emailDelivered = false;
  let emailError = null;
  const inbox = supportInboxEmail();
  if (isEmailConfigured() && inbox) {
    try {
      await sendSupportInboxEmail({
        to: inbox,
        ticket,
        user,
      });
      emailDelivered = true;
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { emailNotifiedAt: new Date(), emailError: null },
      });
      ticket.emailNotifiedAt = new Date();
      ticket.emailError = null;
    } catch (err) {
      emailError = err.message || "Email delivery failed";
      console.error("[support] inbox email failed:", emailError);
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { emailError },
      });
      ticket.emailError = emailError;
    }
  } else if (!inbox) {
    emailError = "SUPPORT_EMAIL is not configured";
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { emailError },
    });
    ticket.emailError = emailError;
  } else {
    emailError = "Email delivery is not configured";
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { emailError },
    });
    ticket.emailError = emailError;
  }

  return { ticket, duplicate: false, emailDelivered, emailError };
}

async function addStaffReply({ ticketId, admin, body }) {
  const cleanBody = String(body || "").trim();
  if (!cleanBody || cleanBody.length < 2) {
    const err = new Error("Enter a reply message.");
    err.status = 400;
    throw err;
  }
  if (cleanBody.length > 5000) {
    const err = new Error("Reply must be 5000 characters or fewer.");
    err.status = 400;
    throw err;
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!ticket) {
    const err = new Error("Support request not found.");
    err.status = 404;
    throw err;
  }

  const reply = await prisma.supportReply.create({
    data: {
      ticketId: ticket.id,
      authorId: admin.id,
      body: cleanBody,
      isStaff: true,
    },
    include: {
      author: { select: { id: true, name: true, role: true } },
    },
  });

  if (ticket.status === "OPEN") {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "IN_PROGRESS" },
    });
    ticket.status = "IN_PROGRESS";
  }

  let emailDelivered = false;
  let emailError = null;
  const to = ticket.contactEmail || ticket.user?.email;
  if (isEmailConfigured() && to) {
    try {
      await sendSupportReplyEmail({
        to,
        ticket,
        replyBody: cleanBody,
        adminName: admin.name || "PomodAI Support",
      });
      emailDelivered = true;
      await prisma.supportReply.update({
        where: { id: reply.id },
        data: { emailSentAt: new Date(), emailError: null },
      });
      reply.emailSentAt = new Date();
      reply.emailError = null;
    } catch (err) {
      emailError = err.message || "Email delivery failed";
      console.error("[support] reply email failed:", emailError);
      await prisma.supportReply.update({
        where: { id: reply.id },
        data: { emailError },
      });
      reply.emailError = emailError;
    }
  } else {
    emailError = isEmailConfigured() ? "No recipient email on this ticket" : "Email delivery is not configured";
    await prisma.supportReply.update({
      where: { id: reply.id },
      data: { emailError },
    });
    reply.emailError = emailError;
  }

  // Notify the student that support replied — deep-link opens their conversation.
  const preview = cleanBody.length > 120 ? `${cleanBody.slice(0, 117)}…` : cleanBody;
  await createNotification({
    userId: ticket.userId,
    actorId: admin.id,
    type: "support_reply",
    title: "PomodAI Support replied",
    body: preview || `Ticket ${ticket.ticketCode}: ${ticket.subject}`,
    data: {
      screen: "SupportTicket",
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      replyId: reply.id,
      subject: ticket.subject,
    },
    dedupeKey: `support_reply:${reply.id}`,
    refresh: true,
  }).catch(() => {});

  return { ticket, reply, emailDelivered, emailError };
}

module.exports = {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  CATEGORY_SET,
  STATUS_SET,
  supportInboxEmail,
  categoryLabel,
  statusLabel,
  isValidEmail,
  serializeTicket,
  serializeReply,
  createSupportTicket,
  addStaffReply,
  notifyAdminsOfTicket,
};
