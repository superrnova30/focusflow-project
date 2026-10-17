function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function firstAlphanumeric(text) {
  const match = String(text || "").match(/[A-Za-z0-9]/);
  return match ? match[0] : "";
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function isShortAnswer(text) {
  const body = String(text || "").trim();
  return Boolean(body) && body.length <= 48 && wordCount(body) <= 5;
}

function findInBack(back, phrase) {
  const body = String(back || "");
  const raw = String(phrase || "").replace(/\s+/g, " ").trim();
  if (!body || !raw) return "";
  const idx = body.toLowerCase().indexOf(raw.toLowerCase());
  if (idx < 0) return "";
  return body.slice(idx, idx + raw.length);
}

/** Keep the highlight inside the actual back text so it can never be a wrong answer. */
function snapHighlightToBack(back, highlight) {
  return findInBack(back, highlight);
}

function isWordChar(ch) {
  return /[A-Za-z0-9'’-]/.test(ch);
}

/** Expand a click-drag range to whole words, then return that exact phrase from the answer. */
function highlightFromSelection(text, start, end) {
  const body = String(text || "");
  let from = Math.max(0, Math.min(Number(start) || 0, Number(end) || 0));
  let to = Math.max(Number(start) || 0, Number(end) || 0);
  if (to > body.length) to = body.length;
  if (to <= from) return "";
  while (from > 0 && isWordChar(body[from - 1])) from -= 1;
  while (to < body.length && isWordChar(body[to])) to += 1;
  return body.slice(from, to).replace(/^\s+|[.,;:!?]+$|\s+$/g, "").replace(/\s+/g, " ").trim();
}

function tokenizeAnswer(text) {
  const body = String(text || "");
  const tokens = [];
  const re = /(\S+)(\s*)/g;
  let match;
  while ((match = re.exec(body))) {
    const word = match[1];
    const space = match[2] || "";
    const start = match.index;
    tokens.push({
      text: word,
      space,
      start,
      end: start + word.length,
      isWord: /[A-Za-z0-9]/.test(word),
      isBreak: space.includes("\n"),
    });
  }
  return tokens;
}

function phraseFromTokenRange(text, from, to) {
  return spanFromTokenRange(text, from, to)?.text || "";
}

function spanFromTokenRange(text, from, to) {
  const tokens = tokenizeAnswer(text);
  if (!tokens.length) return null;
  let a = Math.max(0, Math.min(Number(from) || 0, Number(to) || 0));
  let b = Math.max(Number(from) || 0, Number(to) || 0);
  if (b >= tokens.length) b = tokens.length - 1;
  while (a <= b && !tokens[a].isWord) a += 1;
  while (b >= a && !tokens[b].isWord) b -= 1;
  if (a > b || !tokens[a] || !tokens[b]) return null;
  const phrase = highlightFromSelection(text, tokens[a].start, tokens[b].end);
  if (!phrase) return null;
  const regionStart = tokens[a].start;
  const region = text.slice(tokens[a].start, tokens[b].end);
  const local = region.toLowerCase().indexOf(phrase.toLowerCase());
  const start = regionStart + Math.max(0, local);
  return { start, end: start + phrase.length, text: text.slice(start, start + phrase.length) };
}

function findOccurrences(body, phrase) {
  const raw = String(phrase || "").replace(/\s+/g, " ").trim();
  if (!body || !raw) return [];
  const lower = String(body).toLowerCase();
  const needle = raw.toLowerCase();
  const out = [];
  let from = 0;
  let idx = lower.indexOf(needle, from);
  while (idx >= 0) {
    out.push({ start: idx, end: idx + raw.length, text: body.slice(idx, idx + raw.length) });
    from = idx + Math.max(1, raw.length);
    idx = lower.indexOf(needle, from);
  }
  return out;
}

function spanFromPhrase(body, phrase, preferredStart) {
  const occ = findOccurrences(body, phrase);
  if (!occ.length) return null;
  if (!Number.isFinite(preferredStart)) return occ[0];
  return [...occ].sort((a, b) => Math.abs(a.start - preferredStart) - Math.abs(b.start - preferredStart))[0];
}

function coerceSpan(body, item) {
  if (item == null) return null;
  if (typeof item === "string") return spanFromPhrase(body, item);
  const text = String(item.text || item.t || "").replace(/\s+/g, " ").trim();
  const start = Number(item.start ?? item.s);
  const end = Number(item.end ?? item.e);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    const from = Math.max(0, start);
    const to = Math.min(String(body).length, end);
    if (to > from) {
      const phrase = highlightFromSelection(body, from, to) || text;
      if (phrase) {
        const local = body.slice(from, to).toLowerCase().indexOf(phrase.toLowerCase());
        const abs = from + Math.max(0, local);
        if (body.slice(abs, abs + phrase.length).toLowerCase() === phrase.toLowerCase()) {
          return { start: abs, end: abs + phrase.length, text: body.slice(abs, abs + phrase.length) };
        }
      }
    }
    return spanFromPhrase(body, text, from);
  }
  return spanFromPhrase(body, text, Number.isFinite(start) ? start : undefined);
}

function mergeSpans(body, spans) {
  const sorted = [...(spans || [])]
    .filter((span) => span && Number.isFinite(span.start) && span.end > span.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const span of sorted) {
    const start = Math.max(0, span.start);
    const end = Math.min(String(body).length, span.end);
    if (end <= start) continue;
    const prev = out[out.length - 1];
    if (prev && start <= prev.end) {
      prev.end = Math.max(prev.end, end);
      prev.text = body.slice(prev.start, prev.end);
    } else {
      out.push({ start, end, text: body.slice(start, end) });
    }
  }
  return out;
}

function parseHighlights(raw, back) {
  const body = String(back || "");
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return mergeSpans(body, raw.map((item) => coerceSpan(body, item)).filter(Boolean));
  const str = String(raw).trim();
  if (!str) return [];
  if (str.startsWith("[")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return mergeSpans(body, parsed.map((item) => coerceSpan(body, item)).filter(Boolean));
      }
    } catch {
      return [];
    }
  }
  const span = spanFromPhrase(body, str);
  return span ? [span] : [];
}

function serializeHighlights(spans, body) {
  if (!spans || !spans.length) return "";
  const uniquePhrase = spans.length === 1 && findOccurrences(body || "", spans[0].text).length <= 1;
  if (uniquePhrase) return spans[0].text;
  return JSON.stringify(spans.map((span) => ({ start: span.start, end: span.end, text: span.text })));
}

function addHighlightSpan(body, raw, span) {
  const existing = parseHighlights(raw, body);
  if (!span || !(span.end > span.start)) return serializeHighlights(existing, body);
  const covered = existing.some((item) => span.start >= item.start && span.end <= item.end);
  if (covered) return serializeHighlights(existing, body);
  return serializeHighlights(mergeSpans(body, [...existing, span]), body);
}

function removeHighlightAt(body, raw, index) {
  const existing = parseHighlights(raw, body);
  if (index < 0 || index >= existing.length) return serializeHighlights(existing, body);
  existing.splice(index, 1);
  return serializeHighlights(existing, body);
}

function remapHighlights(oldText, newText, raw) {
  const spans = parseHighlights(raw, oldText);
  if (!spans.length) return serializeHighlights(parseHighlights(raw, newText), newText);
  const used = new Set();
  const next = [];
  for (const span of spans) {
    const phrase = span.text;
    const sameSlice = String(newText).slice(span.start, span.end);
    if (sameSlice.toLowerCase() === String(phrase).toLowerCase()) {
      const key = `${span.start}:${span.end}`;
      if (!used.has(key)) {
        used.add(key);
        next.push({ start: span.start, end: span.end, text: sameSlice });
        continue;
      }
    }
    const occ = findOccurrences(newText, phrase).filter((item) => !used.has(`${item.start}:${item.end}`));
    if (!occ.length) continue;
    occ.sort((a, b) => Math.abs(a.start - span.start) - Math.abs(b.start - span.start));
    const pick = occ[0];
    used.add(`${pick.start}:${pick.end}`);
    next.push(pick);
  }
  return serializeHighlights(mergeSpans(newText, next), newText);
}

function tokenOverlapsSpans(token, spans) {
  if (!token?.isWord || !spans?.length) return false;
  return spans.some((span) => token.start < span.end && token.end > span.start);
}

function tokenOverlapsHighlight(token, text, highlight) {
  return tokenOverlapsSpans(token, parseHighlights(highlight, text));
}

function resolveSavedHighlight(front, back, requested) {
  if (requested == null) {
    return serializeHighlights(parseHighlights(pickAnswerHighlight(front, back, ""), back), back);
  }
  if (!String(requested).trim()) return "";
  const spans = parseHighlights(requested, back);
  if (spans.length) return serializeHighlights(spans, back);
  return serializeHighlights(parseHighlights(pickAnswerHighlight(front, back, String(requested)), back), back);
}

const STOP_WORDS = /^(?:a|an|the|of|and|or|to|in|on|for|with|by|from|as|at|is|are|was|were|be)$/i;

function looksLikeAdjective(word) {
  const raw = String(word || "");
  const w = raw.replace(/[^A-Za-z0-9-]/g, "");
  if (!w) return false;
  if (w.includes("-")) return true;
  if (/^[A-Z]/.test(w)) return false;
  return w.length > 4 && /(?:al|ive|ous|ic|ical|ary|ful|less|able|ible|ent|ant|ed|ing|ual|ory|ish)$/i.test(w);
}

function stripLeadingArticle(phrase) {
  return String(phrase || "").replace(/\s+/g, " ").trim().replace(/^(?:a|an|the)\s+/i, "");
}

function contentTokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.test(word));
}

function tokenStem(word) {
  let w = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  if (w.length <= 4) return w;
  w = w.replace(/ies$/, "y");
  w = w.replace(/(?:ingly|edly|ing|ed)$/g, "");
  w = w.replace(/(?:ications|ication|itions|ition|ations|ation|tions|tion|sions|sion|ments|ment|ness|ance|ence)$/g, "");
  w = w.replace(/(?:ers|ors|ies|es|s)$/g, "");
  if (w.length > 7) w = w.slice(0, 7);
  return w || String(word || "").toLowerCase().slice(0, 5);
}

function stemsRelated(a, b) {
  const x = tokenStem(a);
  const y = tokenStem(b);
  if (!x || !y) return false;
  const min = Math.min(x.length, y.length);
  if (min < 3) return false;
  if (x === y) return true;
  if (min < 4 && Math.abs(x.length - y.length) > 2) return false;
  return x.startsWith(y) || y.startsWith(x);
}

function optionMorphologyEchoesQuestion(question, option) {
  const optTokens = contentTokens(option);
  if (!optTokens.length || wordCount(option) > 3) return false;
  const qTokens = contentTokens(question);
  if (!qTokens.length) return false;
  return optTokens.every((token) => qTokens.some((qToken) => stemsRelated(token, qToken)));
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCalledTerms(card) {
  const text = `${card?.front || ""} ${card?.back || ""} ${card?.explanation || ""}`;
  const out = [];
  const called = String(text).matchAll(
    /\b(?:called|known as|termed|named)\s+(?:a |an |the )?["“]?([A-Za-z][A-Za-z0-9-]{1,24})["”]?/gi
  );
  for (const match of called) {
    if (match[1] && !STOP_WORDS.test(match[1])) out.push(match[1]);
  }
  return uniqueOptions(out);
}

function optionIsNamedResult(card, option) {
  const opt = normalizeChoice(option);
  if (!opt || wordCount(opt) > 4) return false;
  const hay = `${card?.back || ""} ${card?.explanation || ""} ${card?.front || ""}`;
  const pattern = escapeRegExp(opt);
  return [
    new RegExp(`\\b${pattern}\\s+is\\s+(?:the\\s+)?(?:result|outcome)\\b`, "i"),
    new RegExp(`\\b(?:result|outcome)\\b[^.?]{0,70}\\b(?:called|known as|termed|named)\\s+(?:a |an |the )?${pattern}\\b`, "i"),
    new RegExp(`\\b(?:called|known as|termed|named)\\s+(?:a |an |the )?${pattern}\\b`, "i"),
  ].some((re) => re.test(hay));
}

function echoesQuestion(phrase, front) {
  const questionTokens = contentTokens(front);
  const phraseTokens = contentTokens(phrase);
  if (!questionTokens.length || !phraseTokens.length) return false;
  const overlap = phraseTokens.filter((word) => questionTokens.includes(word)).length;
  return overlap >= Math.max(1, Math.ceil(phraseTokens.length * 0.6));
}

function isCompletePhrase(phrase) {
  const text = String(phrase || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  const last = words[words.length - 1].replace(/[^A-Za-z0-9-]/g, "");
  const first = words[0].replace(/[^A-Za-z0-9-]/g, "");
  if (!last || STOP_WORDS.test(last)) return false;
  if (STOP_WORDS.test(first) && words.length <= 2) return false;
  if (/[,;:]$/.test(text)) return false;
  if (/\b(?:the|a|an|of|to|and|or)$/i.test(text)) return false;
  if (looksLikeAdjective(words[words.length - 1])) return false;
  if (words.every((word) => looksLikeAdjective(word))) return false;
  return true;
}

/** Incomplete MCQ stems like "Miya primarily plays as" or "used to". */
function isIncompleteChoice(text) {
  const raw = normalizeChoice(text);
  if (!raw) return true;
  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const last = words[words.length - 1].replace(/[^A-Za-z0-9-]/g, "");
  if (!last) return true;
  if (
    /^(?:a|an|the|of|to|in|on|for|with|by|from|as|at|is|are|was|were|be|and|or|but|than|into|onto|about|over|under|between|among|during|while|when|where|who|which|that|this|these|those)$/i.test(
      last
    )
  ) {
    return true;
  }
  if (
    /\b(?:plays as|acts as|serves as|known as|defined as|referred to|used to|designed to|intended to|built to|functions as|functions to|role as|role of|type of)$/i.test(
      raw
    )
  ) {
    return true;
  }
  return false;
}

/** Meta / label-style choices that describe an answer instead of being one. */
function isMetaChoice(text, question = "") {
  const raw = normalizeChoice(text);
  if (!raw) return true;
  if (isGenericChoice(raw)) return true;
  if (/^(?:the\s+)?(?:correct|best|right|actual|true)\s+(?:answer|option|choice|term|one)$/i.test(raw)) {
    return true;
  }
  if (/\b(?:correct|best|right)\s+(?:answer|option|choice|term)\b/i.test(raw) && wordCount(raw) <= 6) {
    return true;
  }
  if (/^(?:none|all)\s+of\s+the\s+above$/i.test(raw)) return true;
  if (/\banswer\s+related\s+to\b/i.test(raw)) return true;
  if (/^(?:the\s+)?(?:same as|same meaning as|equivalent (?:of|to)|synonym (?:of|for))\b/i.test(raw)) {
    return true;
  }
  // "Tagalog word for bird", "translation of bird", "the term for X", clipped "tagalog word"
  if (/\b(?:word|term|phrase|name)\s+for\b/i.test(raw)) return true;
  if (/^(?:the\s+)?(?:\w+\s+)?(?:word|term|phrase)$/i.test(raw)) return true;
  if (/\b(?:the\s+)?translation\s+of\b/i.test(raw)) return true;
  if (/^(?:the\s+)?(?:definition|meaning|description)\s+of\b/i.test(raw)) return true;
  const q = normalizeChoice(question).toLowerCase();
  if (q) {
    // Choice that mostly restates the question (no new concrete answer).
    const qTokens = contentTokens(q);
    const aTokens = contentTokens(raw);
    if (aTokens.length >= 2 && aTokens.every((token) => qTokens.includes(token))) {
      return true;
    }
  }
  return false;
}

function isUsableMcqChoice(text, question = "") {
  const raw = normalizeChoice(text);
  if (!raw || isGenericChoice(raw) || isMetaChoice(raw, question) || isIncompleteChoice(raw)) return false;
  if (wordCount(raw) > 12) return false;
  return true;
}

function compactTutorAnswer(text, question, card) {
  const raw = normalizeChoice(text);
  if (!raw || !isUsableMcqChoice(raw)) return "";
  const focus = questionFocus(question);
  if (focus === "role" || focus === "definition" || focus === "term") {
    const roleMatch = raw.match(
      /\b(?:plays as|acts as|serves as|is|are)\s+(?:a |an |the )?([A-Za-z][A-Za-z0-9-]{1,24}(?:\s+[A-Za-z][A-Za-z0-9-]{1,24}){0,2})\b/i
    );
    if (roleMatch?.[1] && isUsableMcqChoice(roleMatch[1]) && !answersEquivalent(roleMatch[1], cardTopicName(card))) {
      return stripLeadingArticle(roleMatch[1]);
    }
  }
  if (focus === "purpose" || /^to\s+/i.test(raw)) return raw;
  if (wordCount(raw) <= 8) return raw;
  const clipped = clipToPhrase(raw, 4);
  if (
    clipped
    && isUsableMcqChoice(clipped)
    && !isIncompleteChoice(clipped)
    && !answersEquivalent(clipped, cardTopicName(card))
    && wordCount(clipped) >= 2
  ) {
    return clipped;
  }
  return raw;
}

function choicesTooSimilar(a, b) {
  if (choicesConflict(a, b)) return true;
  const left = contentTokens(a);
  const right = contentTokens(b);
  if (!left.length || !right.length) return false;
  const overlap = left.filter((token) => right.includes(token)).length;
  return overlap / Math.min(left.length, right.length) >= 0.75;
}

function isConfidentHighlight(phrase, back, front) {
  const body = String(back || "").trim();
  const snapped = findInBack(body, phrase);
  if (!snapped || !isCompletePhrase(snapped)) return false;
  if (echoesQuestion(snapped, front)) return false;
  if (snapped === body) return isShortAnswer(body);
  return snapped.length < body.length;
}

function firstSentence(text) {
  const body = String(text || "").trim();
  const match = body.match(/^.+?(?:[.!?](?=\s|$)|$)/);
  return (match ? match[0] : body).replace(/[.!?]+$/, "").trim();
}

function extractOfPattern(back) {
  const match = String(back || "")
    .trim()
    .match(/(?:^|\s)(?:a|an|the)\s+(\w+)\s+of\s+(?:(the|a|an)\s+)?(\w+)/i);
  if (!match || STOP_WORDS.test(match[3])) return "";
  return match[2] ? `${match[1]} of ${match[2]} ${match[3]}` : `${match[1]} of ${match[3]}`;
}

function extractDefinitionHead(back) {
  let text = firstSentence(back);
  if (!text || !/^(?:a|an)\s+/i.test(text)) return "";
  text = text.replace(/^(?:a|an)\s+/i, "");
  text = text.split(
    /\s+(?:that|which|who|whom|whose|where|when|because|designed|used|created|built|made|intended|consisting|found|located|present|to have|in order|so that)\b/i
  )[0];
  text = text.replace(/\s+(?:in|on|at|from|with|by|for|across|through)\s+.+$/i, "");
  const words = text
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  while (words.length > 2 && looksLikeAdjective(words[0])) words.shift();
  if (!words.length || words.length > 4) return "";
  return words.join(" ");
}

function extractIsPattern(front, back) {
  const match = firstSentence(back).match(/^(.+?)\s+is\s+(?:an?\s+|the\s+)?(.+)$/i);
  if (!match) return "";
  const subject = match[1].replace(/^(?:an?|the)\s+/i, "").trim();
  const predicate = match[2].replace(/[.!?]+$/, "").trim();
  const question = String(front || "").toLowerCase();
  if (wordCount(subject) > 6) return "";
  const predWords = predicate
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.test(word));
  if (predWords.some((word) => question.includes(word))) return subject;
  const subjectKey = subject.toLowerCase();
  if (subjectKey && question.includes(subjectKey)) {
    const ofPhrase = extractOfPattern(`the ${predicate}`);
    if (ofPhrase) return ofPhrase;
    const loc = predicate.match(/^(?:in|at|near|from|on)\s+(.+)$/i);
    if (loc && isCompletePhrase(loc[1]) && wordCount(loc[1]) <= 4) return loc[1];
    const cleaned = stripLeadingArticle(predicate);
    if (isCompletePhrase(cleaned) && wordCount(cleaned) <= 4) return cleaned;
    const clipped = clipToPhrase(cleaned, 4);
    if (clipped) return clipped;
  }
  return "";
}

function extractQuotedOrDate(front, back) {
  const quoted = String(back || "").match(/["“]([^"”]+)["”]/);
  if (quoted && isCompletePhrase(quoted[1]) && wordCount(quoted[1]) <= 6) return quoted[1];
  const q = String(front || "");
  if (/\b(?:when|year|date)\b/i.test(q)) {
    const year = String(back || "").match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/);
    if (year) return year[0];
  }
  if (/\b(?:how many|how much|number of)\b/i.test(q)) {
    const num = String(back || "").match(/\b\d+(?:\.\d+)?\b/);
    if (num) return num[0];
  }
  return "";
}

function extractProperName(front, back) {
  if (!/\b(?:who|whom|whose)\b/i.test(String(front || ""))) return "";
  const match = String(back || "").match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+)+)\b/);
  return match ? match[1] : "";
}

function clipToPhrase(text, maxWords = 4) {
  const words = String(text || "")
    .replace(/[.,!?;:]+$/g, "")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > maxWords) words.pop();
  while (words.length && !isCompletePhrase(words.join(" "))) words.pop();
  const phrase = words.join(" ");
  return isCompletePhrase(phrase) ? phrase : "";
}

function neighborPhrases(back, phrase) {
  const body = String(back || "");
  const snapped = findInBack(body, phrase);
  if (!snapped) return [];
  const idx = body.toLowerCase().indexOf(snapped.toLowerCase());
  const before = body
    .slice(0, idx)
    .replace(/[^\w\s-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const after = body
    .slice(idx + snapped.length)
    .replace(/[^\w\s-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const core = snapped.split(/\s+/).filter(Boolean);
  const out = [];
  for (let left = 0; left <= 2; left += 1) {
    for (let right = 0; right <= 3; right += 1) {
      if (left === 0 && right === 0) continue;
      const words = [...before.slice(-left), ...core, ...after.slice(0, right)];
      if (words.length < 2 || words.length > 4) continue;
      out.push(words.join(" "));
    }
  }
  return out;
}

const EXPAND_GLUE = /^(?:of|the|a|an)$/i;
const EXPAND_SKIP = /^(?:is|are|was|were|be|been|being|do|does|did|have|has|had|in|on|at|to|for|from|with|by|as|into)$/i;

function isAtomicHighlight(phrase) {
  return /\d/.test(String(phrase || ""));
}

function isNounPhraseExpansion(core, words) {
  const base = String(core || "").split(/\s+/).filter(Boolean);
  return words.every((word, index) => {
    if (base.includes(word)) return true;
    const clean = word.replace(/[^A-Za-z0-9-]/g, "");
    if (!clean) return false;
    if (EXPAND_GLUE.test(clean)) return index > 0 && index < words.length - 1;
    if (EXPAND_SKIP.test(clean)) return false;
    return true;
  });
}

function expandToMultiWordPhrase(front, back, phrase) {
  const snapped = findInBack(back, stripLeadingArticle(phrase));
  if (!snapped) return "";
  const count = wordCount(snapped);
  if (count >= 2 && count <= 4 && isConfidentHighlight(snapped, back, front)) return snapped;
  if (count > 4) {
    const clipped = findInBack(back, clipToPhrase(snapped, 4));
    if (clipped && isConfidentHighlight(clipped, back, front)) return clipped;
  }
  if (count === 1 && !isAtomicHighlight(snapped)) {
    const core = snapped.split(/\s+/).filter(Boolean);
    const best = neighborPhrases(back, snapped)
      .map((item) => findInBack(back, item))
      .filter((item) => {
        const words = item.split(/\s+/).filter(Boolean);
        return (
          wordCount(item) >= 2 &&
          wordCount(item) <= 4 &&
          isNounPhraseExpansion(core, words) &&
          isConfidentHighlight(item, back, front)
        );
      })
      .sort((a, b) => wordCount(a) - wordCount(b) || a.length - b.length);
    if (best[0]) return best[0];
  }
  return isConfidentHighlight(snapped, back, front) ? snapped : "";
}

function firstConfident(front, back, candidates) {
  const body = String(back || "").trim();
  for (const candidate of candidates) {
    const expanded = expandToMultiWordPhrase(front, body, candidate);
    if (expanded) return expanded;
    const snapped = findInBack(body, stripLeadingArticle(candidate));
    if (isConfidentHighlight(snapped, body, front)) return snapped;
  }
  return "";
}

/**
 * Choose a complete phrase from `back` that answers `front`.
 * Prefers a 2-4 word answering phrase; returns "" when nothing is confident.
 */
function pickAnswerHighlight(front, back, suggested) {
  const body = String(back || "").trim();
  if (!body) return "";

  const picked = firstConfident(front, body, [
    suggested,
    extractQuotedOrDate(front, body),
    extractProperName(front, body),
    extractIsPattern(front, body),
    extractOfPattern(body),
    extractDefinitionHead(body),
  ]);
  if (picked) return expandToMultiWordPhrase(front, body, picked) || picked;

  if (isShortAnswer(body)) {
    const stripped = findInBack(body, stripLeadingArticle(body.replace(/[.!?]+$/, "")));
    if (stripped && isCompletePhrase(stripped) && !echoesQuestion(stripped, front)) {
      return expandToMultiWordPhrase(front, body, stripped) || stripped;
    }
    if (isCompletePhrase(body)) return body;
  }
  return "";
}

function displayHighlight(card) {
  const back = String(card?.back || card?.answer || "").trim();
  const spans = parseHighlights(card?.answerHighlight, back);
  if (spans.length) return spans[0].text;
  return pickAnswerHighlight(card?.front || card?.question, back, "");
}

function summarizedAnswer(card) {
  const front = card?.front || card?.question;
  const back = String(card?.back || card?.answer || "").trim();
  const highlight = displayHighlight({ ...card, front, back });
  if (highlight) return highlight;
  if (!back) return "";
  if (wordCount(back) <= 8) return back.replace(/[.!?]+$/, "").trim();
  const sentence = firstSentence(back);
  if (wordCount(sentence) <= 8) return sentence;
  return clipToPhrase(sentence, 4) || sentence;
}

function canonicalAnswer(card) {
  const back = String(card?.back || card?.answer || "").trim();
  return summarizedAnswer(card) || back;
}

function buildFirstLetterClue(answer) {
  const letter = firstAlphanumeric(answer);
  if (!letter) return "Clue: think about the highlighted answer on this card.";
  return `Clue: starts with "${letter.toUpperCase()}"`;
}

/** First- or last-letter mask, e.g. `s _ _ _ _` or `_ _ _ _ h`. Never the full answer. */
function buildMaskedLetterClue(answer, side = "first") {
  const text = String(answer || "").trim();
  if (!text) return "";
  const chars = Array.from(text);
  const letterIndexes = [];
  chars.forEach((ch, i) => {
    if (/[A-Za-z0-9]/.test(ch)) letterIndexes.push(i);
  });
  if (!letterIndexes.length) return "";
  const revealAt = side === "last" ? letterIndexes[letterIndexes.length - 1] : letterIndexes[0];
  const words = [];
  let current = [];
  chars.forEach((ch, i) => {
    if (/[A-Za-z0-9]/.test(ch)) {
      current.push(i === revealAt ? ch.toLowerCase() : "_");
      return;
    }
    if (/\s/.test(ch) && current.length) {
      words.push(current.join(" "));
      current = [];
    }
  });
  if (current.length) words.push(current.join(" "));
  return words.join("   ");
}

function answersEquivalent(a, b) {
  const left = normalizeChoice(a);
  const right = normalizeChoice(b);
  if (!left || !right) return false;
  return choicesConflict(left, right);
}

function isOnTopicPhrase(phrase, card) {
  const text = normalizeChoice(phrase);
  if (!text) return false;
  const hay = `${card?.front || ""} ${card?.back || ""} ${card?.explanation || ""}`.toLowerCase();
  if (hay.includes(text.toLowerCase())) return true;
  const words = contentTokens(text);
  if (!words.length) return false;
  const hayTokens = new Set(contentTokens(hay));
  return words.every((word) => hayTokens.has(word));
}

function subjectFromBack(back) {
  const match = firstSentence(back).match(/^(.+?)\s+(?:is|are|was|were)\s+/i);
  if (!match) return "";
  const subject = stripLeadingArticle(match[1].replace(/[.!?]+$/, "").trim());
  if (!subject || wordCount(subject) > 6) return "";
  return subject;
}

function significantCandidatePhrases(text) {
  const words = String(text || "")
    .replace(/[?!]+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter(Boolean);
  const out = [];
  for (let n = Math.min(4, words.length); n >= 1; n -= 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      const phrase = stripLeadingArticle(words.slice(i, i + n).join(" "));
      if (!phrase) continue;
      if (n === 1) {
        if (phrase.length >= 3 && !STOP_WORDS.test(phrase)) out.push(phrase);
      } else if (isCompletePhrase(phrase) || wordCount(phrase) <= 4) {
        out.push(phrase);
      }
    }
  }
  return uniqueOptions(out);
}

function pickAlternateTutorAnswer(card, primary, generatedAnswer) {
  const avoid = normalizeChoice(primary);
  const topic = topicTermFromFront(card?.front);
  const candidates = [];
  const proposed = normalizeChoice(generatedAnswer);
  const onCard = (text) =>
    Boolean(
      findInBack(card?.back, text)
      || findInBack(card?.front, text)
      || findInBack(card?.explanation, text)
      || `${card?.front || ""} ${card?.back || ""} ${card?.explanation || ""}`.toLowerCase().includes(text.toLowerCase())
    );
  const push = (value) => {
    const text = normalizeChoice(value);
    if (!text || answersEquivalent(text, avoid) || wordCount(text) > 6) return;
    if (!onCard(text)) return;
    if (candidates.some((item) => answersEquivalent(item, text))) return;
    candidates.push(findInBack(card?.back, text) || findInBack(card?.front, text) || text);
  };
  if (proposed && isOnTopicPhrase(proposed, card) && !answersEquivalent(proposed, topic)) push(proposed);
  push(subjectFromBack(card?.back));
  push(extractIsPattern(card?.front, card?.back));
  neighborPhrases(card?.back, avoid).forEach(push);
  significantCandidatePhrases(card?.back).forEach(push);
  significantCandidatePhrases(card?.explanation).forEach(push);
  if (proposed && isOnTopicPhrase(proposed, card)) push(proposed);
  significantCandidatePhrases(card?.front).forEach((item) => {
    if (!answersEquivalent(item, topic)) push(item);
  });
  push(topic);

  return candidates.find((item) => isOnTopicPhrase(item, card) && onCard(item)) || candidates[0] || "";
}

function questionsTooSimilar(a, b) {
  const left = normalizeChoice(a).toLowerCase();
  const right = normalizeChoice(b).toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  const leftWords = new Set(contentTokens(left));
  const rightWords = new Set(contentTokens(right));
  if (!leftWords.size || !rightWords.size) return false;
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  return overlap / Math.min(leftWords.size, rightWords.size) >= 0.85;
}

function cardTopicName(card) {
  const front = String(card?.front || "").trim();
  const roleSubject = front.match(
    /^(?:what|who)\s+is\s+([A-Za-z][A-Za-z0-9-]{1,40})(?:'s|’s)\s+primary\s+role\b/i
  );
  if (roleSubject?.[1]) return stripLeadingArticle(roleSubject[1]);
  const possessive = front.match(/\b([A-Za-z][A-Za-z0-9-]{1,40})(?:'s|’s)\s+(?:primary\s+)?role\b/i);
  if (possessive?.[1]) return possessive[1];
  return (
    topicTermFromFront(front)
    || subjectFromBack(card?.back)
    || significantCandidatePhrases(front).find((item) => wordCount(item) <= 4 && !/^(?:what|which|who)$/i.test(item))
    || "this topic"
  );
}

function extractPurposePhrase(text) {
  const sentence = firstSentence(text);
  const match =
    sentence.match(/\b(?:used to|designed to|intended to|built to|functions to)\s+(.+)$/i)
    || sentence.match(/\b(?:used for|purpose is)\s+(.+)$/i)
    || sentence.match(/\bto (?:inflict|cause|deal|produce|provide|create|destroy|harm|kill|protect|store|transmit|send|damage)\s+.+$/i);
  if (!match) return "";
  let phrase = String(match[0] || "").replace(/[.!?]+$/, "").trim();
  phrase = phrase.replace(/^(?:used to|designed to|intended to|built to|functions to)\s+/i, "to ");
  phrase = phrase.replace(/^(?:used for|purpose is)\s+/i, "");
  if (wordCount(phrase) > 12) {
    const clipped = clipToPhrase(phrase, 10);
    if (clipped) phrase = clipped;
  }
  return phrase && wordCount(phrase) <= 14 ? phrase : "";
}

function extractCharacteristicPhrase(card, avoid) {
  const pool = [
    ...significantCandidatePhrases(card?.back),
    ...significantCandidatePhrases(card?.explanation),
    ...neighborPhrases(card?.back, canonicalAnswer(card)),
  ];
  return pool.find(
    (item) =>
      item
      && !answersEquivalent(item, avoid)
      && !answersEquivalent(item, canonicalAnswer(card))
      && (findInBack(card?.back, item) || findInBack(card?.explanation, item))
  ) || "";
}

function questionMentionsCard(question, card) {
  const qTokens = contentTokens(question);
  const hay = new Set(contentTokens(`${card?.front || ""} ${card?.back || ""} ${card?.explanation || ""}`));
  return qTokens.some((token) => token.length > 3 && hay.has(token));
}

function isGenericTutorPrompt(question) {
  const q = String(question || "").trim();
  if (!q) return true;
  if (isAmbiguousTutorPrompt(q)) return true;
  return /which option best applies|idea on this card|fact belongs with this flashcard|based on this card|main idea of this (?:card|topic)|which statement about .+ is accurate|which idea is accurate|belongs with this flashcard/i.test(
    q
  );
}

function questionFocus(question) {
  const q = String(question || "").toLowerCase();
  // Role/classification before purpose — "primary role" is not a purpose question.
  if (/\b(?:primary )?role\b/.test(q) || /\bplays as\b/.test(q) || /\bclassified as\b/.test(q)) {
    return "role";
  }
  if (
    /\b(purpose|function|used for|used to|designed for|designed to|goal|aim)\b/.test(q)
    || /\bwhat (?:is|does) .+\s+(?:do|used for)\b/.test(q)
  ) {
    return "purpose";
  }
  if (/\b(why|because|reason)\b/.test(q)) return "reason";
  if (
    /\b(result|outcome)\b/.test(q)
    || /\b(?:what|which)\s+term\b/.test(q)
    || /\bterm (?:is )?given\b/.test(q)
    || /\bname given\b/.test(q)
    || /\bwhat do you call\b/.test(q)
    || /\b(?:say|translate|translation)\b.+\b(?:in|into|to)\b/.test(q)
    || /\bin\s+\w+\s*,\s*which\s+term\b/.test(q)
  ) {
    return "term";
  }
  if (/\b(characteristic|feature|property|trait|classified|described as)\b/.test(q)) return "characteristic";
  if (/\b(example|instance|scenario|in practice)\b/.test(q)) return "example";
  if (/^(?:what|who|where|when)\s+(?:is|are|was|were)\b/i.test(q) || /best (?:define|describes?)\b/.test(q)) {
    return "definition";
  }
  return "fact";
}

function answerEchoesQuestionSubject(question, answer) {
  const opt = normalizeChoice(answer);
  const term = topicTermFromFront(question);
  if (term && answersEquivalent(opt, term)) return true;
  const qTokens = contentTokens(question);
  const aTokens = contentTokens(opt);
  if (!aTokens.length) return false;
  if (aTokens.length <= 2 && aTokens.every((token) => qTokens.includes(token))) return true;
  return false;
}

function isGroundedInCard(phrase, card) {
  if (findInBack(card?.back, phrase) || findInBack(card?.front, phrase) || findInBack(card?.explanation, phrase)) {
    return true;
  }
  if (isOnTopicPhrase(phrase, card)) return true;
  const words = contentTokens(phrase);
  if (!words.length) return false;
  const hay = new Set(contentTokens(`${card?.front || ""} ${card?.back || ""} ${card?.explanation || ""}`));
  const hits = words.filter((word) => hay.has(word)).length;
  if (words.length === 1) return hits === 1 && words[0].length >= 5;
  return hits >= Math.max(2, Math.ceil(words.length * 0.6));
}

function scoreOptionForQuestion(question, option, card) {
  const opt = normalizeChoice(option);
  if (!opt || isGenericChoice(opt) || isMetaChoice(opt, question) || isIncompleteChoice(opt)) return -100;
  let score = 0;
  const focus = questionFocus(question);
  const highlight = canonicalAnswer(card);
  const isHighlight = Boolean(highlight && answersEquivalent(opt, highlight));
  const morphEcho = optionMorphologyEchoesQuestion(question, opt);
  const echoesSubject = answerEchoesQuestionSubject(question, opt) && !(focus === "definition" && isHighlight);
  if (echoesSubject) score -= 55;
  // Morphology echo only penalizes options that merely restate question wording, not the real highlight/answer.
  if (morphEcho && focus !== "definition" && !isHighlight) score -= 48;
  if (isGroundedInCard(opt, card)) score += 12;
  else score -= 10;
  if (focus === "purpose") {
    if (/^to\s+/i.test(opt) || /^(?:inflict|cause|deal|produce|provide|create|destroy|harm)\b/i.test(opt)) score += 28;
    if (wordCount(opt) >= 4) score += 10;
    if (wordCount(opt) <= 2) score -= 18;
  }
  if (focus === "term") {
    if (extractCalledTerms(card).some((term) => answersEquivalent(term, opt))) score += 34;
    if (optionIsNamedResult(card, opt)) score += 28;
    // Prefer the concrete lexical answer over long descriptive labels.
    if (isHighlight && wordCount(opt) <= 4) score += 26;
    if (wordCount(opt) <= 3 && isGroundedInCard(opt, card) && findInBack(card?.back, opt)) score += 18;
    if (wordCount(opt) >= 5) score -= 12;
  }
  if (focus === "role") {
    if (isGroundedInCard(opt, card) && wordCount(opt) <= 3 && !answersEquivalent(opt, cardTopicName(card))) {
      score += 24;
    }
    if (/\b(?:plays as|acts as|serves as|primarily plays)\b/i.test(opt)) score -= 18;
    if (isHighlight && wordCount(opt) <= 4) score += 20;
    if (!isGroundedInCard(opt, card)) score -= 35;
  }
  if (focus === "definition") {
    if (isHighlight) score += 22;
    const term = topicTermFromFront(question);
    if (term && answersEquivalent(opt, term) && !isHighlight) score -= 40;
  }
  if (focus === "characteristic" && wordCount(opt) >= 2) score += 8;
  const qTokens = new Set(contentTokens(question));
  const aTokens = contentTokens(opt);
  if (
    aTokens.length
    && aTokens.every((token) => qTokens.has(token))
    && !(isHighlight && (focus === "definition" || focus === "role" || focus === "term"))
  ) {
    score -= 28;
  }
  return score;
}

function optionAnswersQuestion(question, option, card) {
  return scoreOptionForQuestion(question, option, card) >= 8;
}

function pickBestAnswerForQuestion(question, options, card, avoid) {
  const scored = uniqueOptions(options || [])
    .map(normalizeChoice)
    .filter(Boolean)
    .filter((item) => !(avoid && answersEquivalent(item, avoid)))
    .map((item) => ({ item, score: scoreOptionForQuestion(question, item, card) }))
    .sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < 8) return "";
  if (scored.length > 1 && scored[1].score >= 8 && scored[0].score - scored[1].score < 6) {
    const similar =
      choicesConflict(scored[0].item, scored[1].item)
      || phraseInText(scored[0].item, scored[1].item)
      || phraseInText(scored[1].item, scored[0].item);
    if (similar) return scored[0].item;
    const echoes = (item) =>
      optionMorphologyEchoesQuestion(question, item) || answerEchoesQuestionSubject(question, item);
    if (echoes(scored[0].item) !== echoes(scored[1].item)) {
      return echoes(scored[0].item) ? scored[1].item : scored[0].item;
    }
    return "";
  }
  return scored[0].item;
}

function findExactOption(options, answer) {
  const list = Array.isArray(options) ? options : [];
  const key = normalizeChoice(answer);
  if (!key) return "";
  return (
    list.find((item) => normalizeChoice(item).toLowerCase() === key.toLowerCase())
    || list.find((item) => answersEquivalent(item, key))
    || ""
  );
}

function resolveTutorAnswerKey(question, options, card, storedAnswer, avoid) {
  const list = (options || []).filter((item) => isUsableMcqChoice(item, question));
  const storedOk =
    storedAnswer
    && isUsableMcqChoice(storedAnswer, question)
    && !isMetaChoice(storedAnswer, question);
  const pool = uniqueOptions([...list, storedOk ? storedAnswer : ""].filter(Boolean)).filter((item) =>
    isUsableMcqChoice(item, question)
  );
  const viable = viableAnswerOptions(question, list, card).filter(
    (item) => !(avoid && answersEquivalent(item, avoid))
  );
  // When exactly one option is a real answer, lock to it — ignore a bad stored key.
  if (viable.length === 1) return findExactOption(list, viable[0]) || viable[0];

  const best = pickBestAnswerForQuestion(question, pool, card, avoid);
  if (best && optionAnswersQuestion(question, best, card)) {
    const exact = findExactOption(list, best) || best;
    if (
      storedOk
      && optionAnswersQuestion(question, storedAnswer, card)
      && !(avoid && answersEquivalent(storedAnswer, avoid))
    ) {
      const storedScore = scoreOptionForQuestion(question, storedAnswer, card);
      const bestScore = scoreOptionForQuestion(question, exact, card);
      // Prefer the higher-scoring concrete option when scores diverge.
      if (bestScore <= storedScore + 4 && !isMetaChoice(storedAnswer, question)) {
        return findExactOption(list, storedAnswer) || exact;
      }
    }
    return exact;
  }
  // Never keep a stored key that does not answer the question or is a meta label.
  if (
    storedOk
    && optionAnswersQuestion(question, storedAnswer, card)
    && !(avoid && answersEquivalent(storedAnswer, avoid))
  ) {
    return findExactOption(list, storedAnswer) || storedAnswer;
  }
  const highlight = findExactOption(list, canonicalAnswer(card));
  if (
    highlight
    && optionAnswersQuestion(question, highlight, card)
    && !(avoid && answersEquivalent(highlight, avoid))
  ) {
    return highlight;
  }
  const grounded = list.find(
    (item) => isGroundedInCard(item, card) && !(avoid && answersEquivalent(item, avoid))
  );
  return findExactOption(list, grounded) || "";
}

/** Pin the answer key to a real option and fix wrong/ambiguous keys before display. */
function lockTutorAnswer(bundle, card, avoid) {
  if (!bundle) return bundle;
  const question = String(bundle.question || "").trim();
  const options = uniqueOptions(bundle.options || []).filter((item) => isUsableMcqChoice(item, question));
  const usable = (item) =>
    item
    && isUsableMcqChoice(item, question)
    && !(avoid && answersEquivalent(item, avoid))
    && optionAnswersQuestion(question, item, card);

  const best = pickBestAnswerForQuestion(bundle.question, options, card, avoid);
  const resolved = resolveTutorAnswerKey(bundle.question, options, card, bundle.answer, avoid);
  let exact = [best, resolved, bundle.answer, canonicalAnswer(card)]
    .map((item) => findExactOption(options, item) || normalizeChoice(item))
    .find((item) => usable(item)) || "";

  let nextOptions = options.slice();
  if (!exact) {
    const alt =
      pickAlternateTutorAnswer(card, avoid || canonicalAnswer(card), "")
      || extractCharacteristicPhrase(card, avoid || canonicalAnswer(card))
      || extractPurposePhrase(`${card?.back || ""} ${card?.explanation || ""}`);
    if (alt && isUsableMcqChoice(alt) && !(avoid && answersEquivalent(alt, avoid))) {
      nextOptions = uniqueOptions([alt, ...nextOptions.filter((item) => !answersEquivalent(item, avoid))]).slice(0, 4);
      exact = findExactOption(nextOptions, alt) || alt;
    }
  }

  if (!exact) return { ...bundle, options: nextOptions, answer: "" };
  if (!findExactOption(nextOptions, exact)) {
    nextOptions = uniqueOptions([exact, ...nextOptions]).slice(0, 4);
  }
  exact = findExactOption(nextOptions, exact) || exact;
  // Drop a stored wrong key that survived earlier passes.
  if (!usable(exact) && !(avoid && answersEquivalent(exact, avoid)) && isGroundedInCard(exact, card)) {
    // keep grounded alternate injected above
  } else if (!usable(exact)) {
    const grounded = nextOptions.find((item) => usable(item) || (isGroundedInCard(item, card) && !(avoid && answersEquivalent(item, avoid))));
    exact = findExactOption(nextOptions, grounded) || exact;
  }
  return { ...bundle, options: nextOptions, answer: exact };
}

function finalizeTutorQuestion(bundle, card, avoid) {
  const locked = lockTutorAnswer(bundle, card, avoid);
  if (!locked?.answer) return locked;

  const pinned = findExactOption(locked.options, locked.answer);
  if (pinned) {
    const aligned = { ...locked, answer: pinned };
    if (optionAnswersQuestion(aligned.question, aligned.answer, card)) return aligned;

    const best = pickBestAnswerForQuestion(aligned.question, aligned.options, card, avoid);
    const bestExact = findExactOption(aligned.options, best);
    if (bestExact && optionAnswersQuestion(aligned.question, bestExact, card)) {
      return { ...aligned, answer: bestExact };
    }
  }

  // Only regenerate when none of the displayed options answer the question.
  const anyFit = (locked.options || []).some((item) => optionAnswersQuestion(locked.question, item, card));
  if (anyFit) {
    const best = pickBestAnswerForQuestion(locked.question, locked.options, card, avoid);
    const bestExact = findExactOption(locked.options, best) || best;
    if (bestExact) return { ...locked, answer: findExactOption(locked.options, bestExact) || bestExact };
    return locked;
  }

  const fallbackAnswer = canonicalAnswer(card);
  const rebuilt = lockTutorAnswer(
    makeMcq(
      String(card?.front || "").trim() || locked.question,
      fallbackAnswer,
      (locked.options || []).filter((item) => !answersEquivalent(item, fallbackAnswer)),
      card?.back
    ),
    card,
    avoid
  );
  if (rebuilt?.answer && findExactOption(rebuilt.options, rebuilt.answer)) return rebuilt;
  return locked;
}

function specificQuestionForCard(card, answer, other, aspect) {
  const topic = cardTopicName(card);
  const highlight = canonicalAnswer(card);
  const purpose = extractPurposePhrase(`${card?.back || ""} ${card?.explanation || ""}`);
  const pool = [];
  const add = (prompt) => {
    const question = String(prompt || "").trim();
    if (!question || isGenericTutorPrompt(question)) return;
    if (other?.question && questionsTooSimilar(question, other.question)) return;
    if (other && questionsAreReversals({ question, answer }, other)) return;
    if (isDefinitionSwapPrompt(question, other?.answer)) return;
    if (!optionAnswersQuestion(question, answer, card)) return;
    pool.push(question);
  };

  if (aspect === "definition" || answersEquivalent(answer, highlight)) {
    add(card?.front);
    if (topic) add(`How is ${topic} best described?`);
    if (topic) add(`Which phrase best defines ${topic}?`);
  }
  if (aspect !== "definition") {
    if (purpose && (answersEquivalent(answer, purpose) || phraseInText(purpose, answer) || phraseInText(answer, purpose))) {
      if (topic) add(`What is the primary purpose of ${topic}?`);
      if (topic) add(`What is ${topic} used for?`);
    }
    if (topic && !answersEquivalent(answer, topic)) {
      add(`Which key characteristic of ${topic} is described here?`);
      add(`In practice, ${topic} is associated with which idea?`);
    }
    if (aspect === "application" && topic && !answersEquivalent(answer, topic)) {
      add(`What does ${topic} do?`);
      add(`Which role does ${topic} play?`);
    }
  }
  if (!pool.length && topic && optionAnswersQuestion(`Which phrase best defines ${topic}?`, answer, card)) {
    pool.push(`Which phrase best defines ${topic}?`);
  }
  if (!pool.length && card?.front && optionAnswersQuestion(card.front, answer, card)) pool.push(card.front);
  const seed = `${card?.front || ""}::${answer || ""}::${aspect || ""}`;
  if (!pool.length) return String(card?.front || "").trim();
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return pool[Math.abs(hash) % pool.length];
}

function defaultTutorQuestion(card, answer, aspect, other) {
  return specificQuestionForCard(card, answer, other, aspect || "definition");
}

function phraseInText(hay, needle) {
  const host = normalizeChoice(hay).toLowerCase();
  const phrase = normalizeChoice(needle).toLowerCase();
  if (!host || !phrase || phrase.length < 3) return false;
  return host.includes(phrase);
}

function isDefinitionSwapPrompt(question, quotedAnswer) {
  const q = String(question || "");
  if (!phraseInText(q, quotedAnswer)) return false;
  return /defined as|known as|means|refers to|called|term (?:on this card )?(?:is|for)|which term/i.test(q);
}

function questionsAreReversals(a, b) {
  if (!a || !b) return false;
  if (answersEquivalent(a.answer, b.answer) && questionsTooSimilar(a.question, b.question)) return true;
  if (isDefinitionSwapPrompt(b.question, a.answer) && (phraseInText(a.question, b.answer) || answersEquivalent(a.answer, b.answer))) {
    return true;
  }
  if (isDefinitionSwapPrompt(a.question, b.answer) && phraseInText(b.question, a.answer)) return true;
  return phraseInText(a.question, b.answer) && phraseInText(b.question, a.answer);
}

function isAmbiguousTutorPrompt(question) {
  return /^(?:what|which)(?:\s+\w+){0,3}\s+(?:is|are)\s+the\s+(?:correct|best|right)\s+answer/i.test(
    String(question || "").trim()
  );
}

function tutorAnswerVerified(answer, card, preferred) {
  const text = normalizeChoice(answer);
  if (!text || isMetaChoice(text)) return false;
  if (preferred && answersEquivalent(text, preferred)) return true;
  const highlight = canonicalAnswer(card);
  if (highlight && answersEquivalent(text, highlight)) return true;
  return isOnTopicPhrase(text, card);
}

/** Options that score as real contenders for the correct answer (near the top score). */
function viableAnswerOptions(question, options, card) {
  const scored = uniqueOptions(options || [])
    .map(normalizeChoice)
    .filter((item) => item && isUsableMcqChoice(item, question))
    .map((item) => ({ item, score: scoreOptionForQuestion(question, item, card) }))
    .filter((row) => row.score >= 8)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const top = scored[0].score;
  return scored.filter((row) => top - row.score < 6).map((row) => row.item);
}

function tutorQuestionIsSound(bundle, card, opts = {}) {
  const question = String(bundle?.question || "").trim();
  const answer = normalizeChoice(bundle?.answer);
  const options = uniqueOptions(bundle?.options || []).map(normalizeChoice);
  if (
    !answer
    || !isUsableMcqChoice(answer, question)
    || wordCount(question) < 3
    || isGenericTutorPrompt(question)
    || isAmbiguousTutorPrompt(question)
    || !questionMentionsCard(question, card)
  ) {
    return false;
  }
  if (isDefinitionSwapPrompt(question, answer)) return false;
  if (!optionAnswersQuestion(question, answer, card)) return false;
  if (options.length < 4) return false;
  if (options.some((item) => !isUsableMcqChoice(item, question))) return false;
  const pinned = findExactOption(options, answer);
  if (!pinned) return false;
  const correctHits = options.filter((item) => answersEquivalent(item, answer));
  if (correctHits.length !== 1) return false;
  // Top-scoring contenders must collapse to exactly the designated answer.
  const viable = viableAnswerOptions(question, options, card);
  if (!viable.length || !viable.every((item) => answersEquivalent(item, answer))) return false;
  if (viable.length > 1) return false;
  if (!tutorAnswerVerified(answer, card, opts.preferredAnswer)) return false;
  if (opts.avoidAnswer && answersEquivalent(answer, opts.avoidAnswer)) return false;
  if (opts.avoidQuestion && questionsTooSimilar(question, opts.avoidQuestion)) return false;
  if (opts.otherQuestion && questionsAreReversals({ question, answer }, opts.otherQuestion)) return false;
  for (let i = 0; i < options.length; i += 1) {
    for (let j = i + 1; j < options.length; j += 1) {
      if (choicesTooSimilar(options[i], options[j])) return false;
    }
  }
  const why = String(bundle?.why || "").trim();
  if (why) {
    // Explanation must support the designated answer, not a different option.
    const otherHits = options.filter(
      (item) => !answersEquivalent(item, answer) && phraseInText(why, item) && wordCount(item) >= 2
    );
    if (otherHits.length && !phraseInText(why, answer)) return false;
  }
  return true;
}

function asEliminatedList(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.map((item) => normalizeChoice(item)).filter(Boolean);
}

function eliminateOneIncorrectOption(options, answer, alreadyEliminated) {
  const list = uniqueOptions(options || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const used = asEliminatedList(alreadyEliminated);
  const wrong = list.filter(
    (item) => !answersEquivalent(item, answer) && !used.some((entry) => answersEquivalent(entry, item))
  );
  return wrong.length ? shuffle(wrong)[0] : "";
}

function normalizeImportedCard(raw) {
  const front = String(raw?.front || "").trim();
  const back = String(raw?.back || "").trim();
  const explanation = String(raw?.explanation || "").trim();
  const answerHighlight = pickAnswerHighlight(
    front,
    back,
    raw?.answerHighlight || raw?.highlight || raw?.answerKey
  );
  return { front, back, answerHighlight, explanation };
}

function suggestedHighlight(raw) {
  return raw?.answerHighlight || raw?.highlight || raw?.answerKey || "";
}

function hasUsableAnswerHighlight(front, back, highlight) {
  const body = String(back || "").trim();
  const spans = parseHighlights(highlight, body);
  const snapped = spans[0]?.text || findInBack(body, stripLeadingArticle(highlight));
  return Boolean(snapped) && isConfidentHighlight(snapped, body, front);
}

function topicTermFromFront(front) {
  const q = String(front || "").trim().replace(/[?]+$/, "");
  const roleSubject = q.match(
    /^(?:what|who)\s+is\s+([A-Za-z][A-Za-z0-9-]{1,40})(?:'s|’s)\s+primary\s+role\b/i
  );
  if (roleSubject?.[1]) return stripLeadingArticle(roleSubject[1]);
  const patterns = [
    /^(?:what|who|where|when)\s+(?:is|are|was|were)\s+(?:an?\s+|the\s+)?(.+)$/i,
    /^(?:define|explain|describe|identify)\s+(?:an?\s+|the\s+)?(.+)$/i,
    /^(?:what\s+does)\s+(.+?)\s+(?:mean|do|stand for)$/i,
  ];
  for (const re of patterns) {
    const match = q.match(re);
    if (!match) continue;
    let term = stripLeadingArticle(match[1].replace(/\s+(?:called|known as|used for)$/i, "").trim());
    term = term.replace(/\s+primary\s+role(?:\s+in\s+.+)?$/i, "").trim();
    if (term && wordCount(term) <= 6 && (isCompletePhrase(term) || wordCount(term) <= 3)) return term;
  }
  return "";
}

function extractGenerationKeyPhrase(front, back) {
  const body = String(back || "").trim();
  if (!body) return "";
  const candidates = [];
  const quoted = body.match(/["“]([^"”]+)["”]/);
  if (quoted) candidates.push(quoted[1]);
  const names = body.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z.'-]+)+)\b/g) || [];
  names.forEach((name) => candidates.push(name));
  const leadCap = body.match(/^([A-Z][a-z]{7,})\b/);
  if (leadCap) candidates.push(leadCap[1]);
  for (const candidate of candidates) {
    const snapped = findInBack(body, stripLeadingArticle(candidate));
    if (isConfidentHighlight(snapped, body, front)) return snapped;
  }
  return "";
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDefinitionBack(term, back) {
  const body = String(back || "").trim();
  const name = String(term || "").trim();
  if (!body || !name) return body;
  const strippedIs = body.replace(
    new RegExp(`^(?:an?\\s+|the\\s+)?${escapeRegex(name)}\\s+(?:is|are|was|were)\\s+`, "i"),
    ""
  );
  const rest = (strippedIs === body
    ? body.replace(new RegExp(`^(?:an?\\s+|the\\s+)?${escapeRegex(name)}[\\s.,:;\\-]*`, "i"), "")
    : strippedIs
  ).trim();
  if (!rest) return body;
  if (/^(?:is|are|was|were)\s+/i.test(rest)) return `${name} ${rest}`;
  const lead = rest.charAt(0).toLowerCase() + rest.slice(1);
  return `${name} is ${lead}`;
}

function cardWithHighlight(front, back, highlight, explanation) {
  const snapped = findInBack(back, stripLeadingArticle(highlight));
  if (!hasUsableAnswerHighlight(front, back, snapped)) return null;
  return {
    front,
    back,
    answerHighlight: snapped,
    explanation: String(explanation || "").trim(),
  };
}

/**
 * Generation-time gate: every AI card must store a complete answering phrase
 * separately from the full back. If the model did not, revise the card into a
 * definition form or drop it instead of saving a bad highlight.
 */
function finalizeGeneratedCard(raw) {
  const front = String(raw?.front || "").trim();
  const originalBack = String(raw?.back || "").trim();
  const explanation = String(raw?.explanation || "").trim();
  if (!front || !originalBack) return null;

  const suggested = suggestedHighlight(raw);
  const picked = pickAnswerHighlight(front, originalBack, suggested);
  const valid = cardWithHighlight(front, originalBack, picked || suggested, explanation);
  if (valid) return valid;

  const topic = topicTermFromFront(front);
  if (topic) {
    const definition = buildDefinitionBack(topic, originalBack);
    const revisedFront = /^(?:what|who|where|when)\s+(?:is|are|was|were)\b/i.test(front)
      ? front
      : `What is ${topic}?`;
    const fromDef = pickAnswerHighlight(revisedFront, definition, suggested);
    const defined = cardWithHighlight(revisedFront, definition, fromDef, explanation);
    if (defined) return defined;
  }

  const key = extractGenerationKeyPhrase(front, originalBack);
  if (key) {
    const keyed = cardWithHighlight(front, originalBack, key, explanation);
    if (keyed) return keyed;
    const leadBack = findInBack(originalBack, key) ? originalBack : `${key}. ${originalBack}`;
    const led = cardWithHighlight(front, leadBack, key, explanation);
    if (led) return led;
  }

  return null;
}

function normalizeGeneratedCards(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((raw) => {
    const card = finalizeGeneratedCard(raw);
    if (!card) return;
    const key = `${card.front.toLowerCase()}::${card.answerHighlight.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(card);
  });
  return out;
}

function toPersistedFlashcard(raw) {
  const card = finalizeGeneratedCard(raw) || normalizeImportedCard(raw);
  if (!card?.front || !card?.back) return null;
  return {
    front: card.front,
    back: card.back,
    answerHighlight: card.answerHighlight || "",
    explanation: card.explanation || "",
  };
}

function uniqueOptions(values) {
  const seen = new Set();
  const out = [];
  (values || []).forEach((value) => {
    const text = String(value || "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function normalizeChoice(text) {
  return String(text || "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

function isGenericChoice(text) {
  return /related but incorrect|common misconception|unrelated (?:detail|example|idea)|not the highlighted|not quite|none of the above|all of the above|a guess|a random detail|a core concept|review this card|the correct (?:answer|option|term)|the best (?:answer|option|term)|answer related to/i.test(
    String(text || "")
  );
}

function choicesConflict(a, b) {
  const left = normalizeChoice(a).toLowerCase();
  const right = normalizeChoice(b).toLowerCase();
  if (!left || !right) return true;
  if (left === right) return true;
  if (left.includes(right) && right.length >= Math.min(8, left.length * 0.55)) return true;
  if (right.includes(left) && left.length >= Math.min(8, right.length * 0.55)) return true;
  const leftTokens = contentTokens(left);
  const rightTokens = contentTokens(right);
  if (leftTokens.length && rightTokens.length) {
    const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
    if (overlap / Math.min(leftTokens.length, rightTokens.length) >= 0.85) return true;
  }
  return false;
}

function secondaryPhrases(back, correct) {
  const body = String(back || "");
  const extra = [];
  const ofAll = body.matchAll(/(?:a|an|the)\s+(\w+)\s+of\s+(?:(the|a|an)\s+)?(\w+)/gi);
  for (const match of ofAll) {
    extra.push(match[2] ? `${match[1]} of ${match[2]} ${match[3]}` : `${match[1]} of ${match[3]}`);
  }
  const quoted = body.match(/["“]([^"”]+)["”]/);
  if (quoted) extra.push(quoted[1]);
  const names = body.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z.'-]+)+)\b/g) || [];
  names.forEach((name) => extra.push(name));
  const tokens = contentTokens(body).filter((token) => !contentTokens(correct).includes(token) && token.length > 3);
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    extra.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  tokens.forEach((token) => extra.push(token));
  return uniqueOptions(extra)
    .map((item) => clipToPhrase(item, 4) || normalizeChoice(item))
    .filter((item) => item && !choicesConflict(item, correct) && !isGenericChoice(item) && wordCount(item) <= 4);
}

function buildValidatedMcqOptions(question, correct, distractors, back) {
  const answer = normalizeChoice(correct);
  if (!answer || !isUsableMcqChoice(answer, question)) return [];
  const pool = [];
  const add = (value) => {
    const raw = normalizeChoice(value);
    if (!raw || isIncompleteChoice(raw) || isMetaChoice(raw, question)) return;
    let text = wordCount(raw) <= 8 ? raw : clipToPhrase(raw, 4) || "";
    if (!text || !isUsableMcqChoice(text, question)) return;
    if (choicesTooSimilar(text, answer)) return;
    if (pool.some((item) => choicesTooSimilar(item, text))) return;
    pool.push(text);
  };
  (distractors || []).forEach(add);
  secondaryPhrases(back, answer).forEach(add);
  // For term/translation stems, question tokens (e.g. "Tagalog") make poor distractors.
  if (questionFocus(question) !== "term") {
    contentTokens(question).forEach((token) => {
      if (token.length > 4 && !contentTokens(answer).includes(token)) add(token);
    });
  }
  const options = uniqueOptions([answer, ...pool]).slice(0, 4);
  if (!options.some((item) => item.toLowerCase() === answer.toLowerCase())) {
    options.unshift(answer);
  }
  return options.filter((item) => isUsableMcqChoice(item, question)).slice(0, 4);
}

function validateMcqBundle(question, correct, options, back) {
  const answer = normalizeChoice(correct);
  const cleaned = uniqueOptions(options || [])
    .map(normalizeChoice)
    .filter((item) => item && isUsableMcqChoice(item, question));
  // Prefer a concrete matching option; never promote a meta label as the key.
  let matching =
    cleaned.find((item) => item.toLowerCase() === answer.toLowerCase())
    || cleaned.find((item) => answersEquivalent(item, answer))
    || (isUsableMcqChoice(answer, question) ? answer : "");
  if (matching && isMetaChoice(matching, question)) matching = "";
  if (!matching) {
    return {
      question: String(question || "").trim() || "What is the correct answer?",
      options: [],
      answer: "",
    };
  }
  const distractors = cleaned.filter((item) => !choicesTooSimilar(item, matching) && !isMetaChoice(item, question));
  let next = uniqueOptions([matching, ...distractors]);
  if (next.length < 4) {
    next = uniqueOptions([...next, ...buildValidatedMcqOptions(question, matching, distractors, back)]);
  }
  const exact = next.find((item) => item.toLowerCase() === matching.toLowerCase()) || matching;
  const unique = [];
  [exact, ...next.filter((item) => !choicesTooSimilar(item, exact))].forEach((item) => {
    if (!item || !isUsableMcqChoice(item, question)) return;
    if (unique.some((existing) => choicesTooSimilar(existing, item))) return;
    unique.push(item);
  });
  if (!unique.some((item) => item.toLowerCase() === exact.toLowerCase())) unique.unshift(exact);
  return {
    question: String(question || "").trim() || "What is the correct answer?",
    options: shuffle(unique.slice(0, Math.max(unique.length, 1))),
    answer: exact,
  };
}

function makeMcq(question, correct, distractors, back) {
  const options = buildValidatedMcqOptions(question, correct, distractors, back);
  return validateMcqBundle(question, correct, options, back);
}

function sanitizeTutorQuestion(raw, card, distractors, opts = {}) {
  const highlight = canonicalAnswer(card);
  const avoid = normalizeChoice(opts.avoidAnswer);
  let proposed = normalizeChoice(raw?.answer);
  const rawOptions = Array.isArray(raw?.options) ? raw.options : [];
  let question = String(raw?.question || "").trim();
  if (proposed && isMetaChoice(proposed, question)) proposed = "";
  const preferred =
    (opts.preferredAnswer && !isMetaChoice(opts.preferredAnswer, question) ? normalizeChoice(opts.preferredAnswer) : "")
    || "";
  if (
    !question
    || isGenericTutorPrompt(question)
    || (opts.avoidQuestion && questionsTooSimilar(question, opts.avoidQuestion))
    || isDefinitionSwapPrompt(question, opts.otherQuestion?.answer)
    || isDefinitionSwapPrompt(question, highlight)
    || !questionMentionsCard(question, card)
  ) {
    question = specificQuestionForCard(
      card,
      (proposed && isGroundedInCard(proposed, card) ? proposed : "") || preferred || highlight,
      opts.otherQuestion,
      opts.aspect || "definition"
    );
  }

  const cleanChoice = (value) => {
    const raw = normalizeChoice(value);
    if (!raw || isMetaChoice(raw, question)) return "";
    const compact = compactTutorAnswer(raw, question, card) || raw;
    if (!compact || isMetaChoice(compact, question) || !isUsableMcqChoice(compact, question)) return "";
    return compact;
  };
  const optionPool = uniqueOptions([
    cleanChoice(proposed),
    ...rawOptions.map((item) => cleanChoice(item)),
    cleanChoice(preferred),
    cleanChoice(highlight),
    cleanChoice(pickAlternateTutorAnswer(card, avoid || highlight, proposed)),
    cleanChoice(extractPurposePhrase(`${card?.back || ""} ${card?.explanation || ""}`)),
    cleanChoice(extractCharacteristicPhrase(card, avoid || highlight)),
    ...(distractors || []).map((item) => cleanChoice(item)),
  ]).filter(Boolean);

  let answer = pickBestAnswerForQuestion(question, optionPool, card, avoid);
  if (proposed) {
    const compactProposed = compactTutorAnswer(proposed, question, card) || proposed;
    if (
      answer
      && !isMetaChoice(compactProposed, question)
      && (answersEquivalent(proposed, answer) || answersEquivalent(compactProposed, answer))
    ) {
      answer = isUsableMcqChoice(compactProposed, question) ? compactProposed : answer;
    }
  }
  if (answer && isMetaChoice(answer, question)) answer = "";
  if (answer) {
    const compacted = compactTutorAnswer(answer, question, card);
    if (compacted && optionAnswersQuestion(question, compacted, card) && !isMetaChoice(compacted, question)) {
      answer = compacted;
    }
  }
  if (!answer || !optionAnswersQuestion(question, answer, card) || (avoid && answersEquivalent(answer, avoid))) {
    const candidates = uniqueOptions([
      extractPurposePhrase(`${card?.back || ""} ${card?.explanation || ""}`),
      preferred,
      highlight,
      pickAlternateTutorAnswer(card, avoid || highlight, proposed),
      ...optionPool,
    ]).filter((item) => item && !isMetaChoice(item, question));
    const fitted = pickBestAnswerForQuestion(question, candidates, card, avoid);
    if (fitted && optionAnswersQuestion(question, fitted, card)) {
      answer = fitted;
    } else {
      const fallbackAnswer =
        [preferred, highlight, pickAlternateTutorAnswer(card, avoid || highlight, proposed)].find(
          (item) => item && !isMetaChoice(item, question) && !(avoid && answersEquivalent(item, avoid))
        ) || highlight;
      const rewritten = specificQuestionForCard(card, fallbackAnswer, opts.otherQuestion, opts.aspect || "definition");
      if (rewritten && optionAnswersQuestion(rewritten, fallbackAnswer, card)) {
        question = rewritten;
        answer = fallbackAnswer;
      } else {
        question = String(card?.front || "").trim() || rewritten;
        answer = highlight;
      }
    }
  }
  if (!optionAnswersQuestion(question, answer, card)) {
    const retry = pickBestAnswerForQuestion(question, optionPool, card, avoid);
    if (retry && optionAnswersQuestion(question, retry, card)) {
      answer = retry;
    } else {
      const rewritten = specificQuestionForCard(card, highlight, opts.otherQuestion, opts.aspect || "definition");
      if (rewritten && optionAnswersQuestion(rewritten, highlight, card)) {
        question = rewritten;
        answer = highlight;
      }
    }
  }

  const extras = uniqueOptions([
    ...rawOptions.map((item) => compactTutorAnswer(item, question, card) || item),
    ...optionPool.filter((item) => scoreOptionForQuestion(question, item, card) < 8),
  ]).filter(
    (item) =>
      item
      && isUsableMcqChoice(item, question)
      && !isMetaChoice(item, question)
      && !answersEquivalent(item, answer)
      && !choicesTooSimilar(item, answer)
  );
  const generatedWhy = String(opts.generatedWhy || raw?.why || raw?.whyCorrect || "").trim();
  let bundle = finalizeTutorQuestion(makeMcq(question, answer, extras, card?.back), card, avoid);
  if (tutorQuestionIsSound(bundle, card, { ...opts, preferredAnswer: bundle.answer })) {
    return withTutorWhy(bundle, card, generatedWhy);
  }

  bundle = finalizeTutorQuestion(bundle, card, avoid);
  if (tutorQuestionIsSound(bundle, card, { ...opts, preferredAnswer: bundle.answer })) {
    return withTutorWhy(bundle, card, generatedWhy);
  }

  const rebuiltQuestion = specificQuestionForCard(card, highlight, opts.otherQuestion, "definition");
  const rebuilt = finalizeTutorQuestion(makeMcq(rebuiltQuestion, highlight, extras, card?.back), card, avoid);
  if (tutorQuestionIsSound(rebuilt, card, { ...opts, preferredAnswer: rebuilt.answer })) {
    return withTutorWhy(rebuilt, card, generatedWhy);
  }

  // Final deterministic rebuild from the card — do not return an ambiguous meta key.
  const safe = finalizeTutorQuestion(
    makeMcq(String(card?.front || "").trim() || rebuiltQuestion, highlight, distractors || extras, card?.back),
    card,
    avoid
  );
  if (tutorQuestionIsSound(safe, card, { ...opts, preferredAnswer: safe.answer || highlight })) {
    return withTutorWhy(safe, card, generatedWhy);
  }
  return withTutorWhy(safe.answer ? safe : rebuilt.answer ? rebuilt : bundle, card, generatedWhy);
}

function fallbackQuestionsForCard(card, others) {
  const primary = canonicalAnswer(card);
  const purpose = extractPurposePhrase(`${card?.back || ""} ${card?.explanation || ""}`);
  const characteristic = extractCharacteristicPhrase(card, primary);
  const distractors = (others || []).map((item) => canonicalAnswer(item)).filter(Boolean);
  const first = sanitizeTutorQuestion(
    { question: card?.front, answer: primary, options: [] },
    card,
    distractors,
    { preferredAnswer: primary, aspect: "definition" }
  );
  const secondAnswer = [purpose, characteristic, pickAlternateTutorAnswer(card, first.answer)].find(
    (item) => item && !answersEquivalent(item, first.answer)
  ) || pickAlternateTutorAnswer(card, first.answer);
  const second = sanitizeTutorQuestion(
    { question: "", answer: secondAnswer, options: uniqueOptions([...distractors, primary]) },
    card,
    distractors,
    {
      preferredAnswer: secondAnswer,
      avoidAnswer: first.answer,
      avoidQuestion: first.question,
      otherQuestion: first,
      aspect: purpose && answersEquivalent(secondAnswer, purpose) ? "application" : "characteristic",
    }
  );
  return [first, second];
}

function sanitizeQuizItem(raw, siblings = []) {
  const question = String(raw?.question || "").trim();
  const answer = normalizeChoice(raw?.answer);
  const options = Array.isArray(raw?.options) ? raw.options : [];
  const extras = (siblings || []).map((item) => normalizeChoice(item?.answer || item)).filter(Boolean);
  if (!question || !answer) return null;
  const bundle = validateMcqBundle(question, answer, [...options, ...extras], `${question} ${answer}`);
  if (!bundle.options.includes(bundle.answer) && !bundle.options.some((item) => item.toLowerCase() === bundle.answer.toLowerCase())) {
    return null;
  }
  return { type: "mcq", ...bundle };
}

function sanitizeQuizList(list) {
  const raw = Array.isArray(list) ? list : [];
  const answers = raw.map((item) => item?.answer).filter(Boolean);
  return raw
    .map((item) => {
      const type = String(item?.type || "mcq").toLowerCase();
      if (type !== "mcq") return item;
      return sanitizeQuizItem(item, answers);
    })
    .filter(Boolean);
}

function validateCardBundle(card) {
  const front = String(card?.front || card?.question || "").trim();
  const back = String(card?.back || "").trim();
  const highlight = displayHighlight({ ...card, front, back });
  const answer = canonicalAnswer({ ...card, front, back, answerHighlight: highlight });
  const options = Array.isArray(card?.options)
    ? validateMcqBundle(front, answer, card.options, back)
    : null;
  if (options && options.answer.toLowerCase() !== String(answer || "").toLowerCase()) {
    options.answer = answer;
    if (!options.options.some((item) => item.toLowerCase() === answer.toLowerCase())) {
      options.options = uniqueOptions([answer, ...options.options]).slice(0, 4);
    }
  }
  return {
    front,
    back,
    answerHighlight: highlight,
    answer,
    ...(options ? { options: options.options, correctOption: options.answer } : {}),
  };
}

function teachingSnippet(card) {
  const explanation = String(card?.explanation || "").trim();
  const back = String(card?.back || "").trim();
  return firstSentence(explanation || back) || String(explanation || back).replace(/\s+/g, " ").trim().slice(0, 180);
}

function joinTeaching(lead, snippet) {
  const a = String(lead || "").replace(/[.!?]+$/, "").trim();
  const b = String(snippet || "").replace(/[.!?]+$/, "").trim();
  if (!a) return b ? `${b}.` : "";
  if (!b || phraseInText(a, b) || phraseInText(b, a)) return `${a}.`;
  const aTokens = new Set(contentTokens(a));
  const bTokens = contentTokens(b);
  if (bTokens.length && bTokens.filter((token) => aTokens.has(token)).length / bTokens.length >= 0.7) {
    return `${a}.`;
  }
  return `${a}. ${b}.`;
}

function generatedWhyIsUsable(text, card, answer) {
  const why = String(text || "").trim();
  if (why.length < 20) return false;
  if (isIncompleteChoice(why)) return false;
  if (!isGroundedInCard(why, card) && !questionMentionsCard(why, card)) return false;
  const aTokens = contentTokens(answer);
  if (!aTokens.length) return true;
  const wTokens = new Set(contentTokens(why));
  const hits = aTokens.filter((token) => wTokens.has(token)).length;
  return hits >= Math.min(2, aTokens.length) || phraseInText(why, answer);
}

function buildTutorWhy(card, question, answer, generatedWhy) {
  const key = normalizeChoice(answer);
  if (generatedWhyIsUsable(generatedWhy, card, key)) return String(generatedWhy).trim().replace(/[.!?]+$/, "") + ".";
  const topic = cardTopicName(card);
  const focus = questionFocus(question);
  const snippet = teachingSnippet(card);
  const answerAlreadyNamesTopic = phraseInText(key, topic) || answersEquivalent(key, topic);
  if (focus === "purpose") {
    const purpose = /^to\s+/i.test(key) ? key : `to ${key}`;
    return joinTeaching(`${topic} is used ${purpose}`, snippet);
  }
  if (focus === "reason") {
    return joinTeaching(`${topic} is explained this way because of "${key}"`, snippet);
  }
  if (focus === "role") {
    return joinTeaching(`${topic}'s primary role is ${key}`, snippet);
  }
  if (focus === "characteristic" || focus === "example") {
    if (answerAlreadyNamesTopic) return joinTeaching(snippet || key, "");
    return joinTeaching(`${topic} is linked to ${key}`, snippet);
  }
  if (answerAlreadyNamesTopic) return joinTeaching(snippet || `The correct answer is ${key}`, "");
  return joinTeaching(`${topic} is best described as ${key}`, snippet);
}

function explainTutorChoice({ card, question, correct, selected, why, revealed } = {}) {
  const key = normalizeChoice(correct);
  const choice = normalizeChoice(selected);
  let whyCorrect = buildTutorWhy(card, question, key, why);
  const topic = cardTopicName(card);
  const focus = questionFocus(question);

  if (revealed && !choice) {
    return {
      title: "Let's review",
      whySelected: "",
      whyCorrect,
      body: whyCorrect,
    };
  }

  const isCorrect = Boolean(choice) && answersEquivalent(choice, key);
  if (isCorrect) {
    return {
      title: "That's right",
      whySelected: "",
      whyCorrect,
      body: whyCorrect,
      correctAnswer: key,
    };
  }

  let whySelected = `"${choice || "That option"}" does not answer this question.`;
  if (!choice) {
    whySelected = "No option was selected for this question.";
  } else if (isIncompleteChoice(choice) || isMetaChoice(choice, question)) {
    whySelected = `"${choice}" is not a valid answer choice for this question.`;
  } else if (answerEchoesQuestionSubject(question, choice) || answersEquivalent(choice, topic)) {
    whySelected = `"${choice}" names ${topic}, but this question is asking for something else about it.`;
  } else if (focus === "purpose" && (wordCount(choice) <= 2 || answersEquivalent(choice, canonicalAnswer(card)))) {
    whySelected = `"${choice}" is not the purpose. This question asks what ${topic} is used for.`;
  } else if (focus === "role" && /\b(?:plays as|acts as|serves as)\b/i.test(choice) && isIncompleteChoice(choice)) {
    whySelected = `"${choice}" is incomplete. Choose the full role name.`;
  } else if (focus === "term") {
    whySelected = `"${choice}" is not the term this question asks for. The correct answer is "${key}".`;
  } else if (!isGroundedInCard(choice, card)) {
    whySelected = `"${choice}" is not supported by this flashcard.`;
  } else {
    whySelected = `"${choice}" is related to the topic, but it is not what this question asks.`;
  }

  if (!whyCorrect.toLowerCase().includes(String(key || "").toLowerCase())) {
    whyCorrect = `The correct answer is "${key}". ${whyCorrect}`.replace(/\.\s*\./g, ".").trim();
  } else if (!/correct answer/i.test(whyCorrect)) {
    whyCorrect = `The correct answer is "${key}". ${whyCorrect}`.replace(/\.\s*\./g, ".").trim();
  }

  return {
    title: "Not quite",
    whySelected,
    whyCorrect,
    body: `${whySelected} ${whyCorrect}`.replace(/\s+/g, " ").trim(),
    correctAnswer: key,
  };
}

function withTutorWhy(bundle, card, generatedWhy) {
  if (!bundle) return bundle;
  return {
    ...bundle,
    why: buildTutorWhy(card, bundle.question, bundle.answer, generatedWhy),
  };
}

function fallbackExplanation(card) {
  const stored = String(card?.explanation || "").trim();
  if (stored) return stored;
  const answer = canonicalAnswer(card);
  const back = String(card?.back || "").trim();
  if (back && back !== answer) {
    return `The correct answer is "${answer}". ${back}`;
  }
  return `The correct answer is "${answer}". Review this idea and try explaining it in your own words.`;
}

function assembleTutorCard(card, others, generated) {
  const answerHighlight =
    serializeHighlights(parseHighlights(card.answerHighlight, card.back), card.back) || displayHighlight(card);
  const explanation = String(generated?.explanation || "").trim() || fallbackExplanation(card);
  const source = { ...card, explanation };
  const distractors = (others || []).map((item) => canonicalAnswer(item)).filter(Boolean);
  const generatedQuestions = Array.isArray(generated?.questions) ? generated.questions : [];
  const fallbacks = fallbackQuestionsForCard(source, others);
  const primary = canonicalAnswer(source);
  const firstRaw = generatedQuestions[0] || fallbacks[0];
  const firstProposed = String(firstRaw?.answer || "").trim();
  const firstFits =
    firstProposed
    && optionAnswersQuestion(firstRaw?.question, firstProposed, source)
    && questionMentionsCard(firstRaw?.question, source);

  const first = finalizeTutorQuestion(sanitizeTutorQuestion(firstRaw, source, distractors, {
    preferredAnswer: firstFits ? firstProposed : primary,
    aspect: firstFits && questionFocus(firstRaw?.question) !== "definition" ? questionFocus(firstRaw?.question) : "definition",
    generatedWhy: firstRaw?.why || firstRaw?.whyCorrect,
  }), source);
  const purpose = extractPurposePhrase(`${source.back || ""} ${source.explanation || ""}`);
  const characteristic = extractCharacteristicPhrase(source, first.answer);
  const generatedSecondRaw = generatedQuestions[1];
  const generatedSecond = String(generatedSecondRaw?.answer || "").trim();
  const generatedSecondFits =
    generatedSecond
    && !isGenericTutorPrompt(generatedSecondRaw?.question)
    && questionMentionsCard(generatedSecondRaw?.question, source)
    && optionAnswersQuestion(generatedSecondRaw?.question, generatedSecond, source)
    && !answersEquivalent(generatedSecond, first.answer)
    && !answersEquivalent(generatedSecond, cardTopicName(source));
  const alternate =
    [
      generatedSecondFits ? generatedSecond : "",
      purpose,
      characteristic,
      pickAlternateTutorAnswer(source, first.answer, generatedSecondFits ? generatedSecond : ""),
    ].find((item) => item && !answersEquivalent(item, first.answer) && isGroundedInCard(item, source) && !answersEquivalent(item, cardTopicName(source)))
    || pickAlternateTutorAnswer(source, first.answer, generatedSecondFits ? generatedSecond : "");
  const secondAspect = purpose && answersEquivalent(alternate, purpose) ? "application" : "characteristic";
  let second = sanitizeTutorQuestion(generatedQuestions[1] || fallbacks[1], source, distractors, {
    preferredAnswer: alternate || fallbacks[1]?.answer,
    avoidAnswer: first.answer,
    avoidQuestion: first.question,
    otherQuestion: first,
    aspect: secondAspect,
    generatedWhy: generatedQuestions[1]?.why || generatedQuestions[1]?.whyCorrect,
  });
  second = finalizeTutorQuestion(second, source, first.answer);
  if (questionsAreReversals(first, second) || isGenericTutorPrompt(second.question) || !optionAnswersQuestion(second.question, second.answer, source)) {
    const generatedSecondQuestion = String(generatedSecondRaw?.question || "").trim();
    const keepGeneratedPrompt =
      generatedSecondQuestion
      && !isGenericTutorPrompt(generatedSecondQuestion)
      && questionMentionsCard(generatedSecondQuestion, source);
    second = sanitizeTutorQuestion(
      {
        question: keepGeneratedPrompt ? generatedSecondQuestion : "",
        answer: alternate || second.answer,
        options: uniqueOptions([...(second.options || []), ...(generatedSecondRaw?.options || [])]),
      },
      source,
      distractors,
      {
        preferredAnswer: alternate || second.answer,
        avoidAnswer: first.answer,
        avoidQuestion: first.question,
        otherQuestion: first,
        aspect: secondAspect,
      }
    );
    second = finalizeTutorQuestion(second, source, first.answer);
  }

  let finalizedFirst = finalizeTutorQuestion(first, source);
  let finalizedSecond = finalizeTutorQuestion(second, source, finalizedFirst.answer);

  const isPresentable = (bundle, avoidAnswer = "") => {
    const prompt = String(bundle?.question || "").trim();
    const key = normalizeChoice(bundle?.answer);
    const opts = uniqueOptions(bundle?.options || []);
    if (!prompt || !key || isMetaChoice(key, prompt) || isGenericTutorPrompt(prompt)) return false;
    if (opts.length < 4 || !findExactOption(opts, key)) return false;
    if (opts.filter((item) => answersEquivalent(item, key)).length !== 1) return false;
    if (opts.some((item) => isMetaChoice(item, prompt))) return false;
    if (avoidAnswer && answersEquivalent(key, avoidAnswer)) return false;
    for (let i = 0; i < opts.length; i += 1) {
      for (let j = i + 1; j < opts.length; j += 1) {
        if (choicesTooSimilar(opts[i], opts[j])) return false;
      }
    }
    return optionAnswersQuestion(prompt, key, source);
  };

  const repairQuestion = (bundle, avoidAnswer, avoidQuestion, otherQuestion, aspect) => {
    const soundOpts = { preferredAnswer: bundle?.answer, avoidAnswer, avoidQuestion, otherQuestion };
    if (tutorQuestionIsSound(bundle, source, soundOpts) || isPresentable(bundle, avoidAnswer)) {
      return withTutorWhy(bundle, source, bundle?.why);
    }
    const preferred =
      [
        aspect === "application" ? extractPurposePhrase(`${source.back || ""} ${source.explanation || ""}`) : "",
        extractCharacteristicPhrase(source, avoidAnswer || canonicalAnswer(source)),
        pickAlternateTutorAnswer(source, avoidAnswer || canonicalAnswer(source), ""),
        canonicalAnswer(source),
      ].find((item) => item && !isMetaChoice(item) && !(avoidAnswer && answersEquivalent(item, avoidAnswer)))
      || canonicalAnswer(source);

    const rebuilt = finalizeTutorQuestion(
      sanitizeTutorQuestion(
        {
          question: "",
          answer: preferred,
          options: uniqueOptions([...(bundle?.options || []), ...distractors, preferred]),
        },
        source,
        distractors,
        { preferredAnswer: preferred, avoidAnswer, avoidQuestion, otherQuestion, aspect: aspect || "definition" }
      ),
      source,
      avoidAnswer
    );
    if (tutorQuestionIsSound(rebuilt, source, { ...soundOpts, preferredAnswer: rebuilt.answer }) || isPresentable(rebuilt, avoidAnswer)) {
      return withTutorWhy(rebuilt, source, bundle?.why);
    }

    const prompt =
      specificQuestionForCard(source, preferred, otherQuestion, aspect || "characteristic")
      || String(source.front || "").trim();
    const fallback = finalizeTutorQuestion(makeMcq(prompt, preferred, distractors, source.back), source, avoidAnswer);
    return withTutorWhy(fallback, source, bundle?.why);
  };

  finalizedFirst = repairQuestion(finalizedFirst, "", "", null, "definition");
  finalizedSecond = repairQuestion(
    finalizedSecond,
    finalizedFirst.answer,
    finalizedFirst.question,
    finalizedFirst,
    secondAspect
  );

  const questions = [];
  if (isPresentable(finalizedFirst)) {
    questions.push(finalizedFirst);
  } else {
    const repairedFirst = repairQuestion(finalizedFirst, "", "", null, "definition");
    if (isPresentable(repairedFirst)) questions.push(repairedFirst);
  }

  const firstAnswer = questions[0]?.answer || "";
  if (isPresentable(finalizedSecond, firstAnswer)) {
    questions.push(finalizedSecond);
  } else {
    const replacement = repairQuestion(
      fallbacks[1] || finalizedSecond,
      firstAnswer,
      questions[0]?.question || finalizedFirst.question,
      questions[0] || finalizedFirst,
      "characteristic"
    );
    if (isPresentable(replacement, firstAnswer)) {
      questions.push(replacement);
    } else if (isPresentable(finalizedSecond)) {
      questions.push(finalizedSecond);
    }
  }

  // Never ship MCQs with missing/duplicate/ambiguous choices.
  const presentableQuestions = questions
    .map((bundle) => ({
      ...bundle,
      options: uniqueOptions(bundle?.options || []).slice(0, 4),
      answer: findExactOption(uniqueOptions(bundle?.options || []), bundle?.answer) || String(bundle?.answer || "").trim(),
      question: String(bundle?.question || "").trim(),
      why: String(bundle?.why || "").trim(),
    }))
    .filter((bundle) => isPresentable(bundle));

  return {
    cardId: card.id,
    front: card.front,
    back: card.back,
    answerHighlight,
    explanation: String(generated?.explanation || "").trim() || fallbackExplanation(card),
    questions: presentableQuestions,
  };
}

function assembleTutorLesson(collectionName, cards, generated) {
  const list = Array.isArray(cards) ? cards : [];
  const generatedCards = Array.isArray(generated?.cards) ? generated.cards : [];
  const lessonCards = list.map((card, index) => {
    const others = list.filter((item) => item.id !== card.id);
    const match =
      generatedCards.find((item) => String(item?.cardId || "") === String(card.id)) ||
      generatedCards.find((item) => Number(item?.index) === index + 1) ||
      generatedCards[index];
    return assembleTutorCard(card, others, match);
  });
  return {
    title: String(generated?.title || "").trim() || `Lesson: ${collectionName || "Flashcard deck"}`,
    cards: lessonCards,
  };
}

module.exports = {
  shuffle,
  snapHighlightToBack,
  highlightFromSelection,
  tokenizeAnswer,
  phraseFromTokenRange,
  spanFromTokenRange,
  parseHighlights,
  serializeHighlights,
  addHighlightSpan,
  removeHighlightAt,
  remapHighlights,
  tokenOverlapsSpans,
  tokenOverlapsHighlight,
  resolveSavedHighlight,
  pickAnswerHighlight,
  displayHighlight,
  summarizedAnswer,
  canonicalAnswer,
  hasUsableAnswerHighlight,
  buildValidatedMcqOptions,
  validateMcqBundle,
  sanitizeQuizList,
  validateCardBundle,
  buildFirstLetterClue,
  buildMaskedLetterClue,
  pickAlternateTutorAnswer,
  eliminateOneIncorrectOption,
  tutorQuestionIsSound,
  questionsAreReversals,
  pickBestAnswerForQuestion,
  optionAnswersQuestion,
  scoreOptionForQuestion,
  resolveTutorAnswerKey,
  finalizeTutorQuestion,
  findExactOption,
  isGenericTutorPrompt,
  isMetaChoice,
  answersEquivalent,
  viableAnswerOptions,
  normalizeImportedCard,
  finalizeGeneratedCard,
  normalizeGeneratedCards,
  toPersistedFlashcard,
  uniqueOptions,
  makeMcq,
  sanitizeTutorQuestion,
  fallbackQuestionsForCard,
  fallbackExplanation,
  buildTutorWhy,
  explainTutorChoice,
  assembleTutorCard,
  assembleTutorLesson,
};
