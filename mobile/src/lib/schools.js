export const SCHOOL_TYPES = [
  { value: "ELEMENTARY", label: "Elementary" },
  { value: "JUNIOR_HIGH", label: "Junior High School" },
  { value: "SENIOR_HIGH", label: "Senior High School" },
  { value: "COLLEGE", label: "College" },
  { value: "UNIVERSITY", label: "University" },
  { value: "VOCATIONAL", label: "Vocational / Technical" },
  { value: "OTHER", label: "Other" },
];

export const MAX_SCHOOL_LOGO_BYTES = 2 * 1024 * 1024;

export function schoolTypeLabel(type) {
  return SCHOOL_TYPES.find((row) => row.value === type)?.label || type || "School";
}

export function schoolDisplayName(user) {
  return user?.schoolRecord?.name || user?.school || "";
}

export function formatSchoolAvailableDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Human-readable remaining cooldown (e.g. "3d 4h", "2h 15m", "Under a minute"). */
export function formatSchoolCooldownRemaining(availableAt, now = Date.now()) {
  if (!availableAt) return "";
  const end = new Date(availableAt).getTime();
  if (Number.isNaN(end)) return "";
  const ms = Math.max(0, end - now);
  if (ms <= 0) return "Available now";
  const totalMinutes = Math.ceil(ms / 60000);
  if (totalMinutes < 1) return "Under a minute";
  if (totalMinutes < 60) return `${totalMinutes}m remaining`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return minutes ? `${totalHours}h ${minutes}m remaining` : `${totalHours}h remaining`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days}d ${hours}h remaining` : `${days}d remaining`;
}

export function isSchoolChangeLocked(user) {
  return Boolean(user?.schoolChange?.locked);
}

export function isLikelyImageFile(name, mime) {
  const type = String(mime || "").toLowerCase();
  if (type === "image/png" || type === "image/jpeg" || type === "image/jpg") return true;
  return /\.(png|jpe?g)$/i.test(String(name || ""));
}
