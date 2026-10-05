const prisma = require("./prisma");

function normalizeSchool(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function studentCardSelect() {
  return {
    id: true,
    name: true,
    profilePicture: true,
    school: true,
    course: true,
    yearLevel: true,
    section: true,
    xp: true,
    streakCount: true,
    currentLevel: true,
  };
}

async function recordProfileActivity({ userId, type, title, body, dedupeKey, meta }) {
  if (!userId || !type || !title || !dedupeKey) return null;
  try {
    return await prisma.profileActivity.upsert({
      where: { userId_type_dedupeKey: { userId, type, dedupeKey: String(dedupeKey) } },
      update: {},
      create: {
        userId,
        type,
        title,
        body: body || null,
        dedupeKey: String(dedupeKey),
        meta: meta || undefined,
      },
    });
  } catch (err) {
    console.error("recordProfileActivity failed", err.message);
    return null;
  }
}

async function recordStreakActivity(userId, streakCount, dayKey) {
  const days = Number(streakCount) || 0;
  if (!userId || days < 1) return null;
  const label = days === 1 ? "1-day streak" : `${days}-day streak`;
  return recordProfileActivity({
    userId,
    type: "streak",
    title: `Reached a ${label}`,
    body: days === 1 ? "Started a new study streak." : "Kept the study streak going.",
    dedupeKey: `streak:${dayKey || days}`,
    meta: { streakCount: days },
  });
}

async function recordPublicContentActivity(userId, kind, item) {
  const isDeck = kind === "deck";
  const activity = await recordProfileActivity({
    userId,
    type: isDeck ? "public_deck" : "public_note",
    title: isDeck ? `Shared a deck: ${item.name}` : `Shared a note: ${item.title}`,
    body: "This study material is now public.",
    dedupeKey: `${kind}:${item.id}`,
    meta: { kind, id: item.id },
  });
  const { notifyFollowersOfShare } = require("./notifications");
  notifyFollowersOfShare(userId, kind, item).catch(() => {});
  return activity;
}

async function followCounts(userId) {
  const [followers, following] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);
  return { followers, following };
}

async function isFollowing(viewerId, userId) {
  if (!viewerId || !userId || viewerId === userId) return false;
  const row = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
    select: { id: true },
  });
  return Boolean(row);
}

async function mutualFollowIds(userId) {
  const [iFollow, theyFollow] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    prisma.follow.findMany({ where: { followingId: userId }, select: { followerId: true } }),
  ]);
  const followingSet = new Set(iFollow.map((row) => row.followingId));
  return theyFollow.map((row) => row.followerId).filter((id) => followingSet.has(id));
}

async function serializeActivities(activities, viewerId) {
  return activities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    title: activity.title,
    body: activity.body,
    meta: activity.meta,
    createdAt: activity.createdAt,
    heartCount: activity._count?.reactions || 0,
    reactedByMe: viewerId
      ? (activity.reactions || []).some((reaction) => reaction.userId === viewerId)
      : false,
    user: activity.user || null,
  }));
}

module.exports = {
  normalizeSchool,
  studentCardSelect,
  recordProfileActivity,
  recordStreakActivity,
  recordPublicContentActivity,
  followCounts,
  isFollowing,
  mutualFollowIds,
  serializeActivities,
};
