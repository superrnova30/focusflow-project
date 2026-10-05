import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

const PORT_CANDIDATES = Array.from({ length: 12 }, (_, index) => 4000 + index);
const PROBE_TIMEOUT_MS = 1200;
const DETECTION_BUDGET_MS = 3500;

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

  ["10.0.2.2", "127.0.0.1", "localhost"].forEach((host) => hosts.add(host));

  return [...hosts];
}

function buildApiBaseUrlCandidates(envUrl) {
  const explicitUrl = envUrl ? envUrl.replace(/\/$/, "") : null;
  const hostCandidates = getLocalNetworkHostCandidates();
  const urls = new Set();

  if (Platform.OS === "web") urls.add("http://localhost:4000/api");
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

/**
 * Short list for fast detection: env URL + other ports on the same host only.
 * Avoids scanning dozens of dead LAN IPs sequentially (which caused 30s+ hangs).
 */
function buildPrioritizedApiCandidates(envUrl) {
  const explicitUrl = envUrl ? envUrl.replace(/\/$/, "") : null;
  const prioritized = [];

  if (explicitUrl) {
    prioritized.push(explicitUrl);
    try {
      const parsed = new URL(explicitUrl);
      const host = parsed.hostname;
      for (const port of PORT_CANDIDATES) {
        prioritized.push(`http://${host}:${port}/api`);
      }
    } catch {
      // ignore malformed env URL
    }
  }

  if (Platform.OS === "web") prioritized.push("http://localhost:4000/api");
  if (Platform.OS === "android" && !Constants.isDevice) prioritized.push("http://10.0.2.2:4000/api");
  if (Platform.OS === "ios" && !Constants.isDevice) prioritized.push("http://localhost:4000/api");

  for (const host of getLocalNetworkHostCandidates().slice(0, 2)) {
    for (const port of [4000, 4001, 4002]) {
      prioritized.push(`http://${host}:${port}/api`);
    }
  }

  return [...new Set(prioritized)];
}

function resolveApiBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  const candidates = buildPrioritizedApiCandidates(envUrl);
  return candidates[0] || "http://localhost:4000/api";
}

const API_BASE_URL = resolveApiBaseUrl();
const API_BASE_URL_CANDIDATES = buildApiBaseUrlCandidates(process.env.EXPO_PUBLIC_API_URL);

let activeApiBaseUrl = API_BASE_URL;
let apiDetectionPromise = null;

async function probeApiHealth(candidate, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const serverOrigin = candidate.replace(/\/api\/?$/, "");
    const response = await fetch(`${serverOrigin}/health`, {
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

async function detectLiveApiBaseUrlFast() {
  const candidates = buildPrioritizedApiCandidates(process.env.EXPO_PUBLIC_API_URL);
  if (!candidates.length) return activeApiBaseUrl;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (url) => {
      if (settled) return;
      settled = true;
      activeApiBaseUrl = url;
      client.defaults.baseURL = url;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.log("FocusFlow API resolved to:", url);
      }
      resolve(url);
    };

    const fallbackTimer = setTimeout(() => finish(activeApiBaseUrl), DETECTION_BUDGET_MS);

    candidates.forEach((candidate) => {
      probeApiHealth(candidate).then((ok) => {
        if (ok) {
          clearTimeout(fallbackTimer);
          finish(candidate);
        }
      });
    });
  });
}

/** Call before payment/checkout so we hit the correct backend port immediately. */
export async function ensureApiBaseUrlReady() {
  if (!apiDetectionPromise) {
    apiDetectionPromise = detectLiveApiBaseUrlFast();
  }
  return apiDetectionPromise;
}

function kickOffApiDetection() {
  if (!apiDetectionPromise) {
    apiDetectionPromise = detectLiveApiBaseUrlFast();
  }
}

if (typeof __DEV__ !== "undefined" && __DEV__) {
  // eslint-disable-next-line no-console
  console.log("API_BASE_URL (initial):", API_BASE_URL);
  kickOffApiDetection();
}

const DEFAULT_TIMEOUT = 30000;
export const CHECKOUT_TIMEOUT_MS = 18000;

const client = axios.create({ baseURL: activeApiBaseUrl, timeout: DEFAULT_TIMEOUT });

let firstRequestWarmed = false;

client.interceptors.request.use(async (config) => {
  if (!firstRequestWarmed) {
    firstRequestWarmed = true;
    await ensureApiBaseUrlReady().catch(() => {});
  }

  const token = await AsyncStorage.getItem("focusflow_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.url && !config.url.startsWith("http")) {
    config.baseURL = activeApiBaseUrl;
  }
  return config;
});

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

const SAFE_TO_QUEUE = (method, url) => {
  const m = (method || "").toUpperCase();
  const base = url.split("?")[0];
  const write = m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
  if (!write) return false;
  if (base.includes("/auth/") || base.includes("/game/quiz") || base.includes("/ai")) return false;
  if (base.includes("/premium/")) return false;
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
    const capped = queue.slice(-50);
    await writeQueue(capped);
  })();
}

const FRIENDLY_NETWORK_ERROR = "Unable to connect to the server. Please try again later.";
const CHECKOUT_NETWORK_ERROR =
  "Could not reach the FocusFlow server to start checkout. Check that the app API URL matches your backend port (often 4000 or 4001).";

function formatApiError(err, config) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const isCheckout = String(config?.url || "").includes("/premium/checkout");

  if (data?.error) return data.error;

  if (status === 502 || status === 503) {
    if (isCheckout && data?.code === "XENDIT_PUBLIC_KEY") {
      return data.error || "Use your Xendit Secret API key on the server, not the Public key.";
    }
    return isCheckout
      ? "Could not start Xendit checkout. Please try again in a moment."
      : "The service is temporarily unavailable. Please try again in a moment.";
  }
  if (status === 500) {
    return isCheckout
      ? "Could not start checkout. Please try again."
      : "Something went wrong on the server. Please try again.";
  }

  if (err?.code === "ECONNABORTED" || !err?.response) {
    return isCheckout ? CHECKOUT_NETWORK_ERROR : FRIENDLY_NETWORK_ERROR;
  }

  return err.message || "Something went wrong";
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err?.config;
    const wasNetworkFailure = !err?.response;
    const isAiRequest = String(config?.url || "").includes("/ai/");
    const isCheckout = String(config?.url || "").includes("/premium/checkout");

    if (wasNetworkFailure && config && !config.__apiBaseUrlRetried && !isAiRequest) {
      try {
        apiDetectionPromise = null;
        const detectedUrl = await detectLiveApiBaseUrlFast();
        if (detectedUrl && detectedUrl !== config.baseURL) {
          activeApiBaseUrl = detectedUrl;
          const retryConfig = {
            ...config,
            __apiBaseUrlRetried: true,
            baseURL: detectedUrl,
            timeout: config.timeout || DEFAULT_TIMEOUT,
          };
          return client.request(retryConfig);
        }
      } catch (e) {
        // fall through
      }
    }

    if (!err?.response && err?.config && SAFE_TO_QUEUE(err.config.method, err.config.url)) {
      enqueueOfflineRequest(err.config);
    }

    const message = formatApiError(err, config);
    const enriched = new Error(message);
    const data = err?.response?.data;
    enriched.status = err?.response?.status;
    enriched.code = data?.code;
    enriched.upgradeRequired = Boolean(data?.upgradeRequired);
    enriched.limits = data?.limits;
    enriched.response = err?.response;
    enriched.isCheckout = isCheckout;
    return Promise.reject(enriched);
  }
);

export async function queueRequest(method, url, data) {
  enqueueOfflineRequest({ method, url, data });
  return { queued: SAFE_TO_QUEUE(method, url) };
}

export default client;
export { API_BASE_URL, flushQueue, activeApiBaseUrl };
