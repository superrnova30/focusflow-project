const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");

const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
const client = hasOpenAIKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const geminiClient = hasGeminiKey ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
// Study packs / quizzes ask the model for large JSON payloads. A low cap makes
// the model stop mid-string (finishReason MAX_TOKENS), which breaks JSON.parse
// and silently degraded every study-pack request to the local template. Keep a
// generous default so full responses complete in one call.
const DEFAULT_MAX_OUTPUT_TOKENS = Number(process.env.AI_MAX_OUTPUT_TOKENS || 4096);
const { clipStudySource, hasCompleteJsonObject } = require("./documentText");
const {
  normalizeGeneratedCards,
  assembleTutorLesson,
  canonicalAnswer,
  displayHighlight,
  sanitizeQuizList,
} = require("./flashcardAnswer");

function looksCutOff(text) {
  const value = String(text || "").trim();
  if (!value || value.length < 180) return false;
  return !/[.!?]["')\]]?\s*$/.test(value);
}

async function continueIncompleteAnswer(provider, prompt, previousText) {
  if (!provider || !previousText || !looksCutOff(previousText)) return previousText;

  const continuationPrompt = [
    "The previous answer appears incomplete or cut off. Continue only from the last sentence and finish the explanation completely.",
    "Do not repeat the opening or reintroduce the same summary. Build on the existing response and complete it with a clear ending or takeaway.",
    "Keep the voice natural and educational, and ensure the final answer is complete and coherent.",
    "Previous response:", previousText.slice(-1200),
  ].join("\n");

  try {
    if (provider === "gemini") {
      const { generateContentWithRetry } = require('./genai_helper');
      const response = await generateContentWithRetry(geminiClient, {
        model: GEMINI_MODEL,
        contents: continuationPrompt,
        config: { temperature: 0.4, maxOutputTokens: 1200 },
      });
      const nextText = extractGeminiText(response);
      if (nextText && nextText.length > 40) {
        return `${previousText.trim()} ${nextText.trim()}`;
      }
    }
  } catch (err) {
    console.warn('AI continuation failed:', err && err.message ? err.message : err);
  }

  return previousText;
}

function buildFallbackStudyPack(subject, notes) {
  const lines = (notes || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const concepts = lines.length
    ? lines.slice(0, 5).map((line) => line.replace(/^[-*•]\s*/, ""))
    : ["Core ideas", "Important definitions", "Practice examples"];
  const keyConcepts = concepts.slice(0, 5);
  const summary = `This study pack focuses on ${subject || "the uploaded topic"}. The notes highlight the main ideas and suggest a structured review approach so the material is easier to remember and practice.`;
  const learningObjectives = [
    `Explain the main ideas covered in ${subject || "this topic"}.`,
    "Define the key vocabulary and connect it to examples.",
    "Apply the concepts to solve a practice problem.",
  ];
  const importantTerms = keyConcepts.slice(0, 4).map((concept) => ({
    term: concept,
    definition: `A central idea in ${subject || "this topic"}. Review it and connect it to a concrete example.`,
  }));
  const studyTips = [
    `Review the main ideas in ${subject || "the topic"} first before testing yourself.`,
    "Create short memory cues for each concept and revisit them later in the day.",
    "Practice with a few recall questions to strengthen retention.",
  ];
  const flashcards = normalizeGeneratedCards(
    keyConcepts.slice(0, 6).map((concept) => {
      const phrase = String(concept || "")
        .replace(/\s+/g, " ")
        .trim()
        .split(/\s+/)
        .slice(0, 5)
        .join(" ");
      return {
        front: `Identify a key idea in ${subject || "this topic"}.`,
        back: `${phrase}. This is a central idea in ${subject || "this topic"}. Review it and connect it to a concrete example.`,
        answerHighlight: phrase,
        explanation: `The highlighted answer is "${phrase}". It is a central idea in ${subject || "this topic"}.`,
      };
    })
  );
  const quizTerms = keyConcepts.slice(0, 4);
  const quiz = [
    ...sanitizeQuizList(
      quizTerms.map((concept, index) => ({
        type: "mcq",
        question: `Which idea is central to ${subject || "this topic"}?`,
        options: [
          concept,
          ...quizTerms.filter((_, idx) => idx !== index),
          `${subject || "this topic"} history`,
          `${subject || "this topic"} vocabulary`,
        ].slice(0, 4),
        answer: concept,
      }))
    ),
    { type: "short_answer", question: "Explain one key idea in your own words.", answer: "A concise explanation is enough." },
    { type: "identification", question: "Name one important term from the notes.", answer: quizTerms[0] || "Use the main term that appears in the notes." },
  ];
  const shortAnswer = quiz
    .filter((q) => q.type === "short_answer")
    .map((q) => ({ question: q.question, answer: q.answer }));
  const practiceQuestions = [
    { question: `Summarize the most important point in ${subject || "these notes"} in one or two sentences.`, answer: "Focus on the central idea and the main supporting details." },
    { question: "Write one practice problem based on the notes and solve it.", answer: "Use the key concepts from the notes to build and solve the problem." },
  ];

  return { summary, keyConcepts, learningObjectives, importantTerms, studyTips, flashcards, quiz, shortAnswer, practiceQuestions };
}

function buildFallbackCoachInsight(payload) {
  const focusMinutes = payload?.totalStudyMinutes || 0;
  const completionRate = payload?.completionRate || 0;
  const subjectFocus = Object.entries(payload?.subjectTotals || {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return {
    summary: `You have logged ${focusMinutes} minutes of focused study recently. Your progress looks promising, especially if you keep building on that consistency.`,
    strengths: [
      completionRate >= 50 ? "You are completing a strong share of your planned tasks." : "You are showing steady effort in your study routine.",
      subjectFocus.length ? `You are spending the most time on ${subjectFocus[0][0]}.` : "You are exploring your study habits with useful data.",
    ],
    improvementAreas: [
      "Try to protect a few more uninterrupted blocks of study time each week.",
      "Add one short review session at the end of the day to reinforce what you learned.",
    ],
    focusTrend: "Your study rhythm is most effective when sessions are regular and you keep breaks short and predictable.",
    recommendations: [
      "Block one recurring study window into your week for deep focus.",
      "Keep breaks at 5-10 minutes after every focused session.",
      "Review one subject at the end of each day to reinforce retention.",
    ],
    subjectFocus: subjectFocus.length ? subjectFocus.map(([name]) => `Give ${name} a bit more attention this week.`) : ["Spend a little extra time revisiting your main subjects."],
    weeklySummary: "A steady routine with regular review will help you improve over the next week.",
    studyTips: [
      "Use short recall drills after each study session.",
      "Keep your notes in a simple format so you can review them quickly.",
      "Aim for consistent sessions rather than occasional marathons.",
    ],
    bestStudyTime: "The best time to study is usually when your attention is highest and distractions are lowest.",
    motivation: "You are building momentum — keep going.",
  };
}

/**
 * Calls the AI provider with a system prompt that demands raw JSON back,
 * and parses the result. Throws if the response isn't valid JSON so callers
 * can return a clean 502 to the client instead of silently succeeding
 * with garbage data.
 */
function getResponseText(response) {
  if (!response) return "";
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  if (Array.isArray(response.output)) {
    return response.output
      .filter((item) => item?.type === "message")
      .flatMap((item) => item.content || [])
      .filter((content) => content?.type === "output_text" && typeof content.text === "string")
      .map((content) => content.text)
      .join("")
      .trim();
  }
  return "";
}

function extractJsonString(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  if (!cleaned) return cleaned;

  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) return cleaned;

  // Walk the string tracking brace depth and whether we're inside a quoted
  // string, so we can stop at the FIRST complete top-level object. Using
  // lastIndexOf("}") previously broke when the model appended prose after the
  // JSON ("Unexpected non-whitespace character after JSON") — it grabbed a
  // stray brace from the trailing text. String-awareness also prevents treating
  // braces/escaped quotes inside string values as structure.
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(firstBrace, i + 1);
      }
    }
  }

  // No balanced object found (likely truncated) — return what we have so the
  // caller's sanitizer/repair path can attempt recovery.
  return cleaned.slice(firstBrace);
}

/**
 * Gemini (and other models) frequently emit JSON that contains literal
 * control characters inside string values — most often raw newlines/tabs in
 * long fields like "summary" or "definition". JSON.parse rejects those with
 * "Bad control character in string literal", which previously forced every
 * study-pack request onto the local template fallback. This escapes any raw
 * control character that is inside a string so the payload parses cleanly.
 *
 * It tracks whether we're inside a quoted string and escapes unescaped
 * control chars (\u0000-\u001F) there; structural whitespace between tokens is
 * left untouched. Already-escaped sequences (\n, \") are preserved.
 */
function sanitizeJsonControlChars(text) {
  const value = String(text || "");
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];

    if (inString) {
      if (escaped) {
        // Keep the escaped char as-is (e.g. the n in \n).
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        // Escape raw control characters that are illegal inside JSON strings.
        if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else if (ch === "\t") out += "\\t";
        else out += `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
      out += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
    }
    out += ch;
  }

  return out;
}

/**
 * Parse model-produced JSON defensively: first try as-is, then retry after
 * escaping raw control characters that models sometimes leave inside strings.
 */
function safeParseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch (firstErr) {
    const sanitized = sanitizeJsonControlChars(text);
    if (sanitized !== text) {
      try {
        return JSON.parse(sanitized);
      } catch (secondErr) {
        // fall through and rethrow the original error for clearer messaging
      }
    }

    // Last resort: the model was cut off mid-response (e.g. MAX_TOKENS), so
    // close any dangling string/array/object and try once more. This salvages a
    // partially-complete study pack instead of discarding a usable response.
    try {
      const repaired = closeTruncatedJson(sanitized);
      if (repaired && repaired !== sanitized) {
        return JSON.parse(repaired);
      }
    } catch (repairErr) {
      // fall through and rethrow the original error for clearer messaging
    }

    throw firstErr;
  }
}

/**
 * Best-effort repair of JSON that was truncated mid-token: closes an open
 * string, then balances any open arrays/objects. Only used as a final fallback
 * when a model response cannot be parsed as-is.
 */
function closeTruncatedJson(text) {
  let value = String(text || '').trim();
  if (!value) return value;

  // Drop a trailing incomplete token (e.g. `"term": "unfinished`).
  let inString = false;
  let escaped = false;
  const stack = [];
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Trim a dangling separator so the appended closers produce valid JSON.
  value = value.replace(/[\s,]+$/, '');
  if (inString) value += '"';

  const closers = stack
    .reverse()
    .map((open) => (open === '{' ? '}' : ']'))
    .join('');
  return value + closers;
}

function extractGeminiText(response) {
  if (!response) return "";

  if (typeof response.text === "string" && response.text.trim()) return response.text.trim();
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text.trim();

  const visited = new Set();
  function findText(obj) {
    if (!obj || visited.has(obj)) return null;
    if (typeof obj === 'string' && obj.trim()) return obj.trim();
    if (typeof obj !== 'object') return null;
    visited.add(obj);
    const keys = ['output_text', 'text', 'content', 'parts', 'outputs', 'candidates', 'message', 'messages'];
    for (const k of keys) {
      if (obj[k]) {
        const found = findText(obj[k]);
        if (found) return found;
      }
    }
    for (const k in obj) {
      try {
        const found = findText(obj[k]);
        if (found) return found;
      } catch (e) {}
    }
    return null;
  }

  const text = findText(response) || '';
  if (!text) console.warn('extractGeminiText(lib): no text found in response');
  return text;
}

async function generateJSON({ system, prompt, maxTokens = 1600, fallback, largeOutput = false, model }) {
  if (!client && !geminiClient) {
    if (fallback) return fallback(prompt);
    throw new Error("AI provider is not configured. Set GEMINI_API_KEY or OPENAI_API_KEY to enable AI features.");
  }

  try {
    let responseText = "";
    const outputTokens = largeOutput ? Math.max(maxTokens, DEFAULT_MAX_OUTPUT_TOKENS) : maxTokens;

    if (geminiClient) {
      const { generateContentWithRetry } = require('./genai_helper');
      const response = await generateContentWithRetry(geminiClient, {
        model: model || GEMINI_MODEL,
        contents: `${system}\n\n${prompt}`,
        config: { temperature: 0.2, maxOutputTokens: outputTokens },
      });
      responseText = extractGeminiText(response);
    } else {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: outputTokens,
        instructions: system,
        input: prompt,
      });
      responseText = getResponseText(response);
    }

    // JSON payloads end with `}`, which the prose cutoff check treats as
    // incomplete. Skip the extra continuation call when we already have a
    // complete object — that second Gemini request was doubling import time.
    const alreadyCompleteJson = hasCompleteJsonObject(extractJsonString(responseText));
    if (geminiClient && !alreadyCompleteJson && looksCutOff(responseText)) {
      responseText = await continueIncompleteAnswer('gemini', prompt, responseText);
    }

    const parsedText = extractJsonString(responseText);
    if (!parsedText) {
      // Attempt a lightweight "repair" call: ask the model to re-output only
      // the requested JSON object based on its previous response. This helps
      // when the model returns markdown or explanatory text instead of the
      // raw JSON we asked for.
      if (geminiClient) {
        try {
          const { generateContentWithRetry: retryGen } = require('./genai_helper');
          const repairPrompt =
            `${system}\n\n${prompt}\n\nPrevious response:\n${responseText}\n\n` +
            "You previously returned explanatory text. Now please output ONLY the exact JSON object requested earlier, with no surrounding text or markdown fences.";

          const repairResp = await retryGen(geminiClient, {
            model: GEMINI_MODEL,
            contents: repairPrompt,
            config: { temperature: 0.0, maxOutputTokens: Math.min(maxTokens, 1200) },
          });
          const repairText = extractGeminiText(repairResp);
          const repaired = extractJsonString(repairText);
          if (repaired) {
            return safeParseModelJson(repaired);
          }
        } catch (e) {
          // ignore and fall through to original error handling/fallback
          console.warn('AI repair attempt failed:', e && e.message);
        }
      }

      throw new Error("AI returned empty response text.");
    }

    return safeParseModelJson(parsedText);
  } catch (err) {
    const message = err && (err.message || String(err));
    const isRateLimit = err && (err.status === 429 || /429|rate limit/i.test(message));

    if (fallback) {
      console.warn("AI provider failed, using built-in local fallback:", message);
      return fallback(prompt);
    }

    console.error("AI generation failed:", err);

    if (isRateLimit) {
      throw new Error("The AI service is rate-limited right now. Please try again in a moment.");
    }

    throw new Error("The AI service is currently unavailable. Please try again in a moment.");
  }
}

async function generateStudyPack(subject, notes) {
  const hasNotes = notes && notes.trim().length > 0;
  const system =
    "You are an expert study-material assistant. You will receive a topic (and possibly lecture notes) from a student. " +
    "Respond with ONLY a raw JSON object (no markdown fences, no preamble) with exactly these keys: " +
    '{"summary": string (3-4 sentences), ' +
    '"keyConcepts": array of 4-6 short strings, ' +
    '"learningObjectives": array of 3-4 short strings, ' +
    '"importantTerms": array of 4-6 objects {"term": string, "definition": string}, ' +
    '"studyTips": array of 3 short strings, ' +
    '"flashcards": array of 6-8 objects {"front": string (a question), "back": string (the full answer), "answerHighlight": string (exact complete phrase copied from back that answers front), "explanation": string}, ' +
    '"quiz": array of 6-8 objects mixing types. Each: {"type": "mcq"|"true_false"|"identification"|"short_answer", ' +
    '"question": string, "options": array of 4 strings (ONLY for mcq), "answer": string}, ' +
    '"shortAnswer": array of 3 objects {"question": string, "answer": string}, ' +
    '"practiceQuestions": array of 3 objects {"question": string, "answer": string}}.' +
    (hasNotes
      ? "Base everything strictly on the provided notes. No extra keys, no explanations outside the JSON."
      : "If only a topic is provided (no notes), use your general knowledge to create accurate, high-quality study materials about that topic. No extra keys, no explanations outside the JSON.");

  const pack = await generateJSON({
    system,
    prompt: hasNotes
      ? `Subject: ${subject}\n\nNotes:\n${clipStudySource(notes, 16000)}`
      : `Topic: ${subject}\n\nGenerate a complete study pack for this topic.`,
    largeOutput: true,
    fallback: () => buildFallbackStudyPack(subject, notes),
  });
  const flashcards = normalizeGeneratedCards(pack?.flashcards || []);
  const quiz = sanitizeQuizList(pack?.quiz || []);
  return {
    ...pack,
    flashcards: flashcards.length ? flashcards : normalizeGeneratedCards(buildFallbackStudyPack(subject, notes).flashcards),
    quiz: quiz.length ? quiz : sanitizeQuizList(buildFallbackStudyPack(subject, notes).quiz),
  };
}

function buildFallbackFlashcards(topic, notes) {
  const hasNotes = notes && notes.trim().length > 0;
  const concepts = hasNotes
    ? notes
        .split(/\n+/)
        .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
        .filter(Boolean)
        .slice(0, 8)
    : [`Core definition of ${topic}`, `Key principles of ${topic}`, `Important examples of ${topic}`];
  const subject = String(topic || "this topic").trim() || "this topic";
  const cards = normalizeGeneratedCards(
    concepts.slice(0, 8).map((concept) => {
      const phrase = String(concept || "")
        .replace(/\s+/g, " ")
        .trim()
        .split(/\s+/)
        .slice(0, 5)
        .join(" ");
      return {
        front: `Identify a key idea in ${subject}.`,
        back: `${phrase}. This is a central idea in ${subject}. Review it and connect it to an example.`,
        answerHighlight: phrase,
        explanation: `The highlighted answer is "${phrase}". Restate it in your own words and connect it to an example.`,
      };
    })
  );
  return { flashcards: cards };
}

// Magic Import — generate flashcards from a topic, notes, or study-pack text.
const FLASHCARD_SYSTEM =
  "You are an expert flashcard generator. " +
  "You will receive a topic and/or study content from a student. " +
  "Respond with ONLY a raw JSON object (no markdown fences, no preamble) with exactly this shape: " +
  '{"flashcards": array of 8-12 objects {"front": string (a clear question), "back": string (the full answer or definition), "answerHighlight": string (the exact complete phrase copied verbatim from back that directly answers front), "explanation": string (2-3 sentences explaining why that highlighted phrase is correct)}}. ' +
  "Every card MUST include all four fields. Identify the correct answer while writing the card and store it in answerHighlight, separately from the full back. " +
  "Read the full question and the full answer before choosing answerHighlight. " +
  "answerHighlight MUST be an exact contiguous substring of back and must be enough, by itself, to answer front. " +
  "Never invent a different answer. Never highlight a fragment, trailing article, or unrelated words (bad: \"the cell\", \"The movement of\", \"class-based\"). " +
  "Do NOT highlight the entire back unless the back is already a short term (about 1-5 words). " +
  "If the answering phrase is two, three, or four words, copy the entire phrase. Never copy only part of it. " +
  "If the back does not already contain a complete answering phrase, rewrite the back so it does, then copy that phrase into answerHighlight. Never leave answerHighlight empty. " +
  'Example: front "What is Java?", back "A high-level, class-based, object-oriented programming language designed to have as few implementation dependencies as possible.", answerHighlight "programming language". ' +
  'Example: front "What is the powerhouse of the cell?", back "The mitochondria is the powerhouse of the cell.", answerHighlight "mitochondria". ' +
  "Extract the most important concepts, definitions, and facts.";

async function generateFlashcards(topic, notes) {
  const hasNotes = notes && notes.trim().length > 0;
  const prompt = hasNotes
    ? `Topic: ${topic || "General"}\n\nContent:\n${notes}`
    : `Topic: ${topic || "General"}\n\nGenerate flashcards for this topic.`;

  const run = (system) =>
    generateJSON({
      system,
      prompt,
      maxTokens: 2800,
      fallback: () => buildFallbackFlashcards(topic, notes),
    });

  const pack = await run(FLASHCARD_SYSTEM);
  const list = Array.isArray(pack) ? pack : pack?.flashcards;
  let flashcards = normalizeGeneratedCards(list);
  if (!flashcards.length) {
    const retry = await run(
      FLASHCARD_SYSTEM +
        " Retry: every card must have a complete answerHighlight copied from back. Rewrite weak cards into a What is X / X is Y form."
    );
    flashcards = normalizeGeneratedCards(Array.isArray(retry) ? retry : retry?.flashcards);
  }
  if (!flashcards.length) return buildFallbackFlashcards(topic, notes);
  return { flashcards };
}

async function generateCoachInsight(payload) {
  const system =
    "You are an encouraging, sharp study-productivity coach. " +
    "You will receive a JSON object describing a student's recent study activity. " +
    "Respond with ONLY a raw JSON object with exactly these keys: " +
    '{"summary": string (2 sentences), "strengths": array of 2 short strings, "improvementAreas": array of 2 short strings, ' +
    '"focusTrend": string (1 sentence), "recommendations": array of 3 short actionable strings, ' +
    '"subjectFocus": array of 2 short strings, "weeklySummary": string (1 sentence), ' +
    '"studyTips": array of 3 short strings, "bestStudyTime": string (1 sentence), ' +
    '"motivation": string (1 upbeat sentence, max 1 emoji)}. No extra keys.';

  return generateJSON({
    system,
    prompt: JSON.stringify(payload),
    fallback: () => buildFallbackCoachInsight(payload),
  });
}

function buildFallbackStudyNotes(topic, notes) {
  const hasNotes = notes && notes.trim().length > 0;
  const lines = hasNotes
    ? notes.split(/\n+/).map((l) => l.trim().replace(/^[-*•]\s*/, "")).filter(Boolean).slice(0, 8)
    : [];

  const summary = hasNotes
    ? `These notes cover ${topic || "the provided topic"}. The key ideas have been organized into a structured study guide to help you review efficiently.`
    : `This study guide covers ${topic || "the requested topic"} with a structured overview of the most important concepts and definitions.`;

  const keyConcepts = (lines.length ? lines.slice(0, 5) : [`Core principles of ${topic || "the topic"}`, `Key definitions`, `Important examples`, `Practical applications`, `Common misconceptions`]).map((c) => c.length > 80 ? c.slice(0, 77) + "..." : c);

  const importantTerms = keyConcepts.slice(0, 4).map((concept) => ({
    term: concept.split(" ").slice(0, 3).join(" ") || "Key term",
    definition: `A central concept in ${topic || "this topic"}. Review it and connect it to a concrete example.`,
  }));

  const studyTips = [
    `Review the main ideas in ${topic || "this topic"} first before testing yourself.`,
    "Create short memory cues for each concept and revisit them later in the day.",
    "Practice with recall questions to strengthen retention.",
  ];

  const learningObjectives = [
    `Explain the main ideas covered in ${topic || "this topic"}.`,
    "Define the key vocabulary and connect it to examples.",
    "Apply the concepts to solve a practice problem.",
  ];

  return { summary, keyConcepts, importantTerms, studyTips, learningObjectives };
}

// Generate structured study notes from a topic or notes.
async function generateStudyNotes(topic, notes) {
  const hasNotes = notes && notes.trim().length > 0;
  const system =
    "You are an expert study-note assistant. You will receive a topic (and possibly lecture notes) from a student. " +
    "Respond with ONLY a raw JSON object (no markdown fences, no preamble) with exactly these keys: " +
    '{"summary": string (2-3 sentences summarizing the material), ' +
    '"keyConcepts": array of 4-6 short strings (each a key concept), ' +
    '"importantTerms": array of 4-6 objects {"term": string, "definition": string}, ' +
    '"studyTips": array of 3-4 short actionable strings, ' +
    '"learningObjectives": array of 3-4 short strings}. ' +
    "Make the notes clear, well-structured, and useful for studying. No extra keys, no explanations outside the JSON.";

  return generateJSON({
    system,
    prompt: hasNotes
      ? `Topic: ${topic || "General"}\n\nNotes:\n${clipStudySource(notes)}`
      : `Topic: ${topic || "General"}\n\nGenerate structured study notes for this topic. Keep every field concise.`,
    maxTokens: 1600,
    model: process.env.GEMINI_FAST_MODEL || "gemini-flash-lite-latest",
    fallback: () => buildFallbackStudyNotes(topic, notes),
  });
}

function buildFallbackQuiz(topic, notes) {
  const hasNotes = notes && notes.trim().length > 0;
  const concepts = hasNotes
    ? notes.split(/\n+/).map((l) => l.trim().replace(/^[-*•]\s*/, "")).filter(Boolean).slice(0, 6)
    : [
        `${topic || "The topic"}`,
        `Key principles of ${topic || "the topic"}`,
        `Main applications of ${topic || "the topic"}`,
        `Important vocabulary in ${topic || "the topic"}`,
      ];

  return sanitizeQuizList(
    concepts.map((concept, index) => {
      const correct = concept.length > 60 ? `${concept.slice(0, 57)}...` : concept;
      const distractors = concepts.filter((_, idx) => idx !== index);
      return {
        type: "mcq",
        question: `Which idea belongs in ${topic || "this topic"}?`,
        options: [correct, ...distractors].slice(0, 4),
        answer: correct,
      };
    })
  );
}

// Gamified quiz — pure 4-option multiple-choice questions with exactly 4
// options so the mobile quiz can offer A/B/C/D taps with instant feedback.
async function generateQuiz(topic, notes) {
  const hasNotes = notes && notes.trim().length > 0;
  const system =
    "You are an expert quiz generator for a gamified study app. " +
    "You will receive a topic (and possibly lecture notes) from a student. " +
    "Respond with ONLY a raw JSON object (no markdown fences, no preamble) with exactly this shape: " +
    '{"quiz": array of 8-10 objects, each {"type": "mcq", "question": string, "options": array of EXACTLY 4 short strings (one correct, three plausible same-topic distractors), "answer": string (must be one of the four options, verbatim)}}. ' +
    "Base questions strictly on the provided topic/notes when notes exist. " +
    "Keep questions focused on key facts, definitions, and concepts. " +
    "The correct option must be a complete 1-4 word answer phrase, not a fragment. " +
    "Distractors must be relevant to the same topic, plausible, unique, and not also correct. Never use random, generic, or unrelated filler choices. " +
    "Make sure the answer string is EXACTLY one of the 4 options (no extra characters). " +
    "No extra keys, no explanations outside the JSON.";

  const pack = await generateJSON({
    system,
    prompt: hasNotes
      ? `Topic: ${topic || "General"}\n\nContent:\n${notes}`
      : `Topic: ${topic || "General"}\n\nGenerate a multiple-choice quiz for this topic.`,
    maxTokens: 2200,
    fallback: () => ({ quiz: buildFallbackQuiz(topic, notes) }),
  });
  const quiz = sanitizeQuizList(Array.isArray(pack) ? pack : pack?.quiz);
  return { quiz: quiz.length ? quiz : buildFallbackQuiz(topic, notes) };
}

function formatDeckCardsForTutor(cards, maxChars = 12000) {
  const lines = [];
  let used = 0;
  for (let i = 0; i < (cards || []).length; i += 1) {
    const front = String(cards[i].front || "").replace(/\s+/g, " ").trim().slice(0, 180);
    const back = String(cards[i].back || "").replace(/\s+/g, " ").trim().slice(0, 280);
    const highlight = (displayHighlight(cards[i]) || canonicalAnswer(cards[i])).replace(/\s+/g, " ").trim().slice(0, 100);
    const explanation = String(cards[i].explanation || "").replace(/\s+/g, " ").trim().slice(0, 360);
    const line = [
      `${i + 1}. id=${cards[i].id}`,
      `topic=${front}`,
      `answer=${back}`,
      `highlight=${highlight}`,
      explanation ? `explanation=${explanation}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    if (lines.length && used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines;
}

async function generateDeckTutorLesson(collectionName, cards) {
  const list = Array.isArray(cards) ? cards : [];
  const cardLinesList = formatDeckCardsForTutor(list);
  const cardLines = cardLinesList.join("\n");
  const limited = list.slice(0, Math.max(cardLinesList.length, 8));
  const system =
    "You are an expert study tutor. For every flashcard, first carefully read and understand the topic, the full answer text, the highlighted key phrase, and the explanation. Only then write questions. Use those sources only. Do not invent facts. " +
    "Respond with ONLY a raw JSON object (no markdown fences) with exactly this shape: " +
    '{"title": string, "cards": array of objects, each {"index": number (1-based), "cardId": string, "explanation": string (2-4 sentences that teach the topic using the back, highlight, and any given explanation), "questions": array of EXACTLY 2 objects {"question": string, "options": array of EXACTLY 4 distinct strings, "answer": string (must equal one option verbatim), "why": string (1-2 sentences from the flashcard explaining why that correct option is right)}}}. ' +
    "Write EXACTLY two specific, varied multiple-choice questions per card. They must both be about that topic and test different ideas, such as definition, purpose, a key characteristic, a use, a translation, or a fact from the explanation. Preserve the original meaning of the flashcard. " +
    "CRITICAL — exactly ONE correct option per question: " +
    "1) Identify the single fact being tested from the flashcard before writing. " +
    "2) The answer field must be the exact text of that one correct option. " +
    "3) The other three options must be clearly wrong for that question — never synonyms, equivalent translations, paraphrases, or alternate wordings of the correct answer. " +
    "4) Never use meta/label choices such as 'the correct term', 'the best answer', 'Tagalog word for bird', 'translation of X', or 'the answer related to the topic'. If the question asks for a translation or term, the correct option must be that actual word or phrase (e.g. 'ibon'), not a description of it. " +
    "5) All four options must answer the same question in a consistent format (all short terms, or all short phrases — do not mix a concrete term with a descriptive label). " +
    "6) Before returning, verify: exactly one option is correct; answer is present verbatim in options; no distractor could reasonably also be correct; why supports only that correct option. " +
    "You may use the highlighted phrase as the correct option when the question asks for that idea. You may also write a question from the explanation or back, with a correct option that is stated or clearly implied there. " +
    "Do not repeat or reverse the original flashcard prompt. Never ask 'which term is defined as X' after 'what is X', and never reuse one question's answer as the next question. " +
    "Never write vague prompts like 'which option best applies the idea on this card', 'which fact belongs with this flashcard', or 'what is the main idea of this card'. Name the topic in the question. " +
    "If a question asks for a result, term, name, or translation, mark that concrete result/term/translation as correct — not a related process, object, or descriptive label. Distractors must be relevant, plausible, and clearly wrong. The two questions must have different correct answers. Never use random or generic filler. " +
    "Every option must be a complete answer phrase. Never leave options unfinished, such as ending with 'as', 'to', 'of', 'for', 'a', or 'the'. Prefer concise answers like 'ibon' or 'marksman' over sentence stems. Do not include duplicate or nearly identical options. " +
    "The why field must explain the correct option using the flashcard content in clear, non-repetitive wording so a student can learn why it is right.";

  // No silent fake fallback — tutor lessons must come from the AI provider + deck content.
  // assembleTutorLesson still repairs/validates MCQs from the generated JSON against real cards.
  const generated = await generateJSON({
    system,
    prompt: `Deck name: ${collectionName || "Study deck"}\n\nFlashcards:\n${cardLines || "(empty deck)"}`,
    maxTokens: 4096,
    largeOutput: true,
  });
  return assembleTutorLesson(collectionName, list.length ? list : limited, generated);
}

module.exports = {
  generateStudyPack,
  generateFlashcards,
  generateCoachInsight,
  generateStudyNotes,
  generateQuiz,
  generateDeckTutorLesson,
};

