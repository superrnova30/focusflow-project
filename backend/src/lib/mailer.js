const nodemailer = require("nodemailer");

let smtpVerified = false;
let smtpVerifyFailed = false;

function isEmailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY ||
      process.env.SMTP_HOST ||
      (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD)
  );
}

function normalizeSmtpPassword(value) {
  // Gmail app passwords are often copied with spaces; strip them for auth.
  return String(value || "").replace(/\s/g, "");
}

function createGmailTransporter(user, pass) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: String(user || "").trim(),
      pass: normalizeSmtpPassword(pass),
    },
  });
}

function createSmtpTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: (process.env.SMTP_USER || process.env.EMAIL_USER || "").trim(),
        pass: normalizeSmtpPassword(process.env.SMTP_PASS || process.env.EMAIL_APP_PASSWORD),
      },
    });
  }

  if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
    return createGmailTransporter(process.env.EMAIL_USER, process.env.EMAIL_APP_PASSWORD);
  }

  return null;
}

function resolveFromAddress() {
  const authUser = String(process.env.EMAIL_USER || process.env.SMTP_USER || "").trim();
  const authEmail = authUser.toLowerCase();
  const configured = String(process.env.EMAIL_FROM || "").trim();
  if (!configured) {
    return authUser || null;
  }
  const match = configured.match(/<([^>]+)>/);
  const configuredEmail = (match ? match[1] : configured).trim();
  if (!configuredEmail.includes("@")) {
    return authUser || null;
  }
  // Gmail SMTP only allows sending as the authenticated mailbox.
  if (authEmail && configuredEmail.toLowerCase() !== authEmail) {
    console.warn(
      `[mailer] EMAIL_FROM (${configuredEmail}) does not match SMTP user (${authUser}); using SMTP user as From.`
    );
    return authUser;
  }
  return configuredEmail;
}

async function ensureSmtpReady(transporter) {
  if (smtpVerified) return;
  if (smtpVerifyFailed) {
    throw new Error("SMTP connection is not available");
  }
  try {
    await transporter.verify();
    smtpVerified = true;
    console.log("[mailer] SMTP connection verified");
  } catch (err) {
    smtpVerifyFailed = true;
    throw new Error(`SMTP verification failed: ${err.message}`);
  }
}

async function sendViaResend({ to, subject, html, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "FocusFlow <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend rejected the email: ${body}`);
  }
}

async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    throw new Error("Email delivery is not configured on this server");
  }

  if (process.env.RESEND_API_KEY) {
    await sendViaResend({ to, subject, html, text });
    console.log(`[mailer] Sent via Resend to ${to}`);
    return { delivered: true, provider: "resend" };
  }

  const transporter = createSmtpTransporter();
  if (!transporter) {
    throw new Error("Email delivery is not configured on this server");
  }

  await ensureSmtpReady(transporter);

  const fromAddress = resolveFromAddress();
  if (!fromAddress) {
    throw new Error("Email delivery is not configured on this server");
  }
  const info = await transporter.sendMail({
    from: `"FocusFlow" <${fromAddress}>`,
    replyTo: fromAddress,
    to: String(to || "").trim(),
    subject,
    html,
    text,
  });

  const rejected = info.rejected || [];
  if (rejected.length) {
    throw new Error(`SMTP rejected recipient(s): ${rejected.join(", ")}`);
  }
  const accepted = info.accepted || [];
  if (!accepted.length && !info.messageId) {
    throw new Error("SMTP did not accept the message for delivery");
  }

  console.log(`[mailer] Sent via SMTP to ${to}${info.messageId ? ` (${info.messageId})` : ""}`);
  return { delivered: true, provider: "smtp", messageId: info.messageId || null };
}

function verificationEmailContent(code) {
  const frontend = (process.env.FRONTEND_URL || "http://localhost:8081").replace(/\/$/, "");
  const subject = "Your FocusFlow email verification code";
  const text = [
    "Welcome to FocusFlow!",
    "",
    `Your verification code is: ${code}`,
    "",
    "Enter this code in the app to verify your email. The code expires in 15 minutes.",
    "",
    `Open FocusFlow: ${frontend}`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:520px">
      <h2 style="margin:0 0 12px">Verify your FocusFlow email</h2>
      <p style="margin:0 0 16px">Enter this code in the app to finish creating your account:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:6px;padding:16px 20px;background:#F0ECFF;border-radius:12px;display:inline-block;color:#6C5CE7">
        ${code}
      </div>
      <p style="margin:16px 0 0;color:#6B7280;font-size:14px">This code expires in 15 minutes. If you did not create an account, you can ignore this email.</p>
    </div>
  `;
  return { subject, html, text };
}

async function sendVerificationEmailMessage(email, code) {
  const { subject, html, text } = verificationEmailContent(code);
  return sendEmail({ to: email, subject, html, text });
}

function passwordResetEmailContent(code, { initiatedBy = "self" } = {}) {
  const adminRequested = initiatedBy === "admin";
  const subject = "Your FocusFlow password reset code";
  const intro = adminRequested
    ? "An administrator requested a password reset for your FocusFlow account."
    : "Use this verification code to choose a new FocusFlow password.";
  const steps = [
    "1. Open FocusFlow and tap Forgot password.",
    "2. Enter this email address.",
    "3. Tap “I already have a code”, then enter the code below.",
    "4. Create and confirm your new password.",
  ];
  const text = [
    "Reset your FocusFlow password",
    "",
    intro,
    "",
    `Your verification code is: ${code}`,
    "",
    ...steps,
    "",
    "This code expires in 15 minutes.",
    adminRequested
      ? "If you were not expecting this, you can ignore this email and keep using your current password."
      : "If you did not ask to reset your password, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:520px">
      <h2 style="margin:0 0 12px">Reset your FocusFlow password</h2>
      <p style="margin:0 0 16px">${intro}</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:6px;padding:16px 20px;background:#F0ECFF;border-radius:12px;display:inline-block;color:#6C5CE7">
        ${code}
      </div>
      <p style="margin:16px 0 8px">Then finish the reset in the app:</p>
      <ol style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px">
        <li>Open FocusFlow and tap Forgot password.</li>
        <li>Enter this email address.</li>
        <li>Tap “I already have a code”, then enter the code above.</li>
        <li>Create and confirm your new password.</li>
      </ol>
      <p style="margin:0;color:#6B7280;font-size:14px">This code expires in 15 minutes. ${
        adminRequested
          ? "If you were not expecting this, you can ignore this email and keep using your current password."
          : "If you did not request a password reset, you can ignore this email."
      }</p>
    </div>
  `;
  return { subject, html, text };
}

async function sendPasswordResetEmailMessage(email, code, options = {}) {
  const { subject, html, text } = passwordResetEmailContent(code, options);
  return sendEmail({ to: email, subject, html, text });
}

async function verifyEmailDelivery() {
  if (!isEmailConfigured()) {
    throw new Error("Email delivery is not configured");
  }
  if (process.env.RESEND_API_KEY) {
    return { ok: true, provider: "resend" };
  }
  const transporter = createSmtpTransporter();
  await ensureSmtpReady(transporter);
  return { ok: true, provider: "smtp" };
}

async function sendSupportInboxEmail({ to, ticket, user }) {
  const subject = `[PomodAI Support] ${ticket.ticketCode} · ${ticket.subject}`;
  const category = ticket.category || "OTHER";
  const text = [
    "New Contact PomodAI support request",
    "",
    `Ticket: ${ticket.ticketCode}`,
    `From: ${user?.name || "Student"} <${ticket.contactEmail}>`,
    `Category: ${category}`,
    `Subject: ${ticket.subject}`,
    "",
    ticket.message,
    "",
    `Submitted: ${new Date(ticket.createdAt || Date.now()).toISOString()}`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:560px">
      <h2 style="margin:0 0 12px">New Contact PomodAI request</h2>
      <p style="margin:0 0 8px"><strong>Ticket:</strong> ${ticket.ticketCode}</p>
      <p style="margin:0 0 8px"><strong>From:</strong> ${user?.name || "Student"} &lt;${ticket.contactEmail}&gt;</p>
      <p style="margin:0 0 8px"><strong>Category:</strong> ${category}</p>
      <p style="margin:0 0 16px"><strong>Subject:</strong> ${ticket.subject}</p>
      <div style="padding:14px 16px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;white-space:pre-wrap">${String(ticket.message || "").replace(/</g, "&lt;")}</div>
    </div>
  `;
  return sendEmail({ to, subject, html, text });
}

async function sendSupportReplyEmail({ to, ticket, replyBody, adminName }) {
  const subject = `Re: [${ticket.ticketCode}] ${ticket.subject}`;
  const text = [
    `PomodAI Support replied to your request ${ticket.ticketCode}.`,
    "",
    replyBody,
    "",
    `— ${adminName || "PomodAI Support"}`,
    "",
    "Please reply in the app or to this email thread if you need more help.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:560px">
      <h2 style="margin:0 0 12px">PomodAI Support reply</h2>
      <p style="margin:0 0 8px"><strong>Ticket:</strong> ${ticket.ticketCode}</p>
      <p style="margin:0 0 16px"><strong>Subject:</strong> ${ticket.subject}</p>
      <div style="padding:14px 16px;background:#F0ECFF;border-radius:12px;white-space:pre-wrap">${String(replyBody || "").replace(/</g, "&lt;")}</div>
      <p style="margin:16px 0 0;color:#6B7280;font-size:13px">— ${adminName || "PomodAI Support"}</p>
    </div>
  `;
  return sendEmail({ to, subject, html, text });
}

module.exports = {
  isEmailConfigured,
  sendEmail,
  sendVerificationEmailMessage,
  sendPasswordResetEmailMessage,
  sendSupportInboxEmail,
  sendSupportReplyEmail,
  verifyEmailDelivery,
};
