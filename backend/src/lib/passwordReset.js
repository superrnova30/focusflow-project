const crypto = require("crypto");
const prisma = require("./prisma");
const { isEmailConfigured, sendPasswordResetEmailMessage } = require("./mailer");

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_RESEND_COOLDOWN_MS = 45 * 1000;
const RESET_MAX_ATTEMPTS = 5;

function generateResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashResetCode(email, code) {
  return crypto.createHash("sha256").update(`focusflow-reset:${email}:${code}`).digest("hex");
}

function resetCodesMatch(storedHash, email, code) {
  if (!storedHash || !code) return false;
  const expected = Buffer.from(String(storedHash), "utf8");
  const actual = Buffer.from(hashResetCode(email, code), "utf8");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function isResetCodeValid(user, email, code) {
  if (!user?.passwordResetCodeHash || !user.passwordResetExpires) return false;
  if (Date.now() > new Date(user.passwordResetExpires).getTime()) return false;
  return resetCodesMatch(user.passwordResetCodeHash, email, code);
}

function wasResetCodeSentRecently(user) {
  if (!user?.passwordResetCodeHash || !user.passwordResetExpires) return false;
  const remaining = new Date(user.passwordResetExpires).getTime() - Date.now();
  if (remaining <= 0) return false;
  const elapsed = RESET_CODE_TTL_MS - remaining;
  return elapsed >= 0 && elapsed < RESET_RESEND_COOLDOWN_MS;
}

function resetResendWaitSeconds(user) {
  if (!wasResetCodeSentRecently(user)) return 0;
  const remaining = new Date(user.passwordResetExpires).getTime() - Date.now();
  const elapsed = RESET_CODE_TTL_MS - remaining;
  return Math.max(1, Math.ceil((RESET_RESEND_COOLDOWN_MS - elapsed) / 1000));
}

async function clearPasswordReset(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordResetCodeHash: null,
      passwordResetExpires: null,
      passwordResetAttempts: 0,
    },
  });
}

async function issuePasswordResetEmail(user, { initiatedBy = "self", ignoreCooldown = false } = {}) {
  if (!user?.id || !user.email) {
    const error = new Error("This account has no email address.");
    error.status = 400;
    throw error;
  }

  if (!ignoreCooldown && wasResetCodeSentRecently(user)) {
    return { sent: false, skipped: "cooldown", email: user.email };
  }

  const email = String(user.email).trim().toLowerCase();
  const code = generateResetCode();
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
  const codeHash = hashResetCode(email, code);

  // Persist the code before sending email so a delivered code always matches the DB
  // (avoids race/failure where email sends but the update never commits).
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetCodeHash: codeHash,
      passwordResetExpires: expiresAt,
      passwordResetAttempts: 0,
    },
  });

  try {
    await sendPasswordResetEmailMessage(email, code, { initiatedBy });
  } catch (err) {
    console.error("Failed to send password reset email:", err.message || err);
    await clearPasswordReset(user.id).catch(() => {});
    const error = new Error(
      isEmailConfigured()
        ? "We couldn't send the verification code right now. Please try again in a moment."
        : "Email delivery is not configured on this server yet."
    );
    error.status = 503;
    throw error;
  }

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      action: initiatedBy === "admin" ? "admin_password_reset_email_sent" : "password_reset_code_sent",
    },
  });

  return { sent: true, email };
}

module.exports = {
  RESET_CODE_TTL_MS,
  RESET_RESEND_COOLDOWN_MS,
  RESET_MAX_ATTEMPTS,
  generateResetCode,
  hashResetCode,
  resetCodesMatch,
  isResetCodeValid,
  wasResetCodeSentRecently,
  resetResendWaitSeconds,
  clearPasswordReset,
  issuePasswordResetEmail,
};
