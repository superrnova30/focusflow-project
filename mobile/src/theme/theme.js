// Design language shared by the web prototype and mobile app.
// `THEME` is kept as the dark palette for backwards-compat fallbacks.
// Use `useTheme()` (context/ThemeContext.js) to get `colors` at runtime.

export const darkColors = {
  bg: "#0E1220",
  surface: "#161B2E",
  surfaceRaised: "#1D2338",
  border: "#242B45",
  text: "#F5F3EE",
  textMuted: "#8A8FA3",
  // primary action color (mapped to `tomato` in code) — use violet to match logo
  tomato: "#6C5CE7",
  tomatoSoft: "#211A3A",
  mint: "#4ADE94",
  mintSoft: "#12271A",
  violet: "#9B8CFF",
  violetSoft: "#2A2846",
  amber: "#FFC15E",
  amberSoft: "#3A3020",
};

export const lightColors = {
  bg: "#F4F5F9",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  border: "#E1E4EE",
  text: "#111827",
  textMuted: "#6B7280",
  // primary action color matches logo violet
  tomato: "#6C5CE7",
  tomatoSoft: "#F0ECFF",
  mint: "#0EA05C",
  mintSoft: "#E2F7EE",
  violet: "#6C5CE7",
  violetSoft: "#EEEAFF",
  amber: "#DE911D",
  amberSoft: "#FEF3DD",
};

export const THEME = darkColors;

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

