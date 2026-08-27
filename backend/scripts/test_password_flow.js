const http = require('http');
const { PrismaClient } = require('@prisma/client');
const { verifyPassword } = require('../src/lib/auth');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request({ hostname: 'localhost', port: 4000, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function patch(path, token, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request({ hostname: 'localhost', port: 4000, path, method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Authorization': 'Bearer ' + token } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const email = 'dev+testuser@example.com';
    const oldPass = 'oldpassword';
    const newPass = 'newpassword123';

    console.log('Logging in...');
    const login = await post('/api/auth/login', { email, password: oldPass });
    console.log('Login response:', login.status, login.body);
    const parsed = JSON.parse(login.body || '{}');
    const token = parsed.token;
    if (!token) { console.error('No token from login'); process.exit(1); }

    console.log('Changing password...');
    const patched = await patch('/api/auth/me/password', token, { newPassword: newPass });
    console.log('Patch response:', patched.status, patched.body);

    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({ where: { email } });
    const matches = await verifyPassword(newPass, user.passwordHash);
    console.log('DB check matches new password?', matches);
    await prisma.$disconnect();
  } catch (e) {
    console.error('ERR', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
