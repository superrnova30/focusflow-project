const prisma = require("./prisma");
const { saveImageUpload, removeUpload } = require("./uploads");

const SCHOOL_TYPES = [
  { value: "ELEMENTARY", label: "Elementary" },
  { value: "JUNIOR_HIGH", label: "Junior High School" },
  { value: "SENIOR_HIGH", label: "Senior High School" },
  { value: "COLLEGE", label: "College" },
  { value: "UNIVERSITY", label: "University" },
  { value: "VOCATIONAL", label: "Vocational / Technical" },
  { value: "OTHER", label: "Other" },
];

const TYPE_VALUES = new Set(SCHOOL_TYPES.map((row) => row.value));
const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const SCHOOL_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const SCHOOL_CHANGE_COOLDOWN_DAYS = 7;

function normalizeText(value, fallback = "") {
  const text = String(value == null ? "" : value).trim().replace(/\s+/g, " ");
  return text || fallback;
}

function schoolNameKey(name, location) {
  return `${normalizeText(name).toLowerCase()}|${normalizeText(location).toLowerCase()}`;
}

function typeLabel(type) {
  return SCHOOL_TYPES.find((row) => row.value === type)?.label || type || "Other";
}

function parseType(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (TYPE_VALUES.has(raw)) return raw;
  if (raw === "JUNIORHIGHSCHOOL" || raw === "JHS") return "JUNIOR_HIGH";
  if (raw === "SENIORHIGHSCHOOL" || raw === "SHS") return "SENIOR_HIGH";
  if (raw === "COLLEGE_UNIVERSITY") return "UNIVERSITY";
  return null;
}

function serializeSchool(school, extras = {}) {
  if (!school) return null;
  return {
    id: school.id,
    name: school.name,
    location: school.location,
    type: school.type,
    typeLabel: typeLabel(school.type),
    logoUrl: school.logoUrl || null,
    status: school.status,
    studentCount: extras.studentCount != null ? extras.studentCount : (school._count?.students || 0),
    createdAt: school.createdAt,
    requestedById: school.requestedById || null,
  };
}

const schoolCardSelect = {
  id: true,
  name: true,
  location: true,
  type: true,
  logoUrl: true,
  status: true,
};

async function findDuplicate({ name, location, excludeId }) {
  const nameKey = schoolNameKey(name, location);
  const exact = await prisma.school.findFirst({
    where: {
      nameKey,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (exact) return exact;

  const similar = await prisma.school.findMany({
    where: {
      name: { equals: normalizeText(name), mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    take: 8,
  });
  const loc = normalizeText(location).toLowerCase();
  return similar.find((row) => {
    const other = normalizeText(row.location).toLowerCase();
    return other === loc || other.includes(loc) || loc.includes(other);
  }) || null;
}

function getSchoolChangeState(user, now = new Date()) {
  const last = user?.schoolChangedAt ? new Date(user.schoolChangedAt) : null;
  if (!last || Number.isNaN(last.getTime())) {
    return {
      locked: false,
      lastChangedAt: null,
      availableAt: null,
      cooldownDays: SCHOOL_CHANGE_COOLDOWN_DAYS,
    };
  }

  const availableAt = new Date(last.getTime() + SCHOOL_CHANGE_COOLDOWN_MS);
  const locked = now.getTime() < availableAt.getTime();
  return {
    locked,
    lastChangedAt: last.toISOString(),
    availableAt: availableAt.toISOString(),
    cooldownDays: SCHOOL_CHANGE_COOLDOWN_DAYS,
  };
}

/**
 * Read/write schoolChangedAt via SQL so cooldown works even if the Prisma
 * client was generated before the column existed (common on Windows when
 * `prisma generate` can't replace a locked query engine DLL).
 */
async function readSchoolChangedAt(userId) {
  if (!userId) return null;
  try {
    const rows = await prisma.$queryRaw`
      SELECT "schoolChangedAt" FROM "User" WHERE id = ${userId}
    `;
    return rows?.[0]?.schoolChangedAt ?? null;
  } catch (err) {
    console.warn("[schools] readSchoolChangedAt failed:", err.message);
    return null;
  }
}

async function writeSchoolChangedAt(userId, when = new Date()) {
  await prisma.$executeRaw`
    UPDATE "User" SET "schoolChangedAt" = ${when} WHERE id = ${userId}
  `;
  return when;
}

/** Clears the school-change cooldown so the student can edit school immediately. */
async function clearSchoolChangedAt(userId) {
  await prisma.$executeRaw`
    UPDATE "User" SET "schoolChangedAt" = NULL WHERE id = ${userId}
  `;
  return null;
}

/**
 * Admin override: remove the 7-day school change restriction for a student.
 * Does not change their current school assignment.
 */
async function clearSchoolChangeCooldown(userId) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    include: { schoolRecord: true },
  });
  if (!current) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  current.schoolChangedAt = await readSchoolChangedAt(userId);
  const before = getSchoolChangeState(current);
  await clearSchoolChangedAt(userId);
  current.schoolChangedAt = null;

  return {
    user: current,
    schoolChange: getSchoolChangeState(current),
    previouslyLocked: before.locked,
  };
}

/** Mutates `user` to include schoolChangedAt from the database when missing. */
async function attachSchoolChangedAt(user) {
  if (!user?.id) return user;
  // Stale Prisma clients omit the field entirely (undefined). Fresh clients
  // return null/Date — leave those alone.
  if (user.schoolChangedAt === undefined) {
    user.schoolChangedAt = await readSchoolChangedAt(user.id);
  }
  return user;
}

function formatSchoolAvailableDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(iso || "");
  }
}

function assertSchoolChangeAllowed(user) {
  const state = getSchoolChangeState(user);
  if (!state.locked) return state;

  const when = formatSchoolAvailableDate(state.availableAt);
  const err = new Error(
    when
      ? `You can't change your school yet. You can change your school again on ${when}.`
      : "You can't change your school yet."
  );
  err.status = 403;
  err.code = "SCHOOL_CHANGE_COOLDOWN";
  err.schoolChange = state;
  throw err;
}

/**
 * Assign or clear a student's school. Enforces the 7-day cooldown using
 * server time. Cooldown starts only after a successful change or removal —
 * not after the first-ever school selection.
 */
async function assignSchoolToUser(userId, schoolId) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    include: { schoolRecord: true },
  });
  if (!current) {
    const err = new Error("Account no longer exists");
    err.status = 401;
    throw err;
  }

  // Cooldown timestamp may be absent from a stale Prisma client selection.
  current.schoolChangedAt = await readSchoolChangedAt(userId);

  const nextId = schoolId || null;
  const prevId = current.schoolId || null;
  if (prevId === nextId) {
    return current;
  }

  // Any mutation while locked is blocked (change, remove, or re-select).
  assertSchoolChangeAllowed(current);

  let school = null;
  if (nextId) {
    school = await prisma.school.findUnique({ where: { id: nextId } });
    if (!school || school.status !== "APPROVED") {
      const err = new Error("Choose an approved school from the list.");
      err.status = 400;
      throw err;
    }
  }

  const isRemove = Boolean(prevId) && !nextId;
  const isChange = Boolean(prevId) && Boolean(nextId) && prevId !== nextId;
  const startsCooldown = isRemove || isChange;
  const now = new Date();

  // Never pass schoolChangedAt through prisma.user.update — a stale client
  // rejects the unknown field and surfaces as "Could not clear your school."
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      schoolId: nextId,
      school: school ? school.name : null,
    },
    include: { schoolRecord: true },
  });

  if (startsCooldown) {
    updated.schoolChangedAt = await writeSchoolChangedAt(userId, now);
  } else {
    updated.schoolChangedAt = current.schoolChangedAt;
  }

  return updated;
}

async function syncSchoolName(school) {
  if (!school?.id || !school.name) return;
  await prisma.user.updateMany({
    where: { schoolId: school.id },
    data: { school: school.name },
  });
}

function saveSchoolLogo({ base64, fileName, mimeType }) {
  return saveImageUpload({
    base64,
    fileName,
    mimeType,
    prefix: "school",
    maxBytes: MAX_LOGO_BYTES,
  });
}

function replaceSchoolLogo(previousUrl, payload) {
  const nextUrl = saveSchoolLogo(payload);
  if (previousUrl && previousUrl !== nextUrl) removeUpload(previousUrl);
  return nextUrl;
}

module.exports = {
  SCHOOL_TYPES,
  STATUSES,
  MAX_LOGO_BYTES,
  SCHOOL_CHANGE_COOLDOWN_MS,
  SCHOOL_CHANGE_COOLDOWN_DAYS,
  normalizeText,
  schoolNameKey,
  typeLabel,
  parseType,
  serializeSchool,
  schoolCardSelect,
  findDuplicate,
  getSchoolChangeState,
  assertSchoolChangeAllowed,
  readSchoolChangedAt,
  writeSchoolChangedAt,
  clearSchoolChangedAt,
  clearSchoolChangeCooldown,
  attachSchoolChangedAt,
  assignSchoolToUser,
  syncSchoolName,
  saveSchoolLogo,
  replaceSchoolLogo,
  removeUpload,
};
