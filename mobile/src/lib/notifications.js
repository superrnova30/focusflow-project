import { navigationRef } from "./navigationRef";

export function notificationIcon(type) {
  switch (type) {
    case "follow":
      return { name: "person-add", color: "#6C5CE7" };
    case "reaction":
      return { name: "heart", color: "#E11D48" };
    case "friend_share":
      return { name: "book", color: "#2563EB" };
    case "quiz_assigned":
      return { name: "school", color: "#0EA05C" };
    case "premium":
      return { name: "diamond", color: "#7C3AED" };
    case "streak":
      return { name: "flame", color: "#DE911D" };
    case "challenge":
      return { name: "trophy", color: "#CA8A04" };
    case "welcome":
      return { name: "sparkles", color: "#6C5CE7" };
    case "system":
      return { name: "school", color: "#0EA05C" };
    case "support":
      return { name: "mail", color: "#6C5CE7" };
    case "support_reply":
      return { name: "chatbubbles", color: "#0EA05C" };
    default:
      return { name: "notifications", color: "#6C5CE7" };
  }
}

export function notificationTypeLabel(type) {
  switch (type) {
    case "follow":
      return "New follower";
    case "reaction":
      return "Activity";
    case "friend_share":
      return "Study share";
    case "quiz_assigned":
      return "Quiz";
    case "premium":
      return "Account";
    case "streak":
      return "Streak";
    case "challenge":
      return "Challenge";
    case "welcome":
      return "Welcome";
    case "system":
      return "Update";
    case "support":
      return "Support";
    case "support_reply":
      return "Support reply";
    default:
      return "Update";
  }
}

export function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Whether tapping this notification should open a student profile. */
export function notificationOpensProfile(item) {
  if (!item) return false;
  if (item.type === "follow") {
    return Boolean(item.data?.userId || item.actor?.id);
  }
  if (item.data?.screen === "StudentProfile") {
    return Boolean(item.data?.userId || item.actor?.id);
  }
  return false;
}

export function notificationIsNavigable(item) {
  if (!item) return false;
  if (notificationOpensProfile(item)) return true;
  const screen = item.data?.screen;
  if (screen === "FindFriends" || screen === "Premium" || screen === "Progress" || screen === "Settings") return true;
  if (screen === "ContactSupport") return true;
  // Student conversation (support reply deep link)
  if (
    (item.type === "support_reply" || screen === "SupportTicket") &&
    item.data?.ticketId
  ) {
    return true;
  }
  if (screen === "Quiz" && item.data?.quizId) return true;
  if (item.type === "reaction" && item.actor?.id) return true;
  if (item.type === "friend_share" && (item.data?.userId || item.actor?.id)) return true;
  // Admin inbox: new student support request
  if (
    (item.type === "support" || screen === "SupportDetail" || screen === "SupportInbox") &&
    item.data?.ticketId
  ) {
    return true;
  }
  return false;
}

/**
 * Navigate from a notification without leaving the app shell.
 * Returns true when navigation was handled.
 */
export function navigateFromNotification(item) {
  if (!item || !navigationRef.isReady()) return false;
  const data = item.data || {};
  const screen = data.screen;

  if (notificationOpensProfile(item)) {
    const userId = data.userId || item.actor?.id;
    const name = item.actor?.name || "";
    if (!userId) return false;
    navigationRef.navigate("Study", {
      screen: "StudentProfile",
      params: { userId, name },
    });
    return true;
  }

  if (screen === "FindFriends") {
    navigationRef.navigate("Study", { screen: "FindFriends" });
    return true;
  }
  if (screen === "Quiz" && data.quizId) {
    navigationRef.navigate("Study", {
      screen: "Quiz",
      params: { quizId: data.quizId, title: data.title || "Quiz" },
    });
    return true;
  }
  if (screen === "Premium") {
    navigationRef.navigate("Study", { screen: "Premium" });
    return true;
  }
  if (screen === "Progress") {
    navigationRef.navigate("Study", { screen: "Progress" });
    return true;
  }
  if (screen === "Settings") {
    navigationRef.navigate("Profile", { screen: "Settings" });
    return true;
  }
  // Student: open their own support conversation from a reply notification.
  // Prefer type support_reply so we never send admins to the student screen.
  // Also handles older reply notifications that still pointed at ContactSupport + ticketId.
  // Student support lives under Study (not Profile) so Profile never shows Support UI.
  if (
    (item.type === "support_reply" ||
      (screen === "SupportTicket" && item.type !== "support") ||
      (screen === "ContactSupport" && data.ticketId && item.type === "support_reply")) &&
    data.ticketId
  ) {
    navigationRef.navigate("Study", {
      screen: "SupportTicket",
      params: { ticketId: data.ticketId, ticketCode: data.ticketCode },
    });
    return true;
  }
  if (screen === "ContactSupport") {
    if (data.ticketId) {
      navigationRef.navigate("Study", {
        screen: "SupportTicket",
        params: { ticketId: data.ticketId, ticketCode: data.ticketCode },
      });
      return true;
    }
    navigationRef.navigate("Study", { screen: "ContactSupport" });
    return true;
  }
  // Admin: new Contact PomodAI request → inbox detail.
  if (
    (item.type === "support" || screen === "SupportDetail" || screen === "SupportInbox") &&
    data.ticketId
  ) {
    try {
      navigationRef.navigate("Overview", {
        screen: "SupportDetail",
        params: { ticketId: data.ticketId },
      });
      return true;
    } catch {
      try {
        navigationRef.navigate("Overview", { screen: "SupportInbox" });
        return true;
      } catch {
        navigationRef.navigate("Overview");
        return true;
      }
    }
  }
  if (item.type === "reaction" && item.actor?.id) {
    navigationRef.navigate("Study", {
      screen: "StudentProfile",
      params: { userId: item.actor.id, name: item.actor.name || "" },
    });
    return true;
  }
  if (item.type === "friend_share" && (data.userId || item.actor?.id)) {
    const userId = data.userId || item.actor.id;
    navigationRef.navigate("Study", {
      screen: "StudentProfile",
      params: { userId, name: item.actor?.name || "" },
    });
    return true;
  }

  return false;
}

/**
 * Deep-link an admin activity log row to the most relevant admin screen.
 * Returns true when navigation was attempted.
 */
export function navigateFromActivityLog(log) {
  if (!log || !navigationRef.isReady()) return false;
  const action = String(log.action || "").toLowerCase();
  const userId = log.userId || log.user?.id;

  const go = (name, params) => {
    try {
      navigationRef.navigate(name, params);
      return true;
    } catch {
      return false;
    }
  };

  if (action.includes("premium") || action.includes("checkout") || action.includes("payment") || action.includes("coin")) {
    return go("Subscriptions") || go("Overview");
  }
  if (action.includes("school")) {
    return go("Schools") || go("Overview");
  }
  if (
    action.includes("quiz") ||
    action.includes("flash") ||
    action.includes("note") ||
    action.includes("upload") ||
    action.includes("material") ||
    action.includes("import") ||
    action.includes("content")
  ) {
    return go("Content") || go("Overview");
  }
  if (
    action.includes("login") ||
    action.includes("account") ||
    action.includes("password") ||
    action.includes("verified") ||
    action.includes("role") ||
    action.startsWith("admin_") ||
    userId
  ) {
    if (userId) {
      return (
        go("Users", { screen: "UserDetail", params: { userId, user: log.user || undefined } }) ||
        go("Users") ||
        go("Overview")
      );
    }
    return go("Users") || go("Overview");
  }

  return go("Overview", { screen: "OverviewHome" }) || go("Overview");
}

/** Compact relative time (lists, badges). */
export function timeAgo(value) {
  const long = timeAgoLong(value);
  if (!long) return "";
  if (long === "just now") return "now";
  if (long.endsWith(" minutes ago")) return `${long.replace(" minutes ago", "")}m`;
  if (long.endsWith(" minute ago")) return "1m";
  if (long.endsWith(" hours ago")) return `${long.replace(" hours ago", "")}h`;
  if (long.endsWith(" hour ago")) return "1h";
  if (long === "yesterday") return "1d";
  if (long.endsWith(" days ago")) return `${long.replace(" days ago", "")}d`;
  return long;
}

/** Full relative time for notification copy (e.g. “5 minutes ago”, “yesterday”). */
export function timeAgoLong(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const ms = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function notificationActivityPhrase(type, item) {
  switch (type) {
    case "follow":
      return "started following you";
    case "reaction":
      return "liked your activity";
    case "friend_share":
      return item?.body?.includes("note") ? "shared a study note" : "shared a flashcard deck";
    case "quiz_assigned":
      return "assigned you a quiz";
    default:
      return "";
  }
}

/**
 * Rich notification copy for the bell panel. Timestamps come from `createdAt` (DB).
 */
export function getNotificationDisplay(item) {
  if (!item) {
    return { mode: "title", title: "", when: "", accessibilityLabel: "" };
  }
  const when = timeAgoLong(item.createdAt);
  const actorName = item.actor?.name?.trim();
  const activity = String(item.data?.activity || "").trim() || notificationActivityPhrase(item.type, item);

  if (actorName && activity) {
    const accessibilityLabel = `${actorName} ${activity}${when ? ` — ${when}` : ""}`;
    return {
      mode: "actor",
      name: actorName,
      activity,
      when,
      accessibilityLabel,
    };
  }

  const title = String(item.title || "").trim();
  const accessibilityLabel = when ? `${title} — ${when}` : title;
  return {
    mode: "title",
    title,
    when,
    body: item.body?.trim() || "",
    accessibilityLabel,
  };
}
