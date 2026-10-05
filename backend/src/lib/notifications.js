const prisma = require("./prisma");

const STREAK_MILESTONES = [7, 10, 30, 50, 100, 200, 365];

function serializeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body || "",
    data: row.data || {},
    readAt: row.readAt,
    createdAt: row.createdAt,
    unread: !row.readAt,
    actor: row.actor || null,
  };
}

async function createNotification({
  userId,
  actorId = null,
  type,
  title,
  body,
  data,
  dedupeKey,
  refresh = false,
}) {
  if (!userId || !type || !title || !dedupeKey) return null;
  if (actorId && actorId === userId) return null;
  try {
    return await prisma.notification.upsert({
      where: {
        userId_type_dedupeKey: {
          userId,
          type,
          dedupeKey: String(dedupeKey),
        },
      },
      update: refresh
        ? {
            title,
            body: body || null,
            data: data || undefined,
            actorId: actorId || null,
            readAt: null,
            createdAt: new Date(),
          }
        : {},
      create: {
        userId,
        actorId: actorId || null,
        type,
        title,
        body: body || null,
        data: data || undefined,
        dedupeKey: String(dedupeKey),
      },
    });
  } catch (err) {
    console.error("createNotification failed", err.message);
    return null;
  }
}

async function notifyWelcome(userId) {
  return createNotification({
    userId,
    type: "welcome",
    title: "Welcome to FocusFlow",
    body: "Find classmates, share a deck, and start your first study streak.",
    data: { screen: "FindFriends" },
    dedupeKey: "welcome",
  });
}

async function notifyFollow(targetId, actor) {
  if (!targetId || !actor?.id) return null;
  const name = actor.name || "A student";
  return createNotification({
    userId: targetId,
    actorId: actor.id,
    type: "follow",
    title: `${name} started following you`,
    body: null,
    data: { screen: "StudentProfile", userId: actor.id, activity: "started following you" },
    dedupeKey: `follow:${actor.id}`,
    refresh: true,
  });
}

async function notifyReaction(activity, actor) {
  if (!activity?.userId || !actor?.id) return null;
  const name = actor.name || "A student";
  return createNotification({
    userId: activity.userId,
    actorId: actor.id,
    type: "reaction",
    title: `${name} liked your activity`,
    body: activity.title || "Someone reacted to your post.",
    data: { screen: "StudentProfile", userId: activity.userId, activityId: activity.id },
    dedupeKey: `reaction:${activity.id}:${actor.id}`,
    refresh: true,
  });
}

async function notifyFollowersOfShare(userId, kind, item) {
  if (!userId || !item?.id) return;
  try {
    const [actor, followers] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
      prisma.follow.findMany({ where: { followingId: userId }, select: { followerId: true } }),
    ]);
    if (!actor || !followers.length) return;
    const label = kind === "deck" ? "a flashcard deck" : "a study note";
    const title = `${actor.name || "A classmate"} shared ${label}`;
    const body = item.name || item.title || "Open their profile to study it.";
    await Promise.all(
      followers.map((row) =>
        createNotification({
          userId: row.followerId,
          actorId: actor.id,
          type: "friend_share",
          title,
          body,
          data: { screen: "StudentProfile", userId: actor.id, kind, id: item.id },
          dedupeKey: `${kind}:${item.id}`,
        })
      )
    );
  } catch (err) {
    console.error("notifyFollowersOfShare failed", err.message);
  }
}

async function notifyQuizAssigned(studentIds, quiz) {
  const ids = Array.from(new Set((studentIds || []).filter(Boolean)));
  if (!ids.length || !quiz?.id) return;
  const title = quiz.title ? `New quiz: ${quiz.title}` : "A new quiz was assigned to you";
  await Promise.all(
    ids.map((userId) =>
      createNotification({
        userId,
        type: "quiz_assigned",
        title,
        body: "Open it when you are ready to take the quiz.",
        data: { screen: "Quiz", quizId: quiz.id, title: quiz.title || "Quiz" },
        dedupeKey: `quiz:${quiz.id}`,
        refresh: true,
      })
    )
  );
}

async function notifyPremium(userId) {
  return createNotification({
    userId,
    type: "premium",
    title: "Go Unlimited is active",
    body: "You now have unlimited hearts, AI help, and study tools.",
    data: { screen: "Premium" },
    dedupeKey: `premium:${new Date().toISOString().slice(0, 10)}`,
    refresh: true,
  });
}

async function notifyStreakMilestone(userId, streakCount) {
  const days = Number(streakCount) || 0;
  if (!STREAK_MILESTONES.includes(days)) return null;
  return createNotification({
    userId,
    type: "streak",
    title: `${days}-day streak!`,
    body: "Keep going — your consistency is paying off.",
    data: { screen: "Progress", streakCount: days },
    dedupeKey: `streak:${days}`,
  });
}

async function notifySystem(userId, { title, body, dedupeKey, data, refresh = false }) {
  return createNotification({
    userId,
    type: "system",
    title,
    body,
    data: data || {},
    dedupeKey,
    refresh,
  });
}

async function broadcastSystemUpdate({ title, body }) {
  const headline = String(title || "").trim();
  const copy = String(body || "").trim();
  if (!headline) return { sent: 0 };
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", status: "ACTIVE" },
    select: { id: true },
  });
  const key = `broadcast:${Date.now()}`;
  if (!students.length) return { sent: 0 };
  await prisma.notification.createMany({
    data: students.map((student) => ({
      userId: student.id,
      type: "system",
      title: headline,
      body: copy || null,
      data: { screen: null, kind: "broadcast" },
      dedupeKey: key,
    })),
  });
  return { sent: students.length };
}

function notificationActorSelect() {
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

module.exports = {
  serializeNotification,
  createNotification,
  notifyWelcome,
  notifyFollow,
  notifyReaction,
  notifyFollowersOfShare,
  notifyQuizAssigned,
  notifyPremium,
  notifyStreakMilestone,
  notifySystem,
  broadcastSystemUpdate,
  notificationActorSelect,
};
