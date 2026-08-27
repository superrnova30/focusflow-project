require("dotenv").config();
const express = require("express");
const path = require("path");
const net = require("net");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/tasks");
const aiChatRoutes = require("./routes/ai_chat");
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
const { sendDailyReminders } = require("./lib/reminders");

const app = express();

const passport = require("passport");

// mounted AI routes (study pack + chat)
app.use("/api/ai", aiRoutes);
app.use("/api/ai", aiChatRoutes);

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "50mb" })); // generous limit for pasted notes + base64 PDFs

// Initialize passport for OAuth endpoints (strategies configured in routes)
app.use(passport.initialize());

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

// Central error handler — keeps stack traces out of API responses
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

function getAvailablePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(getAvailablePort(port + 1));
      } else {
        reject(err);
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(port));
    });
    server.listen(port);
  });
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
  // Bind to 0.0.0.0 so the server is reachable from other devices on the LAN
  let server = app.listen(port, "0.0.0.0", () => {
    console.log(`FocusFlow API listening on http://localhost:${port} (bound to 0.0.0.0)`);
  });

  // Log unhandled errors to avoid silent crashes during dev.
  process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  server.on('error', async (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, searching for another port...`);
      try {
        const newPort = await getAvailablePort(port + 1);
        server.close(() => {
          server = app.listen(newPort, '0.0.0.0', () => {
            console.log(`FocusFlow API listening on http://localhost:${newPort} (bound to 0.0.0.0)`);
          });
        });
      } catch (e) {
        console.error('Failed to bind to a new port', e);
      }
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
