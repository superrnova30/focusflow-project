import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Override in mobile/.env when testing on a physical phone:
//   EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:4000/api
// "localhost" only works in simulators/emulators, not on a real device.
function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (Platform.OS === "android" && !Constants.isDevice) {
    return "http://10.0.2.2:4000/api";
  }
  if (Platform.OS === "ios" && !Constants.isDevice) {
    return "http://localhost:4000/api";
  }
  // Physical device with no env override — localhost will fail; keep a clear default.
  return "http://localhost:4000/api";
}

const API_BASE_URL = resolveApiBaseUrl();

// Default timeout is generous (60s) because AI features (e.g. the study
// coach) call an external LLM which can take a while to respond.
const DEFAULT_TIMEOUT = 60000;

const client = axios.create({ baseURL: API_BASE_URL, timeout: DEFAULT_TIMEOUT });

client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("focusflow_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---- Offline request queue ----
// When the device is offline or a request fails at the network level, we
// store the failed request (for safe, replayable verb + path combos) and
// retry it once connectivity is restored or the app regains focus.

const QUEUE_KEY = "focusflow_offline_queue";

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function writeQueue(queue) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    // best effort
  }
}

// Only queue idempotent-ish, non-destructive writes so retrying is safe.
const SAFE_TO_QUEUE = (method, url) => {
  const m = (method || "").toUpperCase();
  const base = url.split("?")[0];
  const write = m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
  if (!write) return false;
  // Don't queue auth or AI-generation heavy calls.
  if (base.includes("/auth/") || base.includes("/game/quiz") || base.includes("/ai")) return false;
  return true;
};

let flushPromise = null;

async function flushQueue() {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    const queue = await readQueue();
    if (queue.length === 0) return;
    const remaining = [];
    for (const item of queue) {
      try {
        await client.request({
          method: item.method,
          url: item.url,
          data: item.data,
          timeout: DEFAULT_TIMEOUT,
        });
      } catch (e) {
        // If it still fails due to being offline, keep it; otherwise drop it.
        if ((!e || !e.response) && (e?.code === "ECONNABORTED" || e?.message === FRIENDLY_NETWORK_ERROR)) {
          remaining.push(item);
        }
      }
    }
    await writeQueue(remaining);
  })();
  try {
    await flushPromise;
  } finally {
    flushPromise = null;
  }
}

function enqueueOfflineRequest(config) {
  if (!SAFE_TO_QUEUE(config.method, config.url)) return;
  (async () => {
    const queue = await readQueue();
    queue.push({ method: config.method, url: config.url, data: config.data || {} });
    // Cap the queue to avoid unbounded growth.
    const capped = queue.slice(-50);
    await writeQueue(capped);
  })();
}

const FRIENDLY_NETWORK_ERROR = "Unable to connect to the server. Please try again later.";

function formatApiError(err) {
  // Prefer the server's own error message if one was returned.
  if (err?.response?.data?.error) return err.response.data.error;

  // Network-level failures (no response, timeout, DNS, etc.) should be
  // surfaced with a clean, non-technical message.
  if (err?.code === "ECONNABORTED" || !err?.response) {
    return FRIENDLY_NETWORK_ERROR;
  }

  return err.message || "Something went wrong";
}

client.interceptors.response.use(
  (res) => res,
  (err) => {
    // If this is a genuine offline failure (no response) on a safe-to-queue
    // write, stash it so we can replay it later.
    if (!err?.response && err?.config && SAFE_TO_QUEUE(err.config.method, err.config.url)) {
      enqueueOfflineRequest(err.config);
    }
    return Promise.reject(new Error(formatApiError(err)));
  }
);

/**
 * Explicitly add a write request to the offline queue. Use this when a
 * network write fails and you want to guarantee it is replayed later (e.g.
 * logging a completed Pomodoro session offline). Safe, non-destructive
 * writes are retained; otherwise the request is skipped.
 */
export async function queueRequest(method, url, data) {
  enqueueOfflineRequest({ method, url, data });
  return { queued: SAFE_TO_QUEUE(method, url) };
}

export default client;
export { API_BASE_URL, flushQueue };
