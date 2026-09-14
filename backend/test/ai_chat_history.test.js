const test = require('node:test');
const assert = require('node:assert/strict');

const { trimConversationHistory } = require('../src/lib/chat_history');

test('trimConversationHistory keeps recent conversation and drops system prompt from the API payload', () => {
  const messages = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'm1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'm2' },
    { role: 'assistant', content: 'a2' },
    { role: 'user', content: 'm3' },
    { role: 'assistant', content: 'a3' },
    { role: 'user', content: 'm4' },
    { role: 'assistant', content: 'a4' },
    { role: 'user', content: 'm5' },
    { role: 'assistant', content: 'a5' },
  ];

  const trimmed = trimConversationHistory(messages, 6);

  assert.deepEqual(trimmed, [
    { role: 'user', content: 'm3' },
    { role: 'assistant', content: 'a3' },
    { role: 'user', content: 'm4' },
    { role: 'assistant', content: 'a4' },
    { role: 'user', content: 'm5' },
    { role: 'assistant', content: 'a5' },
  ]);
});

test('generateStudyPack falls back to local content when providers are unavailable', async () => {
  const originalGemini = process.env.GEMINI_API_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;

  process.env.GEMINI_API_KEY = '';
  process.env.OPENAI_API_KEY = '';
  delete require.cache[require.resolve('../src/lib/ai')];

  try {
    const { generateStudyPack } = require('../src/lib/ai');
    const pack = await generateStudyPack('Psychology', 'Cognition, behavior, memory');

    assert.ok(pack && typeof pack.summary === 'string');
    assert.ok(Array.isArray(pack.keyConcepts) && pack.keyConcepts.length > 0);
    assert.ok(Array.isArray(pack.flashcards) && pack.flashcards.length > 0);
  } finally {
    process.env.GEMINI_API_KEY = originalGemini;
    process.env.OPENAI_API_KEY = originalOpenAI;
    delete require.cache[require.resolve('../src/lib/ai')];
  }
});
