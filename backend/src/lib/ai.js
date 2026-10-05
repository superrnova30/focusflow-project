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
  const flashcards = keyConcepts.slice(0, 6).map((concept, index) => ({
    front: concept.length > 40 ? `${concept.slice(0, 37)}...` : concept,
    back: `Review ${concept} and connect it to a concrete example.`,
  }));
  const quiz = [
    { type: "mcq", question: `What is the main idea of ${subject || "this topic"}?`, options: ["A core concept", "A random detail", "An unrelated example", "A guess"], answer: "A core concept" },
    { type: "short_answer", question: "Explain one key idea in your own words.", answer: "A concise explanation is enough." },
    { type: "identification", question: "Name one important term from the notes.", answer: "Use the main term that appears in the notes." },
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
    '"flashcards": array of 6-8 objects {"front": string, "back": string}, ' +
    '"quiz": array of 6-8 objects mixing types. Each: {"type": "mcq"|"true_false"|"identification"|"short_answer", ' +
    '"question": string, "options": array of 4 strings (ONLY for mcq), "answer": string}, ' +
    '"shortAnswer": array of 3 objects {"question": string, "answer": string}, ' +
    '"practiceQuestions": array of 3 objects {"question": string, "answer": string}}.' +
    (hasNotes
      ? "Base everything strictly on the provided notes. No extra keys, no explanations outside the JSON."
      : "If only a topic is provided (no notes), use your general knowledge to create accurate, high-quality study materials about that topic. No extra keys, no explanations outside the JSON.");

  return generateJSON({
    system,
    prompt: hasNotes
      ? `Subject: ${subject}\n\nNotes:\n${clipStudySource(notes, 16000)}`
      : `Topic: ${subject}\n\nGenerate a complete study pack for this topic.`,
    largeOutput: true,
    fallback: () => buildFallbackStudyPack(subject, notes),
  });
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
  const cards = concepts.slice(0, 8).map((concept, index) => ({
    front: concept.length > 60 ? `${concept.slice(0, 57)}...` : concept,
    back:
      index === 0
        ? `The main idea in ${topic || "this topic"}, expressed in your own words.`
        : `A supporting concept in ${topic || "this topic"}. Review it and connect it to an example.`,
  }));
  return cards;
}

// Magic Import — generate flashcards from a topic, notes, or study-pack text.
async function generateFlashcards(topic, notes) {
  const hasNotes = notes && notes.trim().length > 0;
  const system =
    "You are an expert flashcard generator. " +
    "You will receive a topic and/or study content from a student. " +
    "Respond with ONLY a raw JSON object (no markdown fences, no preamble) with exactly this shape: " +
    '{"flashcards": array of 8-12 objects {"front": string (a question, term, or prompt), "back": string (a concise answer or definition)}}. ' +
    "Extract the most important concepts, definitions, and facts. Make the front a focused prompt and the back a clear, concise answer. No extra keys.";

  return generateJSON({
    system,
    prompt: hasNotes
      ? `Topic: ${topic || "General"}\n\nContent:\n${notes}`
      : `Topic: ${topic || "General"}\n\nGenerate flashcards for this topic.`,
    fallback: () => buildFallbackFlashcards(topic, notes),
  });
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
    ? notes.split(/\n+/).map((l) => l.trim().replace(/^[-*•]\s*/, "")).filter(Boolean).slice(0, 4)
    : [`${topic || "The topic"}`, "Its key principles", "Its main applications", "Its most important vocabulary"];

  const qs = concepts.slice(0, 6).map((concept, i) => {
    const correct = concept.length > 60 ? `${concept.slice(0, 57)}...` : concept;
    const distractors = [
      "A random detail",
      "An unrelated example",
      "A common misconception",
    ];
    return {
      type: "mcq",
      question: `What is the main idea highlighted as "${correct}"?`,
      options: [correct, ...distractors],
      answer: correct,
    };
  });
  // Shuffle option order deterministically-ish per question index.
  return qs.map((q, i) => {
    const opts = [...q.options];
    if (i % 2 === 1) opts.push(opts.shift());
    return { ...q, options: opts };
  });
}

// Gamified quiz — pure 4-option multiple-choice questions with exactly 4
// options so the mobile quiz can offer A/B/C/D taps with instant feedback.
async function generateQuiz(topic, notes) {
  const hasNotes = notes && notes.trim().length > 0;
  const system =
    "You are an expert quiz generator for a gamified study app. " +
    "You will receive a topic (and possibly lecture notes) from a student. " +
    "Respond with ONLY a raw JSON object (no markdown fences, no preamble) with exactly this shape: " +
    '{"quiz": array of 8-10 objects, each {"type": "mcq", "question": string, "options": array of EXACTLY 4 strings (one correct, three plausible distractors), "answer": string (must be one of the four options, verbatim)}}. ' +
    "Base questions strictly on the provided topic/notes when notes exist. " +
    "Keep questions focused on key facts, definitions, and concepts. " +
    "Make sure the answer string is EXACTLY one of the 4 options (no extra characters). " +
    "No extra keys, no explanations outside the JSON.";

  return generateJSON({
    system,
    prompt: hasNotes
      ? `Topic: ${topic || "General"}\n\nContent:\n${notes}`
      : `Topic: ${topic || "General"}\n\nGenerate a multiple-choice quiz for this topic.`,
    maxTokens: 2200,
    fallback: () => ({ quiz: buildFallbackQuiz(topic, notes) }),
  });
}

function buildFallbackTutorLesson(collectionName, cards) {
  const steps = cards.slice(0, 6).map((c, i) => ({
    title: `Concept ${i + 1}: ${String(c.front).slice(0, 60)}`,
    content: `Let's learn about "${c.front}". ${c.back}`,
    tip: "Try explaining this in your own words before moving on.",
  }));
  return {
    title: `Lesson: ${collectionName || "Flashcard deck"}`,
    steps: steps.length
      ? steps
      : [{ title: "Getting started", content: "Add flashcards to this deck to generate a tutor lesson.", tip: "Use Magic Import to build a deck quickly." }],
  };
}

async function generateDeckTutorLesson(collectionName, cards) {
  const limited = (cards || []).slice(0, 40);
  const cardLines = limited.map((c, i) => `${i + 1}. ${c.front} → ${c.back}`).join("\n");
  const system =
    "You are an expert study tutor. A student wants to learn a flashcard deck step by step. " +
    "Respond with ONLY a raw JSON object (no markdown fences) with exactly this shape: " +
    '{"title": string, "steps": array of 5-8 objects, each {"title": string, "content": string, "tip": string}}. ' +
    "Each step should teach one or two related concepts from the cards in plain language. " +
    "Build from foundations to harder ideas. Keep each content field 2-4 sentences. " +
    "Tips should be short actionable study advice.";

  return generateJSON({
    system,
    prompt: `Deck name: ${collectionName || "Study deck"}\n\nFlashcards:\n${cardLines || "(empty deck)"}`,
    maxTokens: 2800,
    fallback: () => buildFallbackTutorLesson(collectionName, limited),
  });
}

module.exports = {
  generateStudyPack,
  generateFlashcards,
  generateCoachInsight,
  generateStudyNotes,
  generateQuiz,
  generateDeckTutorLesson,
};

