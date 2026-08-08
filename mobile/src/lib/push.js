import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import client from "../api/client";
import { flushQueue } from "../api/client";

export const TOKEN_STORAGE_KEY = "focusflow_push_token";
const isExpoGo = Constants.appOwnership === "expo";

async function getNotificationsModule() {
  if (isExpoGo) return null;
  try {
    return await import("expo-notifications");
  } catch (e) {
    return null;
  }
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
    });
  } catch (e) {
    // channel setup is best-effort
  }
}

/** Ask for permission + get the Expo push token, then register it on the backend. */
export async function getSavedPushToken() {
  return await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function registerForPushNotifications() {
  if (isExpoGo) return null;

  try {
    const cached = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    if (cached) {
      try {
        await client.post("/push/register", {
          token: cached,
          platform: Platform.OS,
        });
      } catch (e) {
        // ignore — backend registration can be retried later.
      }
      return cached;
    }

    await ensureAndroidChannel();
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let status = existingStatus;
    if (existingStatus !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return null;

    // Expo SDK 54: getExpoPushTokenAsync accepts an options object.
    let tokenData;
    try {
      tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: undefined, // let the plugin/experience resolve it
      });
    } catch (e) {
      // Some setups require a projectId. Fall back to constructing from experience.
      tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
    }

    const token = tokenData?.data || null;
    if (!token) return null;

    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);

    // Register the token with the backend (best-effort).
    try {
      await client.post("/push/register", {
        token,
        platform: Platform.OS,
      });
    } catch (e) {
      // Ignore — registration can be retried later.
    }

    return token;
  } catch (e) {
    return null;
  }
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
    title: "FocusFlow test",
    body: "You're all set for push notifications! 🎉",
  });
  return data;
}

/** Replays any queued offline writes. Call on app focus / connectivity restore. */
export async function retryOfflineWrites() {
  await flushQueue();
}

