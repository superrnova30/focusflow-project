const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { role: "STUDENT", OR: [{ school: null }, { school: "" }] },
    data: { school: "FocusFlow University" },
  });
  console.log("updated", result.count);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
