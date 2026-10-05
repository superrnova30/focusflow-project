export const STREAK_LEVELS = [
  { key: "starting", name: "Getting started", minDays: 0, color: "#94A3B8" },
  { key: "yellow", name: "Spark", minDays: 1, color: "#EAB308" },
  { key: "orange", name: "Momentum", minDays: 10, color: "#F97316" },
  { key: "red", name: "On fire", minDays: 30, color: "#EF4444" },
  { key: "blue", name: "Unstoppable", minDays: 50, color: "#3B82F6" },
  { key: "purple", name: "Elite", minDays: 100, color: "#8B5CF6" },
  { key: "teal", name: "Legendary", minDays: 200, color: "#14B8A6" },
  { key: "gold", name: "Iconic", minDays: 365, color: "#F59E0B" },
  { key: "pink", name: "Mythic", minDays: 730, color: "#EC4899" },
  { key: "cyan", name: "Eternal", minDays: 1000, color: "#06B6D4" },
];

export function getStreakLevel(days) {
  const count = Math.max(0, Number(days) || 0);
  let currentIndex = 0;
  STREAK_LEVELS.forEach((level, index) => {
    if (count >= level.minDays) currentIndex = index;
  });

  const current = STREAK_LEVELS[currentIndex];
  const next = STREAK_LEVELS[currentIndex + 1] || null;
  return {
    ...current,
    softColor: `${current.color}1A`,
    nextMilestone: next?.minDays || null,
    nextName: next?.name || null,
    daysToNext: next ? Math.max(0, next.minDays - count) : 0,
  };
}
