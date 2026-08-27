const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { hashPassword, verifyPassword, signToken, publicUser } = require("../lib/auth");
const { requireAuth } = require("../middleware/auth");
const { bumpStreak } = require("../lib/gamification");
const transporter = require("../../config/email");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const router = express.Router();

const resetTokens = new Map();
const verificationTokens = new Map();

function buildResetPayload(user, rawToken) {
  const token = rawToken || crypto.randomBytes(8).toString("hex").toUpperCase();
  const code = token.slice(0, 8).toUpperCase();
  const email = user.email.toLowerCase();
  const expiresAt = Date.now() + 60 * 60 * 1000;
  resetTokens.set(`${email}:${code}`, { userId: user.id, expiresAt, code });
  return { code, expiresAt };
}

async function sendPasswordResetEmail(email, code) {
  try {
    if (transporter && process.env.EMAIL_USER) {
      const frontend = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_API_URL || "http://localhost:19006";
      const resetLink = `${frontend.replace(/\/$/, "")}/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`;
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Reset your password",
        html: `
          <h2>Password reset requested</h2>
          <p>Use the following code to reset your password:</p>
          <pre>${code}</pre>
          <p>Or click the link below:</p>
          <a href="${resetLink}">Reset my password</a>
        `,
      });
      return;
    }
  } catch (err) {
    console.error('Failed to send reset email', err);
  }
  console.log(`[dev-reset-email] password reset requested for ${email} :: code=${code}`);
}

async function sendVerificationEmail(email, code) {
  try {
    if (transporter && process.env.EMAIL_USER) {
      const backendBase = process.env.BACKEND_URL || process.env.API_BASE_URL || process.env.EXPO_PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`;
      // Ensure we point at the auth verification endpoint on the API.
      const verificationLink = `${String(backendBase).replace(/\/$/, "")}/api/auth/verify-email?token=${encodeURIComponent(code)}`;
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Verify Your Email",
        html: `
          <h2>Welcome!</h2>
          <p>Please verify your email address.</p>

          <p>Your verification token:</p>
          <pre>${code}</pre>

          <p>Or click the link to verify:</p>
          <a href="${verificationLink}">Verify My Email</a>
        `,
      });
      return;
    }
  } catch (err) {
    console.error('Failed to send verification email', err);
  }
  console.log(`[dev-verify-email] verification code for ${email} :: code=${code}`);
}

function generateVerificationCode() {
  // Generate a short, user-friendly 5-digit numeric code for email verification.
  // Use crypto.randomInt to ensure cryptographic randomness and avoid leading zeros.
  const code = crypto.randomInt(10000, 100000); // 10000..99999
  return String(code);
}

// Configure Google OAuth strategy to allow users to verify their email
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const callbackURL = `${process.env.BACKEND_URL || process.env.API_BASE_URL || process.env.EXPO_PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`}/api/auth/oauth/google/callback`;

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = (profile.emails && profile.emails[0] && profile.emails[0].value) || null;
          if (!email) return done(new Error("No email provided by Google"));

          let user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
          if (!user) {
            // Create a student account with a random password (user can set a password later)
            const randomPass = crypto.randomBytes(12).toString("hex");
            const passwordHash = await hashPassword(randomPass);
            user = await prisma.user.create({
              data: {
                name: profile.displayName || email.split("@")[0],
                email: email.toLowerCase(),
                passwordHash,
                role: "STUDENT",
                emailVerified: true,
              },
            });
          } else if (!user.emailVerified) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null },
            });
          }

          await prisma.activityLog.create({ data: { userId: user.id, action: "email_verified_oauth" } });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

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
    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: "STUDENT",
        emailVerificationCode: verificationCode,
        emailVerificationExpires: new Date(expiresAt),
      },
    });

    verificationTokens.set(`${user.email}:${verificationCode}`, { userId: user.id, expiresAt });
    await sendVerificationEmail(user.email, verificationCode);
    await prisma.activityLog.create({ data: { userId: user.id, action: "account_created" } });

    res.status(201).json({
      message: "Account created. Please verify your email to continue.",
      email: user.email,
    });
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

    // Require email verification before login for STUDENT accounts only.
    // Admins and other roles should be able to sign in without verification.
    if (user.role === "STUDENT" && !user.emailVerified) {
      return res.status(403).json({
        error: "Please verify your email before logging in",
        requiresVerification: true,
        email: user.email,
      });
    }

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

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(200).json({ message: "If an account exists, a reset code has been sent to that email." });
    }

    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const expiresAt = Date.now() + 60 * 60 * 1000;
    resetTokens.set(`${user.email.toLowerCase()}:${code}`, { userId: user.id, expiresAt, code });

    await sendPasswordResetEmail(user.email, code);
    return res.status(200).json({ message: "If an account exists, a reset code has been sent to that email.", code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start password reset" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "email, code, and newPassword are required" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCode = String(code).trim().toUpperCase();
    const token = resetTokens.get(`${normalizedEmail}:${normalizedCode}`);
    if (!token) {
      return res.status(400).json({ error: "That reset code is invalid or expired" });
    }
    if (Date.now() > token.expiresAt) {
      resetTokens.delete(`${normalizedEmail}:${normalizedCode}`);
      return res.status(400).json({ error: "That reset code is invalid or expired" });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: token.userId }, data: { passwordHash } });
    await prisma.activityLog.create({ data: { userId: token.userId, action: "password_reset" } });

    resetTokens.delete(`${normalizedEmail}:${normalizedCode}`);
    return res.json({ ok: true, message: "Password was reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.post("/send-verification", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(200).json({ message: "If an account exists with that email, a verification code has been sent." });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: "This email is already verified" });
    }

    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationCode: verificationCode, emailVerificationExpires: new Date(expiresAt) },
    });

    verificationTokens.set(`${user.email}:${verificationCode}`, { userId: user.id, expiresAt });
    await sendVerificationEmail(user.email, verificationCode);
    await prisma.activityLog.create({ data: { userId: user.id, action: "verification_code_sent" } });

    return res.status(200).json({ message: "If an account exists with that email, a verification code has been sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send verification code" });
  }
});

router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ error: "email and code are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCode = String(code).trim().toUpperCase();
    const token = verificationTokens.get(`${normalizedEmail}:${normalizedCode}`);

    // If the in-memory token is not present (e.g. server restarted), fall back
    // to checking the code stored on the user record in the database so users
    // can still verify even after a restart.
    let user = null;
    if (!token) {
      const dbUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (!dbUser || !dbUser.emailVerificationCode || dbUser.emailVerificationCode.toUpperCase() !== normalizedCode) {
          return res.status(400).json({ error: "That verification code is invalid or expired" });
        }
        if (dbUser.emailVerificationExpires && Date.now() > new Date(dbUser.emailVerificationExpires).getTime()) {
          return res.status(400).json({ error: "That verification code is invalid or expired" });
        }

      // Use the DB user's id for the update below.
      user = await prisma.user.update({
        where: { id: dbUser.id },
        data: { emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null },
      });
    } else {
      if (Date.now() > token.expiresAt) {
        verificationTokens.delete(`${normalizedEmail}:${normalizedCode}`);
        return res.status(400).json({ error: "That verification code is invalid or expired" });
      }

      user = await prisma.user.update({
        where: { id: token.userId },
        data: { emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null },
      });
    }

    await prisma.activityLog.create({ data: { userId: user.id, action: "email_verified" } });
    verificationTokens.delete(`${normalizedEmail}:${normalizedCode}`);

    const loginToken = signToken(user);
    return res.json({
      ok: true,
      message: "Email verified successfully",
      token: loginToken,
      user: publicUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to verify email" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// GET /api/auth/verify-email?token=...
// This endpoint is intended to be used from verification links sent to students.
router.get("/verify-email", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ error: "token is required" });

    const user = await prisma.user.findFirst({ where: { emailVerificationCode: token } });
    if (!user) return res.status(400).json({ error: "That verification token is invalid or expired" });

    if (user.emailVerificationExpires && Date.now() > new Date(user.emailVerificationExpires).getTime()) {
      return res.status(400).json({ error: "That verification token is invalid or expired" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null },
    });

    await prisma.activityLog.create({ data: { userId: updated.id, action: "email_verified" } });

    const loginToken = signToken(updated);

    // Redirect to frontend with token so the client can sign the user in.
    const frontend = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_API_URL || "http://localhost:19006";
    const redirectUrl = `${String(frontend).replace(/\/$/, "")}/verified?token=${encodeURIComponent(loginToken)}`;
    return res.redirect(302, redirectUrl);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to verify token" });
  }
});

// Start Google OAuth flow. Redirects to Google's consent screen.
router.get(
  "/oauth/google",
  (req, res, next) => {
    // Kick off passport Google OAuth flow. session=false to remain stateless.
    passport.authenticate("google", { scope: ["profile", "email"], session: false })(req, res, next);
  }
);

// Google OAuth callback — marks the user's email as verified and redirects to frontend with a token.
router.get("/oauth/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, (err, user) => {
    if (err || !user) {
      console.error("OAuth callback error:", err);
      return res.status(400).json({ error: "OAuth verification failed" });
    }

    const loginToken = signToken(user);
    const frontend = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_API_URL || "http://localhost:19006";
    const redirectUrl = `${String(frontend).replace(/\/$/, "")}/verified?token=${encodeURIComponent(loginToken)}`;
    return res.redirect(302, redirectUrl);
  })(req, res, next);
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

// Change current user's password. Requires authentication via token.
router.patch('/me/password', requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
    await prisma.activityLog.create({ data: { userId: req.user.id, action: 'password_changed' } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password failed', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
