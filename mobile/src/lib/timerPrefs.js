import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTO_START_BREAK_KEY = "focusflow_auto_start_break";
const TIMER_ACCENT_KEY = "focusflow_timer_accent_color";
const TIMER_MODE_COLORS_KEY = "focusflow_timer_mode_colors_v1";

/** Predefined timer accent colors (readable on light and dark surfaces). */
export const TIMER_ACCENT_COLORS = [
  { id: "violet", label: "Violet", hex: "#6C5CE7" },
  { id: "coral", label: "Coral", hex: "#EF4444" },
  { id: "mint", label: "Mint", hex: "#0EA05C" },
  { id: "amber", label: "Amber", hex: "#D97706" },
  { id: "sky", label: "Sky", hex: "#0284C7" },
  { id: "rose", label: "Rose", hex: "#E11D48" },
  { id: "indigo", label: "Indigo", hex: "#4F46E5" },
  { id: "teal", label: "Teal", hex: "#0D9488" },
];

export const DEFAULT_TIMER_PREFS = {
  autoStartBreak: false,
  /** @deprecated use modeColors.focus — kept for migration */
  accentColorId: "violet",
  modeColors: {
    focus: "violet",
    short: "mint",
    long: "teal",
  },
};

export function getTimerAccentColor(accentColorId) {
  const match = TIMER_ACCENT_COLORS.find((c) => c.id === accentColorId);
  return match || TIMER_ACCENT_COLORS[0];
}

function normalizeModeColors(raw, fallbackAccentId) {
  const base = { ...DEFAULT_TIMER_PREFS.modeColors };
  if (fallbackAccentId && TIMER_ACCENT_COLORS.some((c) => c.id === fallbackAccentId)) {
    base.focus = fallbackAccentId;
  }
  if (!raw || typeof raw !== "object") return base;
  for (const key of ["focus", "short", "long"]) {
    const id = raw[key];
    if (id && TIMER_ACCENT_COLORS.some((c) => c.id === id)) base[key] = id;
  }
  return base;
}

export async function loadTimerPrefs() {
  try {
    const [autoStartBreak, accentColorId, modeColorsRaw] = await Promise.all([
      AsyncStorage.getItem(AUTO_START_BREAK_KEY),
      AsyncStorage.getItem(TIMER_ACCENT_KEY),
      AsyncStorage.getItem(TIMER_MODE_COLORS_KEY),
    ]);
    let parsedModes = null;
    if (modeColorsRaw) {
      try {
        parsedModes = JSON.parse(modeColorsRaw);
      } catch {
        parsedModes = null;
      }
    }
    const legacyAccent =
      accentColorId && TIMER_ACCENT_COLORS.some((c) => c.id === accentColorId)
        ? accentColorId
        : DEFAULT_TIMER_PREFS.accentColorId;
    const modeColors = normalizeModeColors(parsedModes, legacyAccent);
    return {
      autoStartBreak:
        autoStartBreak === null ? DEFAULT_TIMER_PREFS.autoStartBreak : autoStartBreak === "true",
      accentColorId: modeColors.focus,
      modeColors,
    };
  } catch (e) {
    return {
      ...DEFAULT_TIMER_PREFS,
      modeColors: { ...DEFAULT_TIMER_PREFS.modeColors },
    };
  }
}

export async function saveTimerPrefs(prefs) {
  try {
    const writes = [];
    if (prefs && typeof prefs.autoStartBreak === "boolean") {
      writes.push(AsyncStorage.setItem(AUTO_START_BREAK_KEY, prefs.autoStartBreak ? "true" : "false"));
    }
    const modeColors = normalizeModeColors(
      prefs?.modeColors,
      prefs?.accentColorId || prefs?.modeColors?.focus
    );
    if (prefs?.modeColors || prefs?.accentColorId) {
      writes.push(AsyncStorage.setItem(TIMER_MODE_COLORS_KEY, JSON.stringify(modeColors)));
      writes.push(AsyncStorage.setItem(TIMER_ACCENT_KEY, modeColors.focus));
    }
    if (writes.length) await Promise.all(writes);
  } catch (e) {
    // non-fatal
  }
}
