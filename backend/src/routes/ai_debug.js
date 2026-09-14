const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const router = express.Router();

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
const geminiClient = hasGeminiKey ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

function extractGeminiText(response) {
  if (!response) return '';

  if (typeof response.text === 'string' && response.text.trim()) return response.text.trim();
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();

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
  if (!text) console.warn('extractGeminiText(debug): no text found in response');
  return text;
}

// POST /api/ai/debug-chat
// Body: { messages: [{ role: 'user'|'assistant'|'system', content: '...' }, ...] }
router.post('/debug-chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

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
          body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, max_tokens: 800 }),
        });
        const body = await resp.json();
        if (body && body.error) {
          return res.status(502).json({ reply: { role: 'assistant', content: `AI fallback error: ${body.error.message || JSON.stringify(body.error)}` }, raw: { openai: body } });
        }
        const choice = body.choices && body.choices[0];
        const assistantMessage = choice && choice.message ? choice.message : { role: 'assistant', content: 'Sorry, no response available.' };
        return res.json({ reply: assistantMessage, raw: { forcedOpenAI: true, openai: body } });
      } catch (openaiErr) {
        console.error('Forced OpenAI fallback failed in debug route', openaiErr);
        return res.status(502).json({ error: 'Forced OpenAI fallback failed', raw: openaiErr });
      }
    }

    if (!geminiClient) return res.status(500).json({ error: 'Gemini client not configured' });

    const prompt = messages
      .map((message) => `${message.role || 'user'}: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`)
      .join('\n');

    const { generateContentWithRetry } = require('../lib/genai_helper');
    try {
      const response = await generateContentWithRetry(geminiClient, {
        model: GEMINI_MODEL,
        contents: prompt,
        config: { temperature: 0.4, maxOutputTokens: 800 },
      });
      const content = extractGeminiText(response) || 'Sorry, no response available.';
      return res.json({ reply: { role: 'assistant', content }, raw: response });
    } catch (gemErr) {
      const bodyText = gemErr && (gemErr.body ? (typeof gemErr.body === 'string' ? gemErr.body : JSON.stringify(gemErr.body)) : '');
      const isUnavailable = gemErr && (gemErr.status === 503 || /unavailable|currently experiencing high demand|503/i.test(bodyText));
      const isRateLimited = gemErr && (gemErr.status === 429 || /429|rate limit/i.test(bodyText));

      if ((isUnavailable || isRateLimited) && process.env.OPENAI_API_KEY) {
        try {
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, max_tokens: 800 }),
          });
          const body = await resp.json();
          if (body && body.error) {
            const errMsg = body.error.message || JSON.stringify(body.error);
            const assistantMessage = { role: 'assistant', content: `AI fallback error: ${errMsg}` };
            return res.status(502).json({ reply: assistantMessage, raw: { geminiError: bodyText, openai: body } });
          }
          const choice = body.choices && body.choices[0];
          const assistantMessage = choice && choice.message ? choice.message : { role: 'assistant', content: 'Sorry, no response available.' };
          return res.json({ reply: assistantMessage, raw: { geminiError: bodyText, openai: body } });
        } catch (openaiErr) {
          console.error('OpenAI fallback failed in debug route', openaiErr);
          throw gemErr;
        }
      }

      throw gemErr;
    }
  } catch (err) {
    console.error('AI debug error', err);
    const message = err && (err.message || String(err));
    const status = err && (err.status || 500);
    if (status === 429 || /429|rate limit/i.test(message)) {
      return res.status(429).json({ error: 'The AI service is rate-limited right now. Please try again in a moment.' });
    }
    return res.status(500).json({ error: 'Internal AI error', details: message });
  }
});

module.exports = router;
