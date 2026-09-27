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

function createSmtpTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_APP_PASSWORD,
      },
    });
  }

  if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });
  }

  return null;
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

  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const info = await transporter.sendMail({
    from: `"FocusFlow" <${fromAddress}>`,
    replyTo: fromAddress,
    to,
    subject,
    html,
    text,
  });
  console.log(`[mailer] Sent via SMTP to ${to}${info.messageId ? ` (${info.messageId})` : ""}`);
  return { delivered: true, provider: "smtp", messageId: info.messageId || null };
}

function verificationEmailContent(code) {
  const frontend = (process.env.FRONTEND_URL || "http://localhost:8081").replace(/\/$/, "");
  const subject = `${code} is your FocusFlow verification code`;
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

module.exports = {
  isEmailConfigured,
  sendEmail,
  sendVerificationEmailMessage,
  verifyEmailDelivery,
};
