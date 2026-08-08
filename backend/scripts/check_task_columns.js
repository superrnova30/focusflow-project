const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
(async () => {
  const prisma = new PrismaClient();
  try {
    const columns = await prisma.$queryRawUnsafe(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Task' ORDER BY ordinal_position"
    );
    console.log(JSON.stringify(columns, null, 2));
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
