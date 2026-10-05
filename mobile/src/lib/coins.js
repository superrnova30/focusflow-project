import client from "../api/client";

let cachedCoins = null;
let fetchedAt = 0;
const listeners = new Set();
const TTL_MS = 4000;

export function getCachedCoins(fallback = 0) {
  return cachedCoins == null ? fallback : cachedCoins;
}

export function setCachedCoins(value) {
  const next = Math.max(0, Number(value) || 0);
  cachedCoins = next;
  fetchedAt = Date.now();
  listeners.forEach((listener) => listener(next));
  return next;
}

export function subscribeCoins(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshCoins({ force = false } = {}) {
  if (!force && cachedCoins != null && Date.now() - fetchedAt < TTL_MS) {
    return cachedCoins;
  }
  const { data } = await client.get("/game/state");
  return setCachedCoins(data?.state?.coins ?? 0);
}

export function openCoinShop(navigation) {
  if (!navigation?.navigate) return;
  const routeNames = navigation.getState?.()?.routeNames || [];
  if (routeNames.includes("Progress")) {
    navigation.navigate("Progress");
    return;
  }
  navigation.navigate("Study", { screen: "Progress" });
}
