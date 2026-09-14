import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

const PORT_CANDIDATES = Array.from({ length: 12 }, (_, index) => 4000 + index);

function getLocalNetworkHostCandidates() {
  const hosts = new Set();

  for (const value of [
    Constants.expoConfig?.hostUri,
    Constants.manifest?.debuggerHost,
    Constants.manifest2?.extra?.expoGo?.debuggerHost,
  ]) {
    if (!value) continue;
    const host = String(value).split(":")[0];
    if (host && host !== "0.0.0.0" && host !== "localhost") hosts.add(host);
  }

  [
    "10.0.2.2",
    "127.0.0.1",
    "localhost",
    "192.168.1.1",
    "192.168.0.1",
    "192.168.1.15",
  ].forEach((host) => hosts.add(host));

  return [...hosts];
}

function buildApiBaseUrlCandidates(envUrl) {
  const explicitUrl = envUrl ? envUrl.replace(/\/$/, "") : null;
  const hostCandidates = getLocalNetworkHostCandidates();
  const urls = new Set();

  if (explicitUrl) urls.add(explicitUrl);

  for (const host of hostCandidates) {
    for (const port of PORT_CANDIDATES) {
      urls.add(`http://${host}:${port}/api`);
    }
  }

  if (Platform.OS === "android" && !Constants.isDevice) {
    urls.add("http://10.0.2.2:4000/api");
  }
  if (Platform.OS === "ios" && !Constants.isDevice) {
    urls.add("http://localhost:4000/api");
  }

  return [...urls].filter(Boolean);
}

// Override in mobile/.env when testing on a physical phone:
//   EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:4000/api
// "localhost" only works in simulators/emulators, not on a real device.
function resolveApiBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  const candidates = buildApiBaseUrlCandidates(envUrl);
  return candidates[0] || "http://localhost:4000/api";
}

const API_BASE_URL = resolveApiBaseUrl();
const API_BASE_URL_CANDIDATES = buildApiBaseUrlCandidates(process.env.EXPO_PUBLIC_API_URL);

let activeApiBaseUrl = API_BASE_URL;

async function probeApiHealth(candidate) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(`${candidate}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return Boolean(response && response.ok);
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function detectLiveApiBaseUrl() {
  for (const candidate of API_BASE_URL_CANDIDATES) {
    try {
      const isHealthy = await probeApiHealth(candidate);
      if (isHealthy) {
        activeApiBaseUrl = candidate;
        return candidate;
      }
    } catch (e) {
      // Try the next port.
    }
  }

  activeApiBaseUrl = API_BASE_URL;
  return API_BASE_URL;
}

// Print resolved API URL in development to help debugging network issues.
if (typeof __DEV__ !== "undefined" && __DEV__) {
  // Metro/Expo will show this in the JS console/logs.
  // eslint-disable-next-line no-console
  console.log("API_BASE_URL:", API_BASE_URL);
}

// Keep mobile requests responsive. AI calls are now trimmed to recent context
// and the backend retries fail fast, so a shorter timeout prevents the app
// from hanging while the provider is slow or overloaded.
const DEFAULT_TIMEOUT = 30000;

const client = axios.create({ baseURL: activeApiBaseUrl, timeout: DEFAULT_TIMEOUT });

client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("focusflow_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.url && !config.url.startsWith("http")) {
    config.baseURL = activeApiBaseUrl;
  }
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
  const status = err?.response?.status;

  // Prefer the server's own error message if one was returned.
  if (err?.response?.data?.error) return err.response.data.error;

  // AI / backend errors should not leak raw 502/500 messages to the mobile app.
  if (status === 502 || status === 503 || status === 500) {
    return "The AI service is temporarily unavailable. Please try again in a moment.";
  }

  // Network-level failures (no response, timeout, DNS, etc.) should be
  // surfaced with a clean, non-technical message.
  if (err?.code === "ECONNABORTED" || !err?.response) {
    return FRIENDLY_NETWORK_ERROR;
  }

  return err.message || "Something went wrong";
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err?.config;
    const wasNetworkFailure = !err?.response;

    if (wasNetworkFailure && config && !config.__apiBaseUrlRetried) {
      try {
        const detectedUrl = await detectLiveApiBaseUrl();
        if (detectedUrl && detectedUrl !== activeApiBaseUrl) {
          activeApiBaseUrl = detectedUrl;
          const retryConfig = { ...config, __apiBaseUrlRetried: true, baseURL: detectedUrl };
          return client.request(retryConfig);
        }
      } catch (e) {
        // Ignore detection errors and fall through to the normal error handler.
      }
    }

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
