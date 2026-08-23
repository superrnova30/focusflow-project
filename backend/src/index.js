require("dotenv").config();
const express = require("express");
const path = require("path");
const net = require("net");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/tasks");
const subjectRoutes = require("./routes/subjects");
const sessionRoutes = require("./routes/sessions");
const materialRoutes = require("./routes/materials");
const quizRoutes = require("./routes/quizzes");
const flashcardRoutes = require("./routes/flashcards");
const noteRoutes = require("./routes/notes");
const gameRoutes = require("./routes/game");
const adminRoutes = require("./routes/admin");
const pushRoutes = require("./routes/push");
const { sendDailyReminders } = require("./lib/reminders");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "50mb" })); // generous limit for pasted notes + base64 PDFs

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

async function start() {
  const requestedPort = Number(process.env.PORT || 4000);
  const port = await getAvailablePort(requestedPort);
  // Bind to 0.0.0.0 so the server is reachable from other devices on the LAN
  app.listen(port, "0.0.0.0", () => {
    console.log(`FocusFlow API listening on http://localhost:${port} (bound to 0.0.0.0)`);
  });

  // Daily reminder scheduler: every 60s check if it's time to send reminders.
  // For a real deployment, replace with a cron at the reminderTime hour. This
  // lightweight poll keeps the demo self-contained without an extra scheduler.
  const reminderInterval = setInterval(async () => {
    try {
      const now = new Date();
      const hour = String(now.getHours()).padStart(2, "0");
      const minute = String(now.getMinutes()).padStart(2, "0");
      const currentTime = `${hour}:${minute}`;
      // Only send during the hour users commonly set (default 18:00), but we
      // fire once per minute near that window to keep it simple.
      if (currentTime === "09:00" || currentTime === "18:00") {
        const result = await sendDailyReminders();
        console.log(`Daily reminders sent: ${result.sent} to ${result.checked} user(s)`);
      }
    } catch (err) {
      // Don't crash the server if a reminder batch fails.
      console.error("Reminder scheduler error:", err.message);
    }
  }, 60 * 1000);

  // Allow clean shutdown.
  process.on("SIGINT", () => {
    clearInterval(reminderInterval);
    process.exit(0);
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
