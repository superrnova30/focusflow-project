const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const {
  normalizeSchool,
  studentCardSelect,
  followCounts,
  isFollowing,
  mutualFollowIds,
  serializeActivities,
} = require("../lib/social");
const { notifyFollow, notifyReaction } = require("../lib/notifications");
const { buildStudentStats } = require("../lib/student_stats");

const router = express.Router();
router.use(requireAuth);

function publicDeckSelect() {
  return {
    id: true,
    name: true,
    color: true,
    isPublic: true,
    createdAt: true,
    userId: true,
    user: { select: studentCardSelect() },
    _count: { select: { flashcards: true, studyProgress: true } },
  };
}

function popularityScore(deck) {
  return (deck._count?.studyProgress || 0) * 5 + (deck._count?.flashcards || 0);
}

function sortPopularDecks(decks) {
  return [...(decks || [])].sort((a, b) => {
    const diff = popularityScore(b) - popularityScore(a);
    if (diff !== 0) return diff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function publicNoteSelect() {
  return {
    id: true,
    title: true,
    source: true,
    updatedAt: true,
    createdAt: true,
    aiSummary: true,
    isPublic: true,
    userId: true,
    user: { select: studentCardSelect() },
  };
}

router.get("/discover", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const school = normalizeSchool(req.query.school);
    const take = Math.min(40, Math.max(8, Number(req.query.take) || 20));
    const following = await prisma.follow.findMany({
      where: { followerId: req.user.id },
      select: { followingId: true },
    });
    const excludeIds = [req.user.id, ...following.map((row) => row.followingId)];
    const where = {
      role: "STUDENT",
      status: "ACTIVE",
      id: { notIn: excludeIds },
    };
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { school: { contains: query, mode: "insensitive" } },
        { course: { contains: query, mode: "insensitive" } },
      ];
    } else if (school) {
      where.school = { equals: school, mode: "insensitive" };
    }

    const students = await prisma.user.findMany({
      where,
      select: studentCardSelect(),
      orderBy: [{ xp: "desc" }, { name: "asc" }],
      take,
    });
    res.json({ students });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not find students" });
  }
});

router.get("/school", async (req, res) => {
  try {
    const school = normalizeSchool(req.query.name || req.user.school);
    if (!school) return res.json({ school: "", decks: [], notes: [], leaderboard: [] });

    const students = await prisma.user.findMany({
      where: { role: "STUDENT", status: "ACTIVE", school: { equals: school, mode: "insensitive" } },
      select: { ...studentCardSelect(), createdAt: true },
      orderBy: [{ xp: "desc" }, { streakCount: "desc" }],
    });
    const ids = students.map((row) => row.id);
    const [decks, notes] = ids.length
      ? await Promise.all([
          prisma.flashcardCollection.findMany({
            where: { isPublic: true, userId: { in: ids } },
            select: publicDeckSelect(),
            orderBy: { createdAt: "desc" },
            take: 40,
          }),
          prisma.studyNote.findMany({
            where: { isPublic: true, userId: { in: ids } },
            select: publicNoteSelect(),
            orderBy: { updatedAt: "desc" },
            take: 40,
          }),
        ])
      : [[], []];

    res.json({
      school,
      decks: sortPopularDecks(decks),
      notes,
      leaderboard: students.map((student, index) => ({ rank: index + 1, ...student })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load school hub" });
  }
});

router.get("/:userId/profile", async (req, res) => {
  try {
    const student = await prisma.user.findFirst({
      where: { id: req.params.userId, role: "STUDENT", status: "ACTIVE" },
      select: {
        ...studentCardSelect(),
        createdAt: true,
        longestStreak: true,
        totalXpEarned: true,
      },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const [counts, follows, publicNotes, publicCollections] = await Promise.all([
      followCounts(student.id),
      isFollowing(req.user.id, student.id),
      prisma.studyNote.findMany({
        where: { userId: student.id, isPublic: true },
        select: publicNoteSelect(),
        orderBy: { updatedAt: "desc" },
      }),
      prisma.flashcardCollection.findMany({
        where: { userId: student.id, isPublic: true },
        select: publicDeckSelect(),
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      profile: { ...student, ...counts, isFollowing: follows },
      publicNotes,
      publicCollections,
      isOwnProfile: student.id === req.user.id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load student profile" });
  }
});

router.get("/:userId/stats", async (req, res) => {
  try {
    const student = await prisma.user.findFirst({
      where: { id: req.params.userId, role: "STUDENT", status: "ACTIVE" },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const stats = await buildStudentStats(student.id);
    if (!stats) return res.status(404).json({ error: "Student not found" });
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load student statistics" });
  }
});

router.get("/:userId/feed", async (req, res) => {
  try {
    const student = await prisma.user.findFirst({
      where: { id: req.params.userId, role: "STUDENT", status: "ACTIVE" },
      select: { id: true, school: true, name: true },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const viewerId = req.user.id;
    const school = normalizeSchool(student.school);
    const followingRows = await prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    });
    const followingIds = new Set(followingRows.map((row) => row.followingId));
    const mutualIds = await mutualFollowIds(student.id);

    const [friends, schoolmates, schoolDecks, activities] = await Promise.all([
      mutualIds.length
        ? prisma.user.findMany({
            where: { id: { in: mutualIds }, role: "STUDENT", status: "ACTIVE" },
            select: studentCardSelect(),
            orderBy: [{ xp: "desc" }, { streakCount: "desc" }],
            take: 10,
          })
        : [],
      school
        ? prisma.user.findMany({
            where: {
              role: "STUDENT",
              status: "ACTIVE",
              school: { equals: school, mode: "insensitive" },
              id: { not: student.id },
            },
            select: studentCardSelect(),
            orderBy: [{ xp: "desc" }],
            take: 12,
          })
        : [],
      school
        ? prisma.flashcardCollection.findMany({
            where: {
              isPublic: true,
              user: { school: { equals: school, mode: "insensitive" }, role: "STUDENT", status: "ACTIVE" },
            },
            select: publicDeckSelect(),
            orderBy: { createdAt: "desc" },
            take: 12,
          })
        : [],
      prisma.profileActivity.findMany({
        where: { userId: student.id },
        include: {
          user: { select: studentCardSelect() },
          reactions: { where: { userId: viewerId }, select: { userId: true } },
          _count: { select: { reactions: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const suggestionPool = schoolmates.filter((row) => !followingIds.has(row.id) && row.id !== viewerId);
    let suggestions = suggestionPool.slice(0, 8);
    if (suggestions.length < 6) {
      const extra = await prisma.user.findMany({
        where: {
          role: "STUDENT",
          status: "ACTIVE",
          id: { notIn: [student.id, viewerId, ...followingIds, ...suggestions.map((row) => row.id)] },
        },
        select: studentCardSelect(),
        orderBy: [{ xp: "desc" }],
        take: 6 - suggestions.length,
      });
      suggestions = [...suggestions, ...extra];
    }

    res.json({
      school,
      friendsLeaderboard: friends.map((row, index) => ({ rank: index + 1, ...row })),
      schoolmates: schoolmates.map((row) => ({ ...row, isFollowing: followingIds.has(row.id) })),
      suggestions: suggestions.map((row) => ({ ...row, isFollowing: followingIds.has(row.id) })),
      schoolDecks: sortPopularDecks(schoolDecks),
      activities: await serializeActivities(activities, viewerId),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load profile feed" });
  }
});

router.get("/:userId/friends", async (req, res) => {
  try {
    const ids = await mutualFollowIds(req.params.userId);
    const students = ids.length
      ? await prisma.user.findMany({
          where: { id: { in: ids }, role: "STUDENT", status: "ACTIVE" },
          select: studentCardSelect(),
          orderBy: [{ name: "asc" }],
        })
      : [];
    res.json({
      count: students.length,
      students: students.map((row) => ({ ...row, isFollowing: true })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load friends" });
  }
});

router.get("/:userId/followers", async (req, res) => {
  try {
    const rows = await prisma.follow.findMany({
      where: { followingId: req.params.userId },
      include: { follower: { select: studentCardSelect() } },
      orderBy: { createdAt: "desc" },
    });
    const followingIds = new Set(
      (await prisma.follow.findMany({
        where: { followerId: req.user.id },
        select: { followingId: true },
      })).map((row) => row.followingId)
    );
    res.json({
      students: rows.map((row) => ({ ...row.follower, isFollowing: followingIds.has(row.follower.id) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load followers" });
  }
});

router.get("/:userId/following", async (req, res) => {
  try {
    const rows = await prisma.follow.findMany({
      where: { followerId: req.params.userId },
      include: { following: { select: studentCardSelect() } },
      orderBy: { createdAt: "desc" },
    });
    const followingIds = new Set(
      (await prisma.follow.findMany({
        where: { followerId: req.user.id },
        select: { followingId: true },
      })).map((row) => row.followingId)
    );
    res.json({
      students: rows.map((row) => ({ ...row.following, isFollowing: followingIds.has(row.following.id) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load following" });
  }
});

router.post("/:userId/follow", async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (targetId === req.user.id) return res.status(400).json({ error: "You cannot follow yourself" });
    const target = await prisma.user.findFirst({
      where: { id: targetId, role: "STUDENT", status: "ACTIVE" },
      select: { id: true },
    });
    if (!target) return res.status(404).json({ error: "Student not found" });

    const alreadyFollowing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: req.user.id, followingId: targetId } },
    });
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: req.user.id, followingId: targetId } },
      update: {},
      create: { followerId: req.user.id, followingId: targetId },
    });
    if (!alreadyFollowing) {
      notifyFollow(targetId, {
        id: req.user.id,
        name: req.user.name,
        profilePicture: req.user.profilePicture,
      }).catch(() => {});
    }
    const counts = await followCounts(targetId);
    res.json({ ok: true, isFollowing: true, ...counts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not follow student" });
  }
});

router.delete("/:userId/follow", async (req, res) => {
  try {
    await prisma.follow.deleteMany({
      where: { followerId: req.user.id, followingId: req.params.userId },
    });
    const counts = await followCounts(req.params.userId);
    res.json({ ok: true, isFollowing: false, ...counts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not unfollow student" });
  }
});

router.post("/activities/:activityId/react", async (req, res) => {
  try {
    const activity = await prisma.profileActivity.findUnique({
      where: { id: req.params.activityId },
      select: { id: true, userId: true, title: true },
    });
    if (!activity) return res.status(404).json({ error: "Activity not found" });

    const existing = await prisma.activityReaction.findUnique({
      where: { activityId_userId: { activityId: activity.id, userId: req.user.id } },
    });
    if (existing) {
      await prisma.activityReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.activityReaction.create({
        data: { activityId: activity.id, userId: req.user.id },
      });
      notifyReaction(activity, req.user).catch(() => {});
    }
    const heartCount = await prisma.activityReaction.count({ where: { activityId: activity.id } });
    res.json({ reactedByMe: !existing, heartCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not react to activity" });
  }
});

module.exports = router;
