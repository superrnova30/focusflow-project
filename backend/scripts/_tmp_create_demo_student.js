const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Demo@123", 10);
  const user = await prisma.user.upsert({
    where: { email: "student1@school.edu" },
    update: { passwordHash, role: "STUDENT", emailVerified: true },
    create: {
      name: "Mika Santos",
      email: "student1@school.edu",
      passwordHash,
      role: "STUDENT",
      emailVerified: true,
    },
  });
  console.log("ready", user.email, user.role);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
