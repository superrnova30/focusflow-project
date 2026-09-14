(async () => {
  try {
    const port = process.env.TEST_PORT || 4001;
    const res = await fetch(`http://localhost:${port}/api/ai/debug-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello from node test' }] }),
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log('BODY', text);
  } catch (err) {
    console.error('ERR', err);
    process.exit(1);
  }
})();
