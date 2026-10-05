import client from "../api/client";

let cachedCount = null;
const listeners = new Set();

export function getCachedFriends(fallback = 0) {
  return cachedCount == null ? fallback : cachedCount;
}

export function setCachedFriends(count) {
  const next = Math.max(0, Number(count) || 0);
  cachedCount = next;
  listeners.forEach((fn) => fn(next));
}

export function subscribeFriends(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function refreshFriends(userId) {
  if (!userId) return { count: getCachedFriends(0), students: [] };
  const { data } = await client.get(`/students/${userId}/friends`);
  const count = data.count ?? (data.students || []).length;
  setCachedFriends(count);
  return { count, students: data.students || [] };
}
