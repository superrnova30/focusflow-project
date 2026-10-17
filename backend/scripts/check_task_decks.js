const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    if (!prisma.taskDeck) {
      throw new Error("prisma.taskDeck is missing — client not regenerated");
    }
    const tasks = await prisma.task.findMany({
      take: 1,
      include: {
        decks: {
          include: {
            collection: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });
    console.log("taskDeck_ok", Boolean(prisma.taskDeck));
    console.log("sample_progress", tasks[0]?.progress ?? 0);
    console.log("sample_decks", (tasks[0]?.decks || []).length);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("ERR", err.message);
  process.exit(1);
});
