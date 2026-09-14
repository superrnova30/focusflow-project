const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
const geminiClient = hasGeminiKey ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const AI_MAX_OUTPUT_TOKENS = Number(process.env.AI_MAX_OUTPUT_TOKENS || 2200);
const { generateContentWithRetry } = require('../lib/genai_helper');
const { generateStudyPack } = require('../lib/ai');
const { trimConversationHistory } = require('../lib/chat_history');

function looksCutOff(text) {
  const value = String(text || '').trim();
  if (!value || value.length < 180) return false;
  return !/[.!?]["')\]]?\s*$/.test(value);
}

async function continueIncompleteGeminiReply(previousText, lastUserText) {
  if (!previousText || !looksCutOff(previousText)) return previousText;

  const continuationPrompt = [
    'The previous answer was cut off. Continue exactly from the last sentence and finish the explanation completely.',
    'Do not repeat the introduction or merge unrelated ideas; continue naturally from what was already said.',
    'Keep the response complete, coherent, and useful with a clear ending or takeaway.',
    'Previous answer that was cut off:', previousText.slice(-1400),
    'User context:', lastUserText || 'general study question',
  ].join('\n');

  try {
    const response = await generateContentWithRetry(geminiClient, {
      model: GEMINI_MODEL,
      contents: continuationPrompt,
      config: { temperature: 0.4, maxOutputTokens: Math.max(1200, AI_MAX_OUTPUT_TOKENS) },
    });
    const nextText = extractGeminiText(response);
    if (nextText && nextText.length > 40) {
      return `${previousText.trim()} ${nextText.trim()}`;
    }
  } catch (err) {
    console.warn('Gemini continuation failed:', err && err.message ? err.message : err);
  }

  return previousText;
}

function buildTutorSystemPrompt() {
  return [
    'You are an expert study tutor and subject mentor.',
    'Give full, helpful, teaching-style answers that are clear, detailed, and structured.',
    'For study requests, explain the topic with a clear overview, key ideas, practical examples, and a simple learning plan or next steps.',
    'Do not ask several follow-up questions immediately. First give useful information and guidance.',
    'Only ask a few short follow-up questions at the very end if they are truly needed.',
    'Write in natural, encouraging language and aim for a complete answer instead of a short generic reply.',
    'Do not truncate mid-sentence or stop early. Finish the explanation in one coherent response.',
    'If the user asks a broad topic like a subject, provide a solid introduction plus a learning roadmap and examples.',
  ].join(' ');
}

function buildChatSystemPrompt() {
  return [
    'You are a helpful conversational assistant.',
    'Respond naturally and conversationally to greetings, short comments, and casual prompts.',
    'If the user asks for help or a specific topic, answer directly and clearly. Keep replies concise for casual chat and expand when the user requests depth.',
    'Avoid defaulting to study templates unless the user explicitly requests study help.',
  ].join(' ');
}

function detectIntent(text) {
  if (!text || !String(text).trim()) return 'other';
  const s = String(text).toLowerCase();
  const greetings = /^(hi|hello|hey|yo|good morning|good afternoon|good evening)\b/;
  const casual = /(i'?m bored|i am bored|i feel bored|bored|what's up|whats up|how are you|sup|thanks|thank you|cool)\b/;
  const study = /\b(study|study pack|flashcards|quiz|notes|explain|summar|photosynthesis|psychology|chemistry|math|biology|history)\b/;
  if (greetings.test(s) || casual.test(s)) return 'casual';
  if (study.test(s)) return 'study';
  return 'other';
}

function buildLocalTutorFallback(lastUserText = '') {
  const topic = String(lastUserText || 'your topic').trim() || 'your topic';
  return [
    `Let’s look at ${topic} in a practical way.`,
    '',
    'A good way to study this is to start with the big idea: what is the topic trying to explain, and why does it matter?',
    'Then break it into 3–5 core concepts. Learn the key definitions, the main examples, and how those ideas connect to real-world situations.',
    'A useful study method is to review the concept, explain it in your own words, and then test yourself with short questions or flashcards.',
    'For example, if you are learning a subject like psychology, focus on major ideas such as cognition, behavior, memory, motivation, and social influence. Try to connect each concept to a real-life example so it sticks.',
    'A simple study plan is: 1) read the overview, 2) learn the key terms, 3) review one example, 4) explain it aloud, and 5) test yourself with 5–10 recall questions.',
    'If you want, I can turn this into a deeper topic breakdown, a quiz, or a step-by-step study plan for the exact subject you are learning.',
  ].join('\n');
}

function buildExpandedTutorPrompt(messages, lastUserMessage) {
  return [
    'The previous answer was too short and generic. Expand it into a complete, useful tutor response.',
    'Provide a meaningful overview, explain the core concepts clearly, include practical examples, and give a simple learning path or study strategy.',
    'Keep the tone warm and educational. Do not ask multiple questions first; only ask one brief follow-up at the end if necessary.',
    'Finish the response fully and do not stop early or cut off before the explanation is complete.',
    `User context: ${lastUserMessage || 'general study question'}`,
    `Conversation context: ${JSON.stringify(messages.slice(-6))}`,
  ].join('\n');
}

function extractGeminiText(response) {
  if (!response) return '';

  // quick checks for common top-level fields
  if (typeof response.text === 'string' && response.text.trim()) return response.text.trim();
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();

  // recursive search for the first non-empty string at likely keys
  const visited = new Set();
  function findText(obj) {
    if (!obj || visited.has(obj)) return null;
    if (typeof obj === 'string' && obj.trim()) return obj.trim();
    if (typeof obj !== 'object') return null;
    visited.add(obj);
    // prioritize common keys
    const keys = ['output_text', 'text', 'content', 'parts', 'outputs', 'candidates', 'message', 'messages'];
    for (const k of keys) {
      if (obj[k]) {
        const found = findText(obj[k]);
        if (found) return found;
      }
    }
    // generic traversal
    for (const k in obj) {
      try {
        const found = findText(obj[k]);
        if (found) return found;
      } catch (e) {
        // ignore circular or unexpected
      }
    }
    return null;
  }

  const text = findText(response) || '';
  if (!text) {
    console.warn('extractGeminiText: no text found in response shape. Keys:', Object.keys(response));
  }
  return text;
}

// Simple text normalization + Jaccard similarity to detect repeated or
// near-duplicate assistant replies. This is lightweight and avoids adding
// new dependencies while helping decide when to request a regeneration.
function normalizeTextForCompare(s) {
  if (!s) return '';
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a, b) {
  const aTokens = new Set((a || '').split(' ').filter(Boolean));
  const bTokens = new Set((b || '').split(' ').filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let intersection = 0;
  for (const t of aTokens) if (bTokens.has(t)) intersection += 1;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function isTooSimilar(a, b) {
  if (!a || !b) return false;
  const na = normalizeTextForCompare(a);
  const nb = normalizeTextForCompare(b);
  if (!na || !nb) return false;
  // If the shorter text is very short, fallback to exact equality check
  if (Math.min(na.length, nb.length) < 40) return na === nb;
  const jac = jaccardSimilarity(na, nb);
  return jac >= 0.6;
}

function isGenericReply(content, lastUserText) {
  if (!content) return true;
  const c = String(content || '').trim();
  if (c.length < 120) {
    // very short replies are often generic
    return true;
  }
  // common stocky phrases that signal a canned reply
  const genericPatterns = [/how can i help/i, /sorry[,\s]/i, /i'?m here to help/i, /no response available/i, /sorry, no response/i];
  if (genericPatterns.some((r) => r.test(c))) return true;
  // if user asked a specific question but content is short, mark generic
  if (lastUserText && lastUserText.length > 40 && c.length < 250) return true;
  return false;
}

// POST /api/ai/chat
// Body: { messages: [{ role: 'user'|'assistant'|'system', content: '...' }, ...] }
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const recentMessages = trimConversationHistory(messages, 8);
    const lastUserMessage = [...recentMessages].reverse().find((message) => (message.role || 'user') === 'user');
    const lastUserText = lastUserMessage && typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '';

    // Choose a system prompt based on a quick intent classification so casual
    // messages like "Hello" receive a conversational reply instead of the
    // default tutor-style study template.
    const intent = detectIntent(lastUserText);
    const systemPrompt = intent === 'study' ? buildTutorSystemPrompt() : buildChatSystemPrompt();
    // If forced to use OpenAI fallback, skip Gemini and call OpenAI directly.
    const forceOpenAIEnv = String(process.env.FORCE_OPENAI_FALLBACK || '').toLowerCase() === 'true';
    const forceOpenAIReq = req.body && req.body.forceOpenAI === true;
    const forceOpenAI = (forceOpenAIEnv || forceOpenAIReq) && Boolean(process.env.OPENAI_API_KEY);
    if (forceOpenAI) {
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              ...recentMessages,
            ],
            max_tokens: 1200,
            temperature: 0.5,
          }),
        });

        const body = await resp.json().catch(() => ({}));
        if (body && body.error) {
          return res.status(502).json({ error: 'OpenAI fallback error', details: body.error, raw: body });
        }
        const choice = body.choices && body.choices[0];
        const assistantMessage = choice && choice.message ? choice.message : { role: 'assistant', content: 'AI service responded unexpectedly. Please try again later.' };
        return res.json({ reply: assistantMessage, raw: { forcedOpenAI: true, openai: body } });
      } catch (openaiErr) {
        console.error('Forced OpenAI fallback failed', openaiErr);
        return res.status(502).json({ error: 'Forced OpenAI fallback failed', message: openaiErr && (openaiErr.message || String(openaiErr)), raw: openaiErr });
      }
    }

    if (geminiClient) {
      const prompt = [
        systemPrompt,
        '',
        recentMessages
          .map((message) => `${message.role || 'user'}: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`)
          .join('\n')
      ].join('\n');

      try {
        const response = await generateContentWithRetry(geminiClient, {
          model: GEMINI_MODEL,
          contents: prompt,
          config: { temperature: 0.5, maxOutputTokens: Math.max(1800, AI_MAX_OUTPUT_TOKENS) },
        });

        let content = extractGeminiText(response) || 'Sorry, no response available.';
        if (looksCutOff(content)) {
          content = await continueIncompleteGeminiReply(content, lastUserText);
        }

        // If the model returned something too similar to recent assistant replies
        // or a short generic reply, attempt up to two regenerations with
        // stronger instructions and higher temperature to encourage variety.
        try {
          const lastAssistant = [...recentMessages].reverse().find((m) => (m.role || 'user') === 'assistant');
          const shouldRegenerate = lastAssistant && (isTooSimilar(content, lastAssistant.content) || isGenericReply(content, lastUserText));
          if (shouldRegenerate) {
            const maxAttempts = 2;
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
              const regenPrompt = [
                buildTutorSystemPrompt(),
                '\n',
                'Important: Do NOT repeat the previous assistant reply. Produce a fresh, specific, and helpful answer that directly addresses the user message. Avoid stock phrases and be concrete with examples, steps, and an ending takeaway when relevant.',
                `\nPrevious assistant reply excerpt (first 800 chars): ${String(lastAssistant.content || '').slice(0, 800)}`,
                `\nUser message: ${lastUserText || ''}`,
                `\nRegeneration attempt: ${attempt}/${maxAttempts}`,
              ].join('\n');

              const regenResponse = await generateContentWithRetry(geminiClient, {
                model: GEMINI_MODEL,
                contents: regenPrompt + '\n\n' + recentMessages
                  .map((message) => `${message.role || 'user'}: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`)
                  .join('\n'),
                config: { temperature: Math.min(0.7 + attempt * 0.1, 0.9), maxOutputTokens: Math.max(1200, AI_MAX_OUTPUT_TOKENS) },
              });

              const regenText = extractGeminiText(regenResponse);
              if (!regenText) continue;

              // Accept the regeneration if it's meaningfully different from the
              // last assistant reply and longer than the prior content.
              if (!isTooSimilar(regenText, lastAssistant.content) && regenText.trim().length > Math.max(80, content.trim().length - 20)) {
                content = regenText;
                break;
              }
            }
          }
        } catch (regenErr) {
          console.warn('Regeneration attempts failed:', regenErr && regenErr.message ? regenErr.message : regenErr);
        }
        const shortGeneric = content.length < 250 && /study|psychology|learn|explain|topic|subject|education/i.test(lastUserText || content);
        if (shortGeneric) {
          const expansion = await generateContentWithRetry(geminiClient, {
            model: GEMINI_MODEL,
            // For study-intent, expand using the tutor expansion; otherwise
            // expand using the system prompt but keep the user's context.
            contents: intent === 'study' ? buildExpandedTutorPrompt(recentMessages, lastUserText) : buildExpandedTutorPrompt(recentMessages, lastUserText),
            config: { temperature: 0.6, maxOutputTokens: 1400 },
          });
          const expanded = extractGeminiText(expansion);
          if (expanded && expanded.length > content.length) content = expanded;
        }

        return res.json({ reply: { role: 'assistant', content }, raw: response });
      } catch (gemErr) {
        const bodyText = gemErr && (gemErr.body ? (typeof gemErr.body === 'string' ? gemErr.body : JSON.stringify(gemErr.body)) : '');
        const isUnavailable = gemErr && (gemErr.status === 503 || /unavailable|currently experiencing high demand|503|RESOURCE_EXHAUSTED|quota|credit_balance_exhausted|insufficient_quota/i.test(bodyText || String(gemErr)));
        const isRateLimited = gemErr && (gemErr.status === 429 || /429|rate limit|quota|credit_balance_exhausted|insufficient_quota/i.test(bodyText || String(gemErr)));

        if ((isUnavailable || isRateLimited) && process.env.OPENAI_API_KEY) {
          try {
                const resp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                      { role: 'system', content: buildTutorSystemPrompt() },
                  ...recentMessages,
                ],
                max_tokens: 1200,
                temperature: 0.5,
              }),
            });

            const body = await resp.json().catch(() => ({}));
            // If OpenAI returned an error (insufficient credits, quota exhausted, etc.),
            // return a useful local tutor-style fallback instead of surfacing a 429/502.
            if (body && body.error) {
              const errMsg = body.error.message || JSON.stringify(body.error);
              console.warn('OpenAI fallback error', errMsg);

              try {
                const last = messages && messages.length ? messages[messages.length - 1] : null;
                const userContent = last && last.content ? String(last.content) : '';
                const isStudyIntent = /study|study pack|flashcards|quiz|notes|explain|summar/i.test(userContent);
                if (isStudyIntent) {
                  const pack = await generateStudyPack(userContent || 'the requested topic', '');
                  const assistantMessage = { role: 'assistant', content: pack.summary || 'AI fallback: unable to generate study pack right now. Please try again later.' };
                  return res.json({ reply: assistantMessage, raw: { geminiError: bodyText, openai: body, fallback: 'local study pack used' } });
                }
              } catch (localErr) {
                console.error('Local study fallback failed', localErr);
              }

              const assistantMessage = { role: 'assistant', content: 'AI fallback: upstream provider returned an error. Please try again later.' };
              return res.json({ reply: assistantMessage, raw: { geminiError: bodyText, openai: body, fallback: 'local tutor fallback used' } });
            }

            const choice = body.choices && body.choices[0];
            let assistantMessage = choice && choice.message ? choice.message : { role: 'assistant', content: 'Sorry, no response available.' };
              const shortGenericResult = String(assistantMessage.content || '').length < 250 && /study|psychology|learn|explain|topic|subject|education/i.test(lastUserText || String(assistantMessage.content || ''));
              if (shortGenericResult && process.env.OPENAI_API_KEY) {
                const expandedResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                  },
                  body: JSON.stringify({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    messages: [
                      { role: 'system', content: buildTutorSystemPrompt() + ' Expand the previous answer into a complete, detailed tutor-style explanation with examples and a learning plan.' },
                      { role: 'user', content: buildExpandedTutorPrompt(recentMessages, lastUserText) },
                    ],
                    max_tokens: 1400,
                    temperature: 0.6,
                  }),
                });
                const expandedBody = await expandedResponse.json();
                const expandedChoice = expandedBody.choices && expandedBody.choices[0];
                const expandedText = expandedChoice && expandedChoice.message && expandedChoice.message.content ? expandedChoice.message.content : assistantMessage.content;
                if (expandedText && String(expandedText).length > String(assistantMessage.content || '').length) {
                  assistantMessage = { role: 'assistant', content: String(expandedText) };
                }
              }
              return res.json({ reply: assistantMessage, raw: { geminiError: bodyText, openai: body } });
          } catch (openaiErr) {
            console.error('OpenAI fallback failed', openaiErr);
          }
        }

        // If both upstream providers are exhausted, rate-limited, or unavailable,
        // surface an explicit error so the frontend can show provider details
        // instead of returning a canned study-template response.
        console.warn('AI providers unavailable', { gemini: bodyText, lastUserText });
        return res.status(502).json({ error: 'AI providers unavailable', message: bodyText || 'No provider details', raw: { geminiError: bodyText } });
      }
    }

    if (process.env.OPENAI_API_KEY) {
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              ...recentMessages,
            ],
            max_tokens: 1200,
            temperature: 0.5,
          }),
        });

        const body = await resp.json().catch(() => ({}));
        if (body && body.error) {
          // Surface OpenAI error to client for debugging
          return res.status(502).json({ error: 'OpenAI fallback error', details: body.error, raw: body });
        }

        const choice = body.choices && body.choices[0];
        const assistantMessage = choice && choice.message ? choice.message : { role: 'assistant', content: 'AI service responded unexpectedly. Please try again later.' };
        return res.json({ reply: assistantMessage, raw: body });
      } catch (openaiErr) {
        console.error('OpenAI fallback failed', openaiErr);
        return res.status(502).json({ error: 'OpenAI fallback failed', message: openaiErr && (openaiErr.message || String(openaiErr)), raw: openaiErr });
      }
    }

    // No AI providers configured
    const last = messages[messages.length - 1];
    const userContent = (last && last.content) || '';
    return res.status(503).json({ error: 'No AI provider configured', message: `No Gemini or OpenAI API key is available on the server. Request for: ${userContent}` });
  } catch (err) {
    console.error('AI chat error', err);
    const message = err && (err.message || String(err));
    const status = err && (err.status || 500);
    const bodyText = err && (err.body ? (typeof err.body === 'string' ? err.body : JSON.stringify(err.body)) : '');
    return res.status(status >= 400 ? status : 500).json({ error: 'AI chat error', message, body: bodyText || undefined, raw: err });
  }
});

module.exports = router;
