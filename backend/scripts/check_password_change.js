const { PrismaClient } = require('@prisma/client');
const { verifyPassword } = require('../src/lib/auth');

async function main() {
  const [email, candidate] = process.argv.slice(2);
  if (!email || !candidate) {
    console.error('Usage: node check_password_change.js <email> <password>');
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { console.log('NOT_FOUND'); process.exit(0); }
    const ok = await verifyPassword(candidate, user.passwordHash);
    console.log(JSON.stringify({ email, matches: !!ok, id: user.id }));
  } catch (e) {
    console.error('ERR', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
