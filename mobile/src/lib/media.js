import { activeApiBaseUrl } from "../api/client";

export function resolveMediaUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  const value = String(pathOrUrl).trim();
  if (!value) return null;
  if (/^(https?:|data:|file:|blob:)/i.test(value)) return value;
  const origin = String(activeApiBaseUrl || "").replace(/\/api\/?$/, "");
  if (value.startsWith("/")) return `${origin}${value}`;
  return `${origin}/${value}`;
}
