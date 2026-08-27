const http = require('http');
const { PrismaClient } = require('@prisma/client');
const { verifyPassword } = require('../src/lib/auth');

function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = { hostname: 'localhost', port: 4000, path, method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const email = `e2e+${Date.now()}@example.com`;
  const initial = 'InitPass!234';
  const updated = 'NewPass!456';
  try {
    console.log('Signing up', email);
    const signup = await request('POST', '/api/auth/signup', { name: 'E2E Tester', email, password: initial });
    console.log('signup', signup.status, signup.body);
    if (signup.status !== 201) throw new Error('Signup failed');
    const token = JSON.parse(signup.body).token;
    if (!token) throw new Error('No token from signup');

    console.log('Patching password');
    const patch = await request('PATCH', '/api/auth/me/password', { newPassword: updated }, token);
    console.log('patch', patch.status, patch.body);
    if (patch.status < 200 || patch.status >= 300) throw new Error('Patch failed');

    console.log('Verifying DB hash');
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('User not found in DB');
    const matches = await verifyPassword(updated, user.passwordHash);
    console.log('DB matches updated password?', matches);
    if (!matches) throw new Error('DB hash did not match new password');

    console.log('Attempting login with new password');
    const login = await request('POST', '/api/auth/login', { email, password: updated });
    console.log('login', login.status, login.body);
    if (login.status !== 200) throw new Error('Login with new password failed');

    console.log('E2E password-change test: SUCCESS');
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('E2E FAILED:', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
