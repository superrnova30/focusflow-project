import { Platform, Linking } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import client from "../api/client";
import { flushQueue } from "../api/client";

export const TOKEN_STORAGE_KEY = "focusflow_push_token";
export const PREF_STORAGE_KEY = "focusflow_push_enabled";
const LOCAL_REMINDER_ID = "focusflow-daily-study-reminder";
const ANDROID_CHANNEL_ID = "daily-reminder";

/** Expo Go cannot obtain remote Expo push tokens on SDK 53+. */
export const isExpoGo = Constants.appOwnership === "expo";
export const supportsRemotePush = !isExpoGo && Platform.OS !== "web";
export const supportsLocalNotifications = Platform.OS === "ios" || Platform.OS === "android";

let notificationsPromise;

async function getNotificationsModule() {
  if (!supportsLocalNotifications) return null;
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
          // Handler setup must never crash app boot (Expo Go / incomplete native module).
        }
        return Notifications;
      })
      .catch((e) => {
        console.warn("[push] expo-notifications unavailable:", e?.message || e);
        return null;
      });
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
    "Notification permission was denied. Open your device settings and allow notifications for FocusFlow, then try again."
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
    });
  } catch (e) {
    // channel setup is best-effort
  }
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
  if (!supportsLocalNotifications) return "unavailable";
  const Notifications = await getNotificationsModule();
  if (!Notifications) return "unavailable";
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Cancel any locally scheduled daily study reminder. */
export async function cancelLocalDailyReminder() {
  if (!supportsLocalNotifications) return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(LOCAL_REMINDER_ID);
  } catch (e) {
    // ignore missing schedules
  }
}

/**
 * Schedule a repeating local daily reminder so nudges still fire when the app
 * is closed (including Expo Go, where remote push is unavailable).
 */
export async function scheduleLocalDailyReminder({
  reminderTime = "18:00",
  streakCount = 0,
} = {}) {
  if (!supportsLocalNotifications) return null;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  await ensureAndroidChannel(Notifications);
  await cancelLocalDailyReminder();

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
        title: "FocusFlow study reminder",
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
  return data; // { ok, enabled, user }
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
 * Ask for permission, persist preference, register remote token when possible,
 * and schedule a local daily reminder when remote delivery is not available.
 */
export async function enablePushNotifications({
  requestPermission = true,
  reminderTime = "18:00",
  remindersEnabled = true,
  streakCount = 0,
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

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (existingStatus !== "granted" && requestPermission) {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    if (!requestPermission) return { enabled: false, mode: "denied" };
    throw permissionDeniedError();
  }

  // Persist preference first so the backend respects the toggle even before a token exists.
  let remoteToken = null;
  let mode = "local";
  let preferenceData;
  try {
    preferenceData = await savePreferenceOnServer(true);
  } catch (e) {
    const err = new Error(e?.response?.data?.error || e.message || "Could not save notification preference.");
    err.code = "API_ERROR";
    throw err;
  }

  if (supportsRemotePush) {
    try {
      remoteToken = await registerRemoteToken();
      mode = "remote";
      // Avoid duplicate daily reminders: server scheduler owns delivery when a token exists.
      await cancelLocalDailyReminder();
    } catch (e) {
      // Fall back to local scheduling so the feature still works without a rebuild.
      mode = "local";
      remoteToken = null;
      if (remindersEnabled) {
        await scheduleLocalDailyReminder({ reminderTime, streakCount });
      }
      return {
        enabled: true,
        mode,
        token: null,
        warning: e.message,
        user: preferenceData?.user,
      };
    }
  } else if (remindersEnabled) {
    await scheduleLocalDailyReminder({ reminderTime, streakCount });
  } else {
    await cancelLocalDailyReminder();
  }

  return { enabled: true, mode, token: remoteToken, user: preferenceData?.user };
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

/**
 * Legacy helpers used by AuthContext / App.js.
 * Refresh only re-registers when the user previously opted in.
 */
export async function registerForPushNotifications(options = {}) {
  const result = await enablePushNotifications(options);
  return result?.token || null;
}

export async function refreshPushRegistration(user) {
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
    });
    return result?.token || null;
  } catch (e) {
    return null;
  }
}

/** Remove the token from the backend (e.g. on logout). Keeps the user preference. */
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
    // Keep PREF_STORAGE_KEY so re-login can restore registration.
  } catch (e) {
    // best effort
  }
}

/** Keep local schedules in sync when the user changes Study reminders settings. */
export async function syncReminderDelivery({
  pushEnabled,
  remindersEnabled,
  reminderTime,
  streakCount = 0,
  hasRemoteToken,
} = {}) {
  if (!pushEnabled || !remindersEnabled) {
    await cancelLocalDailyReminder();
    return;
  }
  // Remote builds with a registered token rely on the backend scheduler.
  if (supportsRemotePush && (hasRemoteToken || (await getSavedPushToken()))) {
    await cancelLocalDailyReminder();
    return;
  }
  await scheduleLocalDailyReminder({ reminderTime, streakCount });
}

export async function fetchPushStatus() {
  const { data } = await client.get("/push/status");
  if (typeof data?.enabled === "boolean") {
    await cachePreference(data.enabled);
  }
  return data;
}

/** Send a test push from the backend (development / production builds only). */
export async function sendTestPush() {
  if (!supportsRemotePush) {
    // Deliver an immediate local notification so Expo Go users can still verify.
    const Notifications = await getNotificationsModule();
    if (!Notifications) throw new Error("Notifications are unavailable.");
    await ensureAndroidChannel(Notifications);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "FocusFlow test",
        body: "Local notifications are working on this device.",
        sound: "default",
        data: { type: "test", source: "local" },
        ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    return { ok: true, local: true };
  }

  const { data } = await client.post("/push/send-test", {
    title: "AI Pomodoro Study System test",
    body: "You're all set for push notifications! 🎉",
  });
  return data;
}

/** Replays any queued offline writes. Call on app focus / connectivity restore. */
export async function retryOfflineWrites() {
  await flushQueue();
}
