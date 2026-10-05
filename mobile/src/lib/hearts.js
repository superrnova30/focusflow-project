import { useEffect, useState } from "react";
import { setCachedCoins } from "./coins";

export const MAX_HEARTS = 5;
export const HEART_COIN_COST = 5;

export function isHeartsBlocked(state) {
  if (!state) return false;
  if (state.unlimitedHearts) return false;
  return Boolean(state.heartsBlocked || (state.hearts ?? MAX_HEARTS) <= 0);
}

export async function fetchHeartsState(api) {
  const { data } = await api.get("/game/state");
  return data.state || {};
}

export async function spendCoinsForHearts(api, quantity = 1) {
  const { data } = await api.post("/game/coins/spend", { item: "heart", quantity });
  if (data?.coins != null) setCachedCoins(data.coins);
  return data;
}

export function useRefillCountdown(iso) {
  const [label, setLabel] = useState(() => formatRefillCountdown(iso));
  useEffect(() => {
    if (!iso) {
      setLabel("");
      return undefined;
    }
    const tick = () => setLabel(formatRefillCountdown(iso));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return label;
}

export function formatRefillCountdown(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Ready now";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function refillReady(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() <= Date.now();
}

export function formatRefillClock(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
