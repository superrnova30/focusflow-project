(async () => {
  try {
    const res = await fetch('http://localhost:4000/api/ai/debug-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello, please use OpenAI now' }], forceOpenAI: true }),
    });
    console.log('STATUS', res.status);
    console.log(await res.text());
  } catch (err) {
    console.error('ERR', err);
    process.exit(1);
  }
})();
