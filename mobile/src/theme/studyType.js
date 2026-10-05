import { Platform } from "react-native";

const FAMILY = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif",
  web: 'Nunito, "Avenir Next", "Segoe UI", system-ui, sans-serif',
  default: undefined,
});

export const studyType = {
  family: FAMILY,
  text(extra = {}) {
    return FAMILY ? { fontFamily: FAMILY, ...extra } : extra;
  },
};

export function loadStudyFonts() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("ff-study-fonts")) return;
  const link = document.createElement("link");
  link.id = "ff-study-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800&display=swap";
  document.head.appendChild(link);
}
