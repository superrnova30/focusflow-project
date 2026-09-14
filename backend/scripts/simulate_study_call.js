require('dotenv').config();
const fetch = global.fetch || require('node-fetch');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: 'student1@school.edu' } });
    if (!user) {
      console.error('No seeded user found. Run prisma seed.');
      process.exit(1);
    }
    const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    console.log('Signed token for user id', user.id);

    const resp = await fetch('http://localhost:4001/api/ai/study', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ topic: 'Mathematics', notes: '', mode: 'pack' }),
    });
    const text = await resp.text();
    console.log('STATUS', resp.status);
    console.log('BODY', text.slice(0, 4000));
  } catch (e) {
    console.error('ERR', e && e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
