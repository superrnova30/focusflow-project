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

export function snapHighlightToBack(back, highlight) {
  return findInBack(back, highlight);
}

function isWordChar(ch) {
  return /[A-Za-z0-9'’-]/.test(ch);
}

export function highlightFromSelection(text, start, end) {
  const body = String(text || "");
  let from = Math.max(0, Math.min(Number(start) || 0, Number(end) || 0));
  let to = Math.max(Number(start) || 0, Number(end) || 0);
  if (to > body.length) to = body.length;
  if (to <= from) return "";
  while (from > 0 && isWordChar(body[from - 1])) from -= 1;
  while (to < body.length && isWordChar(body[to])) to += 1;
  return body.slice(from, to).replace(/^\s+|[.,;:!?]+$|\s+$/g, "").replace(/\s+/g, " ").trim();
}

export function tokenizeAnswer(text) {
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

export function phraseFromTokenRange(text, from, to) {
  return spanFromTokenRange(text, from, to)?.text || "";
}

export function spanFromTokenRange(text, from, to) {
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

export function mergeSpans(body, spans) {
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

export function parseHighlights(raw, back) {
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

export function serializeHighlights(spans, body) {
  if (!spans || !spans.length) return "";
  const uniquePhrase = spans.length === 1 && findOccurrences(body || "", spans[0].text).length <= 1;
  if (uniquePhrase) return spans[0].text;
  return JSON.stringify(spans.map((span) => ({ start: span.start, end: span.end, text: span.text })));
}

export function addHighlightSpan(body, raw, span) {
  const existing = parseHighlights(raw, body);
  if (!span || !(span.end > span.start)) return serializeHighlights(existing, body);
  const covered = existing.some((item) => span.start >= item.start && span.end <= item.end);
  if (covered) return serializeHighlights(existing, body);
  return serializeHighlights(mergeSpans(body, [...existing, span]), body);
}

export function removeHighlightAt(body, raw, index) {
  const existing = parseHighlights(raw, body);
  if (index < 0 || index >= existing.length) return serializeHighlights(existing, body);
  existing.splice(index, 1);
  return serializeHighlights(existing, body);
}

export function remapHighlights(oldText, newText, raw) {
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

export function tokenOverlapsSpans(token, spans) {
  if (!token?.isWord || !spans?.length) return false;
  return spans.some((span) => token.start < span.end && token.end > span.start);
}

export function tokenOverlapsHighlight(token, text, highlight) {
  return tokenOverlapsSpans(token, parseHighlights(highlight, text));
}

export function resolveSavedHighlight(front, back, requested) {
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

export function pickAnswerHighlight(front, back, suggested) {
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

export function displayHighlight(card) {
  const back = String(card?.back || card?.answer || "").trim();
  const spans = parseHighlights(card?.answerHighlight, back);
  if (spans.length) return spans[0].text;
  return pickAnswerHighlight(card?.front || card?.question, back, "");
}

export function summarizedAnswer(card) {
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

export function canonicalAnswer(card) {
  const back = String(card?.back || card?.answer || "").trim();
  return summarizedAnswer(card) || back;
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
  return /related but incorrect|common misconception|unrelated (?:detail|example|idea)|not the highlighted|not quite|none of the above|a guess|a random detail|a core concept|review this card/i.test(
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
  return false;
}

export function buildValidatedMcqOptions(question, correct, distractors, back) {
  const answer = normalizeChoice(correct);
  if (!answer) return [];
  const pool = [];
  const add = (value) => {
    const text = normalizeChoice(value);
    if (!text || isGenericChoice(text) || wordCount(text) > 8) return;
    if (choicesConflict(text, answer)) return;
    if (pool.some((item) => choicesConflict(item, text))) return;
    pool.push(text);
  };
  (distractors || []).forEach(add);
  uniqueOptions(contentTokens(back).filter((token) => !contentTokens(answer).includes(token))).forEach(add);
  const options = uniqueOptions([answer, ...pool]).slice(0, 4);
  if (!options.some((item) => item.toLowerCase() === answer.toLowerCase())) options.unshift(answer);
  return options.slice(0, 4);
}

function suggestedHighlight(raw) {
  return raw?.answerHighlight || raw?.highlight || raw?.answerKey || "";
}

export function hasUsableAnswerHighlight(front, back, highlight) {
  const body = String(back || "").trim();
  const spans = parseHighlights(highlight, body);
  const snapped = spans[0]?.text || findInBack(body, stripLeadingArticle(highlight));
  return Boolean(snapped) && isConfidentHighlight(snapped, body, front);
}

function topicTermFromFront(front) {
  const q = String(front || "").trim().replace(/[?]+$/, "");
  const patterns = [
    /^(?:what|who|where|when)\s+(?:is|are|was|were)\s+(?:an?\s+|the\s+)?(.+)$/i,
    /^(?:define|explain|describe|identify)\s+(?:an?\s+|the\s+)?(.+)$/i,
    /^(?:what\s+does)\s+(.+?)\s+(?:mean|do|stand for)$/i,
  ];
  for (const re of patterns) {
    const match = q.match(re);
    if (!match) continue;
    const term = stripLeadingArticle(match[1].replace(/\s+(?:called|known as|used for)$/i, "").trim());
    if (term && wordCount(term) <= 6 && isCompletePhrase(term)) return term;
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

export function finalizeGeneratedCard(raw) {
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

export function splitHighlightedText(text, highlight, front) {
  const body = String(text || "");
  if (!body) return [{ text: "", highlight: false }];
  let spans = parseHighlights(highlight, body);
  if (!spans.length && highlight) {
    const picked = pickAnswerHighlight(front, body, typeof highlight === "string" ? highlight : "");
    spans = parseHighlights(picked, body);
  }
  if (!spans.length) return [{ text: body, highlight: false }];
  const parts = [];
  let cursor = 0;
  spans.forEach((span) => {
    if (span.start > cursor) parts.push({ text: body.slice(cursor, span.start), highlight: false });
    parts.push({ text: body.slice(span.start, span.end), highlight: true });
    cursor = span.end;
  });
  if (cursor < body.length) parts.push({ text: body.slice(cursor), highlight: false });
  return parts.length ? parts : [{ text: body, highlight: false }];
}
