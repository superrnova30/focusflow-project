const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

prisma.user
  .findMany({ select: { email: true, role: true, name: true } })
  .then((users) => {
    console.log(JSON.stringify(users, null, 2));
  })
  .finally(() => prisma.$disconnect());
