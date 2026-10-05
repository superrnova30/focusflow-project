import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import client from "../api/client";
import { flushQueue } from "../api/client";

export const TOKEN_STORAGE_KEY = "focusflow_push_token";
const isExpoGo = Constants.appOwnership === "expo";
let notificationsPromise;

async function getNotificationsModule() {
  if (isExpoGo) return null;
  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications").then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return Notifications;
    });
  }
  return notificationsPromise;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android" || isExpoGo) return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.setNotificationChannelAsync("daily-reminder", {
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

export async function getSavedPushToken() {
  return await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
}

/** Ask for permission, obtain the current token, and register it server-side. */
export async function registerForPushNotifications({ requestPermission = true } = {}) {
  if (isExpoGo) {
    throw new Error("Push notifications require a custom development or production build.");
  }

  await ensureAndroidChannel();
  const Notifications = await getNotificationsModule();
  if (!Notifications) throw new Error("Notifications are unavailable in this build.");

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (existingStatus !== "granted" && requestPermission) {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    if (!requestPermission) return null;
    throw new Error("Notification permission was not granted. Enable it in your device settings.");
  }

  const projectId =
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error("This build is not linked to an EAS project. Run `eas init`, then rebuild the app.");
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData?.data || null;
  if (!token) throw new Error("Expo did not return a push token for this device.");

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

  return token;
}

/** Refresh an opted-in device without prompting users who disabled push. */
export async function refreshPushRegistration() {
  const cached = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  if (!cached) return null;
  return registerForPushNotifications({ requestPermission: false });
}

/** Remove the token from the backend (e.g. on logout). */
export async function unregisterPushNotifications() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      await client.post("/push/unregister", { token }).catch(() => {});
    }
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    // best effort
  }
}

/** Send a test push from the backend to confirm the device is wired up. */
export async function sendTestPush() {
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

