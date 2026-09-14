require('dotenv').config();
const fetch = global.fetch || require('node-fetch');
(async () => {
  try {
    const resp = await fetch('http://localhost:4001/api/ai/debug-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'I want to study photosynthesis' }] }),
    });
    const body = await resp.text();
    console.log('STATUS', resp.status);
    console.log('BODY', body.slice(0, 4000));
  } catch (e) {
    console.error('CALL ERROR', e);
  }
})();
