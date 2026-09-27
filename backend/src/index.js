require("dotenv").config();
const express = require("express");
const path = require("path");
const net = require("net");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/tasks");
const aiChatRoutes = require("./routes/ai_chat");
const aiConversationRoutes = require("./routes/ai_conversations");
const aiDebugRoutes = require("./routes/ai_debug");
const subjectRoutes = require("./routes/subjects");
const sessionRoutes = require("./routes/sessions");
const materialRoutes = require("./routes/materials");
const quizRoutes = require("./routes/quizzes");
const flashcardRoutes = require("./routes/flashcards");
const noteRoutes = require("./routes/notes");
const gameRoutes = require("./routes/game");
const adminRoutes = require("./routes/admin");
const pushRoutes = require("./routes/push");
const aiRoutes = require("./routes/ai");
const premiumRoutes = require("./routes/premium");
const { sendDailyReminders } = require("./lib/reminders");
const { isEmailConfigured, verifyEmailDelivery } = require("./lib/mailer");

const app = express();

const passport = require("passport");

// Apply CORS and JSON body parsing middleware early so all routes,
// including debug routes mounted before other routers, receive parsed bodies.
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

// Capture the raw request body for improved error messages when JSON parsing fails.
// `verify` is called with the raw bytes before body-parser transforms them.
app.use(express.json({
  limit: "50mb",
  verify: (req, _res, buf) => {
    try {
      req.rawBody = buf && buf.toString ? buf.toString() : undefined;
    } catch (e) {
      req.rawBody = undefined;
    }
  },
})); // generous limit for pasted notes + base64 PDFs

// Also accept urlencoded bodies from debug clients that post JS-style object
// literals without proper JSON quoting.
app.use(express.urlencoded({
  extended: true,
  limit: "50mb",
  verify: (req, _res, buf) => {
    try {
      req.rawBody = buf && buf.toString ? buf.toString() : req.rawBody;
    } catch (e) {
      // ignore
    }
  },
}));

// Initialize passport for OAuth endpoints (strategies configured in routes)
app.use(passport.initialize());

// mounted AI routes (study pack + chat)
// Optional debug-only route for local testing. Mount it BEFORE the
// auth-protected AI routes so router-level `requireAuth` doesn't intercept
// requests intended for the debug endpoint. Enable by setting
// ENABLE_AI_DEBUG=true in your backend .env (do NOT enable in production).
if (String(process.env.ENABLE_AI_DEBUG).toLowerCase() === 'true') {
  console.log('AI debug routes enabled at /api/ai/debug-chat');
  app.use('/api/ai', aiDebugRoutes);
}

app.use("/api/ai", aiRoutes);
app.use("/api/premium", premiumRoutes);
// History endpoints are declared before the chat router so /ai/conversations
// is never swallowed by a broader /ai handler.
app.use("/api/ai", aiConversationRoutes);
app.use("/api/ai", aiChatRoutes);

// Serve uploaded PDFs so fileUrl links resolve to a real file.
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/health", (req, res) => res.json({ ok: true, service: "focusflow-api" }));
// Provide an alias under /api so clients that prepend `/api` to the base URL
// (e.g. `http://host:4000/api`) can check health at `/api/health`.
app.get("/api/health", (req, res) => res.json({ ok: true, service: "focusflow-api" }));

app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/flashcards", flashcardRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/push", pushRoutes);

// Fallback 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Central error handler — keeps stack traces out of API responses and
// returns a clearer message for invalid JSON payloads.
app.use((err, req, res, next) => {
  // If body-parser failed to parse JSON, it sets `type: 'entity.parse.failed'`.
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    console.error('JSON parse error for request:', req.method, req.originalUrl);
    console.error('Raw body:', typeof req.rawBody === 'string' ? req.rawBody : '<unavailable>');
    return res.status(400).json({
      error: 'Invalid JSON payload',
      message: err.message,
      rawBody: typeof req.rawBody === 'string' ? req.rawBody : undefined,
    });
  }

  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

async function getAvailablePort(startPort, maxAttempts = 25) {
  let port = Number(startPort);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const isTaken = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", (err) => {
        resolve(err && err.code === "EADDRINUSE");
      });
      server.once("listening", () => {
        server.close(() => resolve(false));
      });
      server.listen(port, "0.0.0.0");
    });

    if (!isTaken) return port;
    port += 1;
  }

  throw new Error(`No available port found starting from ${startPort}`);
}

// Global handlers to prevent the server from crashing on unexpected errors
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

async function start() {
  const requestedPort = Number(process.env.PORT || 4000);
  const port = await getAvailablePort(requestedPort);
  console.log(`Starting FocusFlow API on port ${port} after checking for occupied ports...`);

  // Bind to 0.0.0.0 so the server is reachable from other devices on the LAN.
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`FocusFlow API listening on http://localhost:${port} (bound to 0.0.0.0)`);
    // Log AI provider configuration so devs can verify keys are present without
    // printing the keys themselves.
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
    const openaiConfigured = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
    console.log(`AI providers - Gemini configured: ${geminiConfigured}, OpenAI configured: ${openaiConfigured}`);
    if (!isEmailConfigured()) {
      console.warn("[mailer] Email is not configured — verification codes cannot be sent.");
    } else {
      verifyEmailDelivery()
        .then((result) => {
          console.log(`[mailer] Email delivery ready (${result.provider})`);
        })
        .catch((err) => {
          console.error("[mailer] Email delivery check failed:", err.message || err);
        });
    }
  });

  // Log unhandled errors to avoid silent crashes during dev.
  process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} became occupied after startup. Please free it or set PORT to a different value.`);
    } else {
      console.error('Server error', err);
    }
  });

  // Daily reminder scheduler: only enable when explicitly requested via
  // ENABLE_REMINDERS=true in the environment. This prevents intermittent
  // crashes during development when external services (push tokens, network)
  // might be unavailable.
  let reminderInterval;
  if (String(process.env.ENABLE_REMINDERS).toLowerCase() === 'true') {
    reminderInterval = setInterval(async () => {
      try {
        const now = new Date();
        const hour = String(now.getHours()).padStart(2, "0");
        const minute = String(now.getMinutes()).padStart(2, "0");
        const currentTime = `${hour}:${minute}`;
        if (currentTime === "09:00" || currentTime === "18:00") {
          const result = await sendDailyReminders();
          console.log(`Daily reminders sent: ${result.sent} to ${result.checked} user(s)`);
        }
      } catch (err) {
        console.error("Reminder scheduler error:", err && err.message ? err.message : err);
      }
    }, 60 * 1000);
  } else {
    console.log('Reminder scheduler disabled (ENABLE_REMINDERS not true)');
  }

  // Allow clean shutdown.
  process.on("SIGINT", () => {
    if (reminderInterval) clearInterval(reminderInterval);
    process.exit(0);
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  // Do not exit the process; let nodemon keep it alive for debugging.
});
