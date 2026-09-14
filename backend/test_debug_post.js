const http = require('http');
const url = require('url');

async function post(msg) {
  const data = JSON.stringify({ messages: [{ role: 'user', content: msg }] });
  const opts = url.parse('http://127.0.0.1:4000/api/ai/debug-chat');
  const options = { hostname: opts.hostname, port: opts.port, path: opts.path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c.toString());
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

(async () => {
  const msg = process.argv[2] || 'Hello';
  try {
    const r = await post(msg);
    console.log('STATUS', r.status);
    console.log(r.body);
  } catch (e) {
    console.error('ERR', e);
    process.exit(1);
  }
})();
