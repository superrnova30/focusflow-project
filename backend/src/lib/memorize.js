const { levelForXp, xpWithinLevel, xpForNextLevel, LEVEL_XP_STEP, heartsRefillAtFrom } = require("./gamification");

const MAX_HEARTS = 5;
const STARTING_HINTS = 3;
const XP_PER_CORRECT = 200;
const HALF_XP_WITH_HINT3 = 100;
const HEART_REFILL_MS = 24 * 60 * 60 * 1000;
const LIGHTNING_SECONDS = 15;

const DEFAULT_MEMORIZE_SETTINGS = {
  questionStyle: "mixed",
  hideOptionsInitially: true,
  lightningRounds: false,
  spellingMistakesAllowed: true,
};

const VALID_QUESTION_STYLES = ["mixed", "mcq", "typing", "flashcards"];

function normalizeMemorizeSettings(raw) {
  const base = { ...DEFAULT_MEMORIZE_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  if (VALID_QUESTION_STYLES.includes(raw.questionStyle)) base.questionStyle = raw.questionStyle;
  if (typeof raw.hideOptionsInitially === "boolean") base.hideOptionsInitially = raw.hideOptionsInitially;
  if (typeof raw.lightningRounds === "boolean") base.lightningRounds = raw.lightningRounds;
  if (typeof raw.spellingMistakesAllowed === "boolean") base.spellingMistakesAllowed = raw.spellingMistakesAllowed;
  return base;
}

function normalizeAnswer(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function answersMatch(userAnswer, correctAnswer, allowSpellingMistakes) {
  const user = normalizeAnswer(userAnswer);
  const correct = normalizeAnswer(correctAnswer);
  if (!user || !correct) return false;
  if (user === correct) return true;
  if (correct.includes(user) && user.length >= Math.min(4, correct.length * 0.6)) return true;
  if (user.includes(correct) && correct.length >= Math.min(4, user.length * 0.6)) return true;
  if (allowSpellingMistakes) {
    const maxDist = correct.length <= 4 ? 1 : correct.length <= 8 ? 2 : 3;
    if (levenshtein(user, correct) <= maxDist) return true;
  }
  return false;
}

function pickQuestionType(settings, seed) {
  const style = settings.questionStyle || "mixed";
  if (style === "mcq") return "mcq";
  if (style === "typing") return "typing";
  if (style === "flashcards") return "flashcard";
  const types = ["mcq", "typing", "flashcard"];
  return types[Math.abs(seed) % types.length];
}

function buildClue(answer) {
  const text = String(answer || "").trim();
  if (!text) return "Think about the core concept from this deck.";
  const words = text.split(/\s+/);
  if (words.length >= 2) {
    return `Clue: ${words.length} words · starts with "${words[0].charAt(0).toUpperCase()}" · ends with "${words[words.length - 1].slice(-1)}"`;
  }
  if (text.length > 4) {
    return `Clue: ${text.length} letters · starts with "${text.charAt(0).toUpperCase()}"`;
  }
  return "Clue: a short phrase related to this topic.";
}

function buildGameState(user, premiumActive) {
  const hearts = user.hearts ?? MAX_HEARTS;
  const hints = premiumActive ? 999 : (user.hints || 0) + (user.bonusHints || 0);
  const heartsBlocked = !premiumActive && hearts <= 0;
  let heartsRefillAt = null;
  if (heartsBlocked) {
    heartsRefillAt = heartsRefillAtFrom(user);
  }
  return {
    xp: user.xp,
    hearts,
    hints,
    coins: user.coins || 0,
    unlimitedHearts: premiumActive,
    unlimitedHints: premiumActive,
    heartsBlocked,
    heartsRefillAt,
    level: {
      current: user.currentLevel || levelForXp(user.xp),
      xpWithinLevel: xpWithinLevel(user.xp),
      xpForNext: xpForNextLevel(user.xp),
      step: LEVEL_XP_STEP,
    },
    settings: normalizeMemorizeSettings(user.memorizeSettings),
  };
}

module.exports = {
  MAX_HEARTS,
  STARTING_HINTS,
  XP_PER_CORRECT,
  HALF_XP_WITH_HINT3,
  HEART_REFILL_MS,
  LIGHTNING_SECONDS,
  DEFAULT_MEMORIZE_SETTINGS,
  VALID_QUESTION_STYLES,
  normalizeMemorizeSettings,
  normalizeAnswer,
  answersMatch,
  pickQuestionType,
  buildClue,
  buildGameState,
};
