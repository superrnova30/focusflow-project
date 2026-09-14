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

    let messages = [];
    async function send(msg) {
      messages.push({ role: 'user', content: msg });
      const resp = await fetch('http://localhost:4001/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages }),
      });
      const body = await resp.json();
      console.log('STATUS', resp.status, 'REPLY', body.reply && body.reply.content && body.reply.content.slice(0,200));
      if (body && body.reply) messages.push(body.reply);
    }

    await send('Hi');
    await send('I want to study Mathematics');
    await send('Can you explain algebra?');
    await send('Give me 5 practice problems');

  } catch (e) {
    console.error('ERR', e && e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
