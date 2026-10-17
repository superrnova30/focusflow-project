const COIN_REWARDS = {
  hint: {
    id: "hint",
    name: "Hint",
    description: "Reveal a clue in Memorize when you get stuck.",
    price: 10,
    icon: "bulb-outline",
    color: "amber",
  },
  super_heart: {
    id: "super_heart",
    name: "Super Hearts",
    description: "Refill your hearts to full so you can keep studying.",
    price: 20,
    icon: "heart",
    color: "tomato",
  },
  streak_freeze: {
    id: "streak_freeze",
    name: "Streak Freeze",
    description: "Protects your streak if you miss a study day.",
    price: 15,
    icon: "snow-outline",
    color: "violet",
  },
  heart: {
    id: "heart",
    name: "Revive Heart",
    description: "Restore 1 heart.",
    price: 5,
    icon: "heart-outline",
    color: "tomato",
  },
};

const DEFAULT_PACKS = [
  { id: "coins_50", name: "Starter", coins: 50, amount: 29, tag: "Popular for a boost" },
  { id: "coins_150", name: "Study Pack", coins: 150, amount: 79, tag: "Best for daily study" },
  { id: "coins_400", name: "Power Pack", coins: 400, amount: 189, tag: "Best value" },
];

const MAX_STREAK_FREEZES = 5;

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function coinPacks() {
  return DEFAULT_PACKS.map((pack) => ({
    ...pack,
    amount: envInt(`COIN_PACK_${pack.coins}_PHP`, pack.amount),
    currency: "PHP",
  }));
}

function findCoinPack(packId) {
  return coinPacks().find((pack) => pack.id === String(packId || "")) || null;
}

function shopCatalog() {
  return {
    rewards: [COIN_REWARDS.hint, COIN_REWARDS.super_heart, COIN_REWARDS.streak_freeze],
    packs: coinPacks(),
    maxStreakFreezes: MAX_STREAK_FREEZES,
  };
}

module.exports = {
  COIN_REWARDS,
  MAX_STREAK_FREEZES,
  coinPacks,
  findCoinPack,
  shopCatalog,
};
