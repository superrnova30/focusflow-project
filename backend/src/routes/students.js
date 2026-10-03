const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Public student profile — shows only content the student marked as public.
router.get("/:userId/profile", async (req, res) => {
  try {
    const student = await prisma.user.findFirst({
      where: { id: req.params.userId, role: "STUDENT", status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        course: true,
        yearLevel: true,
        section: true,
        profilePicture: true,
        xp: true,
        streakCount: true,
        currentLevel: true,
        createdAt: true,
      },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const [publicNotes, publicCollections] = await Promise.all([
      prisma.studyNote.findMany({
        where: { userId: student.id, isPublic: true },
        select: {
          id: true,
          title: true,
          source: true,
          updatedAt: true,
          createdAt: true,
          aiSummary: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.flashcardCollection.findMany({
        where: { userId: student.id, isPublic: true },
        include: { _count: { select: { flashcards: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      profile: student,
      publicNotes,
      publicCollections,
      isOwnProfile: student.id === req.user.id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load student profile" });
  }
});

module.exports = router;
