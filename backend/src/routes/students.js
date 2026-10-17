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

async function loadViewerSchool(userId) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      school: true,
      schoolId: true,
      schoolRecord: { select: { id: true, name: true, location: true, logoUrl: true, type: true, status: true } },
    },
  });
  return me;
}

function schoolPeopleFilter(viewer) {
  if (viewer?.schoolId) return { schoolId: viewer.schoolId };
  const school = normalizeSchool(viewer?.schoolRecord?.name || viewer?.school);
  if (school) return { school: { equals: school, mode: "insensitive" } };
  return null;
}

function withFollowFlags(rows, followingIds) {
  return (rows || []).map((row) => ({
    ...row,
    isFollowing: followingIds.has(row.id),
  }));
}

router.get("/discover", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const take = Math.min(80, Math.max(20, Number(req.query.take) || 50));
    const viewer = await loadViewerSchool(req.user.id);
    const following = await prisma.follow.findMany({
      where: { followerId: req.user.id },
      select: { followingId: true },
    });
    const followingIds = following.map((row) => row.followingId);
    const followingSet = new Set(followingIds);
    const excludeIds = [...new Set([req.user.id, ...followingIds].filter(Boolean))];
    const schoolName = normalizeSchool(viewer?.schoolRecord?.name || viewer?.school);
    const schoolFilter = schoolPeopleFilter(viewer);

    if (query) {
      const students = await prisma.user.findMany({
        where: {
          role: "STUDENT",
          status: "ACTIVE",
          id: { not: req.user.id },
          name: { contains: query, mode: "insensitive" },
        },
        select: studentCardSelect(),
        orderBy: [{ xp: "desc" }, { name: "asc" }],
        take,
      });
      return res.json({
        school: schoolName,
        schoolRecord: viewer?.schoolRecord || null,
        results: withFollowFlags(students, followingSet),
        friendsOfFriends: [],
        schoolPeople: [],
        students: withFollowFlags(students, followingSet),
      });
    }

    const friendIds = followingIds;
    let friendsOfFriends = [];
    if (friendIds.length) {
      const foafRows = await prisma.follow.findMany({
        where: {
          followerId: { in: friendIds },
          followingId: { notIn: excludeIds },
        },
        select: { followingId: true, followerId: true },
        take: 400,
      });
      const scores = new Map();
      foafRows.forEach((row) => {
        if (!row.followingId || row.followingId === req.user.id || followingSet.has(row.followingId)) return;
        scores.set(row.followingId, (scores.get(row.followingId) || 0) + 1);
      });
      const rankedIds = [...scores.entries()]
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .slice(0, take)
        .map(([id]) => id);
      if (rankedIds.length) {
        const people = await prisma.user.findMany({
          where: {
            role: "STUDENT",
            status: "ACTIVE",
            id: { in: rankedIds },
          },
          select: studentCardSelect(),
        });
        const byId = new Map(people.map((row) => [row.id, row]));
        friendsOfFriends = rankedIds.map((id) => byId.get(id)).filter(Boolean);
      }
    }

    let schoolPeople = [];
    if (schoolFilter) {
      schoolPeople = await prisma.user.findMany({
        where: {
          role: "STUDENT",
          status: "ACTIVE",
          ...schoolFilter,
          id: { notIn: excludeIds },
        },
        select: studentCardSelect(),
        orderBy: [{ xp: "desc" }, { name: "asc" }],
        take,
      });
    }

    // Prefer school classmates in their own section; keep FoF free of those duplicates.
    const schoolIdSet = new Set(schoolPeople.map((row) => row.id));
    friendsOfFriends = friendsOfFriends.filter((row) => row?.id && !schoolIdSet.has(row.id));

    res.json({
      school: schoolName,
      schoolRecord: viewer?.schoolRecord || null,
      results: [],
      friendsOfFriends: withFollowFlags(friendsOfFriends, followingSet),
      schoolPeople: withFollowFlags(schoolPeople, followingSet),
      students: withFollowFlags([...friendsOfFriends, ...schoolPeople], followingSet),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not find students" });
  }
});

function schoolmatesWhere(user, query = {}) {
  const requestedId = String(query.schoolId || "").trim();
  if (requestedId) return { schoolId: requestedId };
  const requestedName = normalizeSchool(query.name);
  if (requestedName) return { school: { equals: requestedName, mode: "insensitive" } };
  if (user?.schoolId) return { schoolId: user.schoolId };
  const school = normalizeSchool(user?.school);
  if (school) return { school: { equals: school, mode: "insensitive" } };
  return null;
}

router.get("/school", async (req, res) => {
  try {
    const filter = schoolmatesWhere(req.user, req.query);
    if (!filter) return res.json({ school: "", schoolRecord: null, decks: [], notes: [], leaderboard: [] });

    const schoolInclude = { include: { _count: { select: { students: true } } } };
    const record = filter.schoolId
      ? await prisma.school.findUnique({ where: { id: filter.schoolId }, ...schoolInclude })
      : await prisma.school.findFirst({
          where: { name: { equals: filter.school?.equals || "", mode: "insensitive" } },
          ...schoolInclude,
        });
    const school = record?.name || normalizeSchool(req.query.name || req.user.school);

    const students = await prisma.user.findMany({
      where: { role: "STUDENT", status: "ACTIVE", ...filter },
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

    const { serializeSchool } = require("../lib/schools");
    res.json({
      school,
      schoolRecord: serializeSchool(record),
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
      select: { id: true, school: true, schoolId: true, name: true, schoolRecord: true },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const viewerId = req.user.id;
    const schoolFilter = schoolmatesWhere(student);
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
      schoolFilter
        ? prisma.user.findMany({
            where: {
              role: "STUDENT",
              status: "ACTIVE",
              ...schoolFilter,
              // Never include the profile owner or the signed-in viewer (so you can't follow yourself).
              id: { notIn: [...new Set([student.id, viewerId].filter(Boolean))] },
            },
            select: studentCardSelect(),
            orderBy: [{ xp: "desc" }],
            take: 12,
          })
        : [],
      schoolFilter
        ? prisma.flashcardCollection.findMany({
            where: {
              isPublic: true,
              user: { ...schoolFilter, role: "STUDENT", status: "ACTIVE" },
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

    const { serializeSchool } = require("../lib/schools");
    res.json({
      school,
      schoolRecord: serializeSchool(student.schoolRecord),
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
