const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// POST /api/ai/chat
// Body: { messages: [{ role: 'user'|'assistant'|'system', content: '...' }, ...] }
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // If an OpenAI key is available, proxy the conversation to OpenAI's chat API.
    if (process.env.OPENAI_API_KEY) {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: 'gpt-3.5-turbo', messages, max_tokens: 800 }),
      });

      const body = await resp.json();
      const choice = body.choices && body.choices[0];
      const assistantMessage = choice && choice.message ? choice.message : { role: 'assistant', content: 'Sorry, no response available.' };
      return res.json({ reply: assistantMessage, raw: body });
    }

    // Fallback: simple deterministic assistant reply when no OpenAI key.
    const last = messages[messages.length - 1];
    const userContent = (last && last.content) || '';
    const fallback = {
      role: 'assistant',
      content:
        `I don't have access to an AI service right now, but I can still help. ` +
        `About "${userContent}": try asking for a summary, a set of practice questions, ` +
        `or a list of important terms. Which would you like?`,
    };
    return res.json({ reply: fallback });
  } catch (err) {
    console.error('AI chat error', err);
    return res.status(500).json({ error: 'Internal AI error' });
  }
});

module.exports = router;
