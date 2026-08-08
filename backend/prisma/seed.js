/* eslint-disable no-console */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash("Admin@123", 10);
  const demoPasswordHash = await bcrypt.hash("Demo@123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@school.edu" },
    update: {},
    create: { name: "You (Admin)", email: "admin@school.edu", passwordHash: adminPasswordHash, role: "ADMIN" },
  });

  const student = await prisma.user.upsert({
    where: { email: "student1@school.edu" },
    update: {},
    create: {
      name: "Mika Santos", email: "student1@school.edu", passwordHash: demoPasswordHash, role: "STUDENT",
      course: "BS Computer Science", yearLevel: "2nd Year", section: "CS-2A", studentId: "2024-10234",
      xp: 0, hearts: 5, correctAnswers: 0, wrongAnswers: 0, totalXpEarned: 0,
    },
  });

  const subject = await prisma.subject.create({
    data: { name: "Data Structures", ownerId: student.id },
  });

  await prisma.task.create({
    data: { title: "Review linked lists", subjectId: subject.id, userId: student.id, estMinutes: 25 },
  });

  await prisma.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  console.log("Seed complete:");
  console.log("  Admin:   admin@school.edu / Admin@123");
  console.log("  Student: student1@school.edu / Demo@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
