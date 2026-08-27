const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  try {
    const u = await p.user.findUnique({ where: { email: 'dev+testuser@example.com' } });
    console.log(u ? u.passwordHash : 'NOTFOUND');
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
