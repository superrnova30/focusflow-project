import { Platform, Linking } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import client from "../api/client";
import { flushQueue } from "../api/client";

export const TOKEN_STORAGE_KEY = "focusflow_push_token";
export const PREF_STORAGE_KEY = "focusflow_push_enabled";
const LOCAL_REMINDER_ID = "focusflow-daily-study-reminder";
const LOCAL_VERIFY_ID = "focusflow-verify-reminder";
const ANDROID_CHANNEL_ID = "daily-reminder";

/** Expo Go: local notifications work; remote Expo push does not (SDK 53+). */
export const isExpoGo = Constants.appOwnership === "expo";
export const supportsRemotePush = !isExpoGo && Platform.OS !== "web";
export const supportsLocalNotifications = Platform.OS === "ios" || Platform.OS === "android";
/** Local scheduling is supported in Expo Go and native builds. */
export const supportsNotificationsModule = supportsLocalNotifications;

let notificationsPromise;

async function getNotificationsModule() {
  if (!supportsNotificationsModule) return null;
  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications")
      .then((Notifications) => {
        try {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
        } catch (e) {
          // Handler setup must never crash app boot.
        }
        return Notifications;
      })
      .catch(() => null);
  }
  return notificationsPromise;
}

function parseReminderTime(value) {
  const match = String(value || "18:00").trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return { hour: 18, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function permissionDeniedError() {
  const err = new Error(
    "Notification permission was denied. Open your device settings and allow notifications for PomodAI, then try again."
  );
  err.code = "PERMISSION_DENIED";
  return err;
}

async function ensureAndroidChannel(Notifications) {
  if (Platform.OS !== "android" || !Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Study reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
  } catch (e) {
    // channel setup is best-effort
  }
}

async function requestNotificationPermission(Notifications, { requestPermission }) {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (existingStatus !== "granted" && requestPermission) {
    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    status = requested.status;
  }
  return status;
}

async function cachePreference(enabled) {
  try {
    await AsyncStorage.setItem(PREF_STORAGE_KEY, enabled ? "1" : "0");
  } catch (e) {
    // ignore cache failures
  }
}

export async function getCachedPushPreference() {
  try {
    const value = await AsyncStorage.getItem(PREF_STORAGE_KEY);
    if (value === "1") return true;
    if (value === "0") return false;
  } catch (e) {
    // ignore
  }
  return null;
}

export async function getSavedPushToken() {
  return AsyncStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function openSystemNotificationSettings() {
  try {
    await Linking.openSettings();
  } catch (e) {
    // ignore
  }
}

export async function getNotificationPermissionStatus() {
  if (!supportsNotificationsModule) return "unavailable";
  const Notifications = await getNotificationsModule();
  if (!Notifications) return "unavailable";
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

async function cancelScheduled(Notifications, id) {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    // ignore missing schedules
  }
}

/** Cancel any locally scheduled daily study reminder. */
export async function cancelLocalDailyReminder() {
  if (!supportsNotificationsModule) return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  await cancelScheduled(Notifications, LOCAL_REMINDER_ID);
  await cancelScheduled(Notifications, LOCAL_VERIFY_ID);
}

/**
 * Schedule a one-shot local notification so the user can minimize the app
 * and confirm delivery works (~12 seconds).
 */
export async function scheduleVerificationNotification() {
  if (!supportsNotificationsModule) return null;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  await ensureAndroidChannel(Notifications);
  await cancelScheduled(Notifications, LOCAL_VERIFY_ID);

  const intervalType = Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL;
  const trigger = intervalType
    ? { type: intervalType, seconds: 12, channelId: ANDROID_CHANNEL_ID }
    : { seconds: 12, channelId: ANDROID_CHANNEL_ID };

  try {
    return await Notifications.scheduleNotificationAsync({
      identifier: LOCAL_VERIFY_ID,
      content: {
        title: "PomodAI reminder works",
        body: "You minimized the app and still got this notification.",
        sound: "default",
        data: { type: "verify", source: "local" },
        ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger,
    });
  } catch (e) {
    console.warn("[push] Failed to schedule verification notification:", e?.message || e);
    return null;
  }
}

/**
 * Schedule a repeating local daily reminder so nudges fire when the app
 * is minimized or closed (works in Expo Go via local notifications).
 */
export async function scheduleLocalDailyReminder({
  reminderTime = "18:00",
  streakCount = 0,
} = {}) {
  if (!supportsNotificationsModule) return null;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  await ensureAndroidChannel(Notifications);
  await cancelScheduled(Notifications, LOCAL_REMINDER_ID);

  const { hour, minute } = parseReminderTime(reminderTime);
  const bodyParts = [];
  if (streakCount > 0) bodyParts.push(`You're on a ${streakCount}-day streak.`);
  bodyParts.push("Time for today's study session!");

  const dailyType = Notifications.SchedulableTriggerInputTypes?.DAILY;
  const trigger = dailyType
    ? { type: dailyType, hour, minute, channelId: ANDROID_CHANNEL_ID }
    : { hour, minute, repeats: true, channelId: ANDROID_CHANNEL_ID };

  try {
    return await Notifications.scheduleNotificationAsync({
      identifier: LOCAL_REMINDER_ID,
      content: {
        title: "PomodAI study reminder",
        body: bodyParts.join(" "),
        sound: "default",
        data: { type: "daily_reminder", source: "local" },
        ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger,
    });
  } catch (e) {
    console.warn("[push] Failed to schedule local reminder:", e?.message || e);
    return null;
  }
}

async function savePreferenceOnServer(enabled) {
  const { data } = await client.post("/push/preference", { enabled: Boolean(enabled) });
  await cachePreference(enabled);
  return data;
}

async function registerRemoteToken() {
  if (!supportsRemotePush) return null;

  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;
  await ensureAndroidChannel(Notifications);

  const projectId =
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    const err = new Error(
      "This build is not linked to an EAS project. Run `eas init`, add the projectId to app.json, then rebuild."
    );
    err.code = "MISSING_PROJECT_ID";
    throw err;
  }

  // Remote-only API — never call this from Expo Go.
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData?.data || null;
  if (!token) {
    const err = new Error("Expo did not return a push token for this device.");
    err.code = "TOKEN_UNAVAILABLE";
    throw err;
  }

  const cached = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  await client.post("/push/register", {
    token,
    platform: Platform.OS,
    timezone,
  });

  if (cached && cached !== token) {
    await client.post("/push/unregister", { token: cached }).catch(() => {});
  }

  await cachePreference(true);
  return token;
}

/**
 * Ask for permission, persist preference, schedule local reminders that fire
 * while minimized, and register a remote token only in native builds.
 */
export async function enablePushNotifications({
  requestPermission = true,
  reminderTime = "18:00",
  remindersEnabled = true,
  streakCount = 0,
  scheduleVerify = true,
} = {}) {
  if (!supportsLocalNotifications) {
    const err = new Error("Notifications are not available on this platform.");
    err.code = "UNSUPPORTED";
    throw err;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    const err = new Error("Notifications are unavailable in this build.");
    err.code = "UNAVAILABLE";
    throw err;
  }

  await ensureAndroidChannel(Notifications);

  const status = await requestNotificationPermission(Notifications, { requestPermission });
  if (status !== "granted") {
    if (!requestPermission) return { enabled: false, mode: "denied" };
    throw permissionDeniedError();
  }

  let preferenceData;
  try {
    preferenceData = await savePreferenceOnServer(true);
  } catch (e) {
    const err = new Error(e?.response?.data?.error || e.message || "Could not save notification preference.");
    err.code = "API_ERROR";
    throw err;
  }

  let remoteToken = null;
  let mode = "local";

  // Always schedule local daily reminders so notifications work when minimized,
  // including Expo Go (remote push is unavailable there).
  if (remindersEnabled) {
    await scheduleLocalDailyReminder({ reminderTime, streakCount });
  } else {
    await cancelScheduled(Notifications, LOCAL_REMINDER_ID);
  }

  if (scheduleVerify) {
    await scheduleVerificationNotification();
  }

  if (supportsRemotePush) {
    try {
      remoteToken = await registerRemoteToken();
      mode = "remote+local";
    } catch (e) {
      mode = "local";
      return {
        enabled: true,
        mode,
        token: null,
        warning: e.message,
        user: preferenceData?.user,
        verifyInSeconds: scheduleVerify ? 12 : null,
      };
    }
  } else {
    mode = isExpoGo ? "local-expo-go" : "local";
  }

  return {
    enabled: true,
    mode,
    token: remoteToken,
    user: preferenceData?.user,
    verifyInSeconds: scheduleVerify ? 12 : null,
  };
}

/** Turn push off: cancel local schedules, drop tokens, persist preference. */
export async function disablePushNotifications() {
  await cancelLocalDailyReminder();

  const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  try {
    await client.post("/push/unregister", {
      token: token || undefined,
      clearPreference: true,
    });
  } catch (e) {
    // Still clear local state so the toggle stays honest offline.
  }

  await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  await cachePreference(false);
  return { enabled: false };
}

export async function registerForPushNotifications(options = {}) {
  const result = await enablePushNotifications(options);
  return result?.token || null;
}

export async function refreshPushRegistration(user) {
  if (!supportsNotificationsModule) return null;

  const cachedPref = await getCachedPushPreference();
  const enabled =
    user?.pushNotificationsEnabled === true ||
    (user?.pushNotificationsEnabled == null && (cachedPref === true || !!(await getSavedPushToken())));

  if (!enabled) return null;

  const permission = await getNotificationPermissionStatus();
  if (permission !== "granted") return null;

  try {
    const result = await enablePushNotifications({
      requestPermission: false,
      reminderTime: user?.reminderTime || "18:00",
      remindersEnabled: user?.remindersEnabled !== false,
      streakCount: user?.streakCount || 0,
      scheduleVerify: false,
    });
    return result?.token || null;
  } catch (e) {
    return null;
  }
}

export async function unregisterPushNotifications({ clearPreference = false } = {}) {
  try {
    if (clearPreference) {
      await disablePushNotifications();
      return;
    }
    const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      await client.post("/push/unregister", { token }).catch(() => {});
    }
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    // best effort
  }
}

export async function syncReminderDelivery({
  pushEnabled,
  remindersEnabled,
  reminderTime,
  streakCount = 0,
  hasRemoteToken,
} = {}) {
  if (!supportsNotificationsModule) return;

  if (!pushEnabled || !remindersEnabled) {
    await cancelLocalDailyReminder();
    return;
  }

  // Keep local daily reminders even when a remote token exists, so minimize/background
  // delivery works reliably without waiting on the server scheduler.
  await scheduleLocalDailyReminder({ reminderTime, streakCount });
}

export async function fetchPushStatus() {
  const { data } = await client.get("/push/status");
  if (typeof data?.enabled === "boolean") {
    await cachePreference(data.enabled);
  }
  return data;
}

/** Immediate local test (Expo Go + native) or remote test (native with token). */
export async function sendTestPush() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) throw new Error("Notifications are unavailable.");

  const status = await requestNotificationPermission(Notifications, { requestPermission: true });
  if (status !== "granted") throw permissionDeniedError();

  await ensureAndroidChannel(Notifications);

  // Always fire a local notification so minimize/background can be verified immediately.
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "PomodAI test",
      body: isExpoGo
        ? "Local notifications work when the app is minimized."
        : "You're all set for study reminders!",
      sound: "default",
      data: { type: "test", source: "local" },
      ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: null,
  });

  if (supportsRemotePush) {
    try {
      const { data } = await client.post("/push/send-test", {
        title: "AI Pomodoro Study System test",
        body: "You're all set for push notifications! 🎉",
      });
      return { ...data, local: true };
    } catch (e) {
      // Local already delivered; remote is optional.
      return { ok: true, local: true, remoteError: e?.response?.data?.error || e.message };
    }
  }

  return { ok: true, local: true };
}

export async function retryOfflineWrites() {
  await flushQueue();
}
