const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
const geminiClient = hasGeminiKey ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
// Chat favors the low-latency model; heavier content generation can continue
// using GEMINI_MODEL independently.
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-flash-lite-latest';
const AI_MAX_OUTPUT_TOKENS = Number(process.env.AI_MAX_OUTPUT_TOKENS || 2200);
const { generateContentWithRetry } = require('../lib/genai_helper');
const { trimConversationHistory } = require('../lib/chat_history');
const { recordExchange } = require('../lib/chat_store');
const { enforceChatLimit } = require('../lib/featureLimits');

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
    'Use the conversation for context, but do not repeat an earlier answer unless the user explicitly asks you to.',
  ].join(' ');
}

function buildChatSystemPrompt() {
  return [
    'You are a helpful conversational assistant.',
    'Respond naturally and conversationally to greetings, short comments, and casual prompts.',
    'If the user asks for help or a specific topic, answer directly and clearly. Keep replies concise for casual chat and expand when the user requests depth.',
    'Avoid defaulting to study templates unless the user explicitly requests study help.',
    'Do not repeat previous replies or restate the same point multiple times.',
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

function removeRepeatedParagraphs(text) {
  const seen = new Set();
  return String(text || '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => {
      if (!paragraph) return false;
      const normalized = paragraph.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join('\n\n');
}

// POST /api/ai/chat
// Body: { messages: [{ role: 'user'|'assistant'|'system', content: '...' }, ...] }
// Persist the exchange so students can revisit it from the AI History screen.
// Best-effort: history must never break or delay the AI response itself.
async function saveHistory(userId, conversationId, userText, assistantContent, intent) {
  try {
    const conversation = await recordExchange({
      userId,
      conversationId,
      userText,
      assistantText: assistantContent,
      intent,
    });
    return conversation ? conversation.id : null;
  } catch (err) {
    console.warn('saveHistory skipped:', err && err.message ? err.message : err);
    return null;
  }
}

router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { messages } = req.body;
    const userId = req.user && req.user.id;
    const conversationId = req.body ? req.body.conversationId : undefined;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    if (!(await enforceChatLimit(req, res))) return;

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
        const savedForceId = await saveHistory(userId, conversationId, lastUserText, assistantMessage && assistantMessage.content, intent);
        return res.json({ reply: assistantMessage, conversationId: savedForceId, raw: { forcedOpenAI: true, openai: body } });
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
        const maxOutputTokens = intent === 'casual'
          ? 300
          : intent === 'study'
            ? Math.max(600, Math.min(AI_MAX_OUTPUT_TOKENS, 1600))
            : Math.max(400, Math.min(AI_MAX_OUTPUT_TOKENS, 900));
        const response = await generateContentWithRetry(geminiClient, {
          model: GEMINI_CHAT_MODEL,
          contents: prompt,
          config: { temperature: 0.55, maxOutputTokens },
        }, { maxAttempts: 2, baseDelay: 200 });

        const content = removeRepeatedParagraphs(extractGeminiText(response)) || 'Sorry, no response available.';

        const savedId = await saveHistory(userId, conversationId, lastUserText, content, intent);
        return res.json({ reply: { role: 'assistant', content }, conversationId: savedId, provider: 'gemini' });
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
              return res.status(502).json({
                error: 'AI providers unavailable',
                message: 'The AI providers are temporarily unavailable. Please try again shortly.',
              });
            }

            const choice = body.choices && body.choices[0];
            const assistantMessage = choice && choice.message
              ? { ...choice.message, content: removeRepeatedParagraphs(choice.message.content) }
              : { role: 'assistant', content: 'Sorry, no response available.' };
            const savedFallbackId = await saveHistory(userId, conversationId, lastUserText, assistantMessage.content, intent);
            return res.json({ reply: assistantMessage, conversationId: savedFallbackId, provider: 'openai' });
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
        const savedOpenAiId = await saveHistory(userId, conversationId, lastUserText, assistantMessage && assistantMessage.content, intent);
        return res.json({ reply: assistantMessage, conversationId: savedOpenAiId, raw: body });
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
    const status = err && (err.status || 500);
    const isDatabaseSetupError =
      err?.name === 'PrismaClientValidationError' ||
      err?.code === 'P2022' ||
      /Unknown argument|does not exist in the current database/i.test(err?.message || '');

    if (isDatabaseSetupError) {
      return res.status(503).json({
        error: 'AI chat is temporarily unavailable',
        message: 'The server is finishing an AI feature update. Please try again shortly.',
      });
    }

    return res.status(status >= 400 && status < 500 ? status : 500).json({
      error: 'AI chat unavailable',
      message: status >= 400 && status < 500
        ? (err?.message || 'The request could not be completed.')
        : 'FocusFlow AI could not complete that request. Please try again.',
    });
  }
});

module.exports = router;
