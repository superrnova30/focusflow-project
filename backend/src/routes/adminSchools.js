const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { notifySystem } = require("../lib/notifications");
const {
  SCHOOL_TYPES,
  STATUSES,
  normalizeText,
  schoolNameKey,
  parseType,
  serializeSchool,
  findDuplicate,
  syncSchoolName,
  saveSchoolLogo,
  replaceSchoolLogo,
  removeUpload,
} = require("../lib/schools");

const router = express.Router();
router.use(requireAuth, requireRole("ADMIN"));

function parseStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  return STATUSES.has(status) ? status : null;
}

async function notifyRequester(school, status) {
  if (!school?.requestedById) return;
  if (status === "APPROVED") {
    await notifySystem(school.requestedById, {
      title: `${school.name} was approved`,
      body: "Your school is now listed. You can select it in Profile settings.",
      dedupeKey: `school-approved:${school.id}`,
      data: { screen: "Settings", schoolId: school.id, kind: "school" },
      refresh: true,
    });
    return;
  }
  if (status === "REJECTED") {
    await notifySystem(school.requestedById, {
      title: `${school.name} was not added`,
      body: "An admin reviewed your school request and did not approve it.",
      dedupeKey: `school-rejected:${school.id}`,
      data: { screen: "Settings", schoolId: school.id, kind: "school" },
      refresh: true,
    });
  }
}

router.get("/", async (req, res) => {
  try {
    const query = normalizeText(req.query.q || req.query.search);
    const status = parseStatus(req.query.status);
    const location = normalizeText(req.query.location);
    const where = {};
    if (status) where.status = status;
    if (location) where.location = { contains: location, mode: "insensitive" };
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { location: { contains: query, mode: "insensitive" } },
      ];
    }
    const schools = await prisma.school.findMany({
      where,
      include: { _count: { select: { students: true } } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 200,
    });
    res.json({
      types: SCHOOL_TYPES,
      schools: schools.map((school) => serializeSchool(school)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load schools." });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = normalizeText(req.body?.name);
    const location = normalizeText(req.body?.location);
    const type = parseType(req.body?.type);
    const status = parseStatus(req.body?.status) || "APPROVED";
    if (!name || name.length < 2) return res.status(400).json({ error: "Enter the school name." });
    if (!location || location.length < 2) return res.status(400).json({ error: "Enter the school location." });
    if (!type) return res.status(400).json({ error: "Choose a school type." });

    const duplicate = await findDuplicate({ name, location });
    if (duplicate) {
      return res.status(409).json({ error: "A school with this name and location already exists.", schoolId: duplicate.id });
    }

    let logoUrl = null;
    if (req.body?.logoBase64) {
      logoUrl = saveSchoolLogo({
        base64: req.body.logoBase64,
        fileName: req.body.fileName,
        mimeType: req.body.mimeType,
      });
    }

    const school = await prisma.school.create({
      data: {
        name,
        location,
        type,
        status,
        logoUrl,
        nameKey: schoolNameKey(name, location),
      },
      include: { _count: { select: { students: true } } },
    });
    await prisma.activityLog.create({
      data: { userId: req.user.id, action: "school_created", meta: { schoolId: school.id, name, status } },
    });
    res.status(201).json({ school: serializeSchool(school) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === "P2002") return res.status(409).json({ error: "A school with this name and location already exists." });
    console.error(err);
    res.status(500).json({ error: "Could not add the school." });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const current = await prisma.school.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "School not found." });

    const data = {};
    if ("name" in req.body) data.name = normalizeText(req.body.name);
    if ("location" in req.body) data.location = normalizeText(req.body.location);
    if ("type" in req.body) {
      const type = parseType(req.body.type);
      if (!type) return res.status(400).json({ error: "Choose a school type." });
      data.type = type;
    }
    if ("status" in req.body) {
      const status = parseStatus(req.body.status);
      if (!status) return res.status(400).json({ error: "Status must be Pending, Approved, or Rejected." });
      data.status = status;
    }
    if (data.name && data.name.length < 2) return res.status(400).json({ error: "Enter the school name." });
    if (data.location && data.location.length < 2) return res.status(400).json({ error: "Enter the school location." });

    const nextName = data.name || current.name;
    const nextLocation = data.location || current.location;
    data.nameKey = schoolNameKey(nextName, nextLocation);
    const duplicate = await findDuplicate({ name: nextName, location: nextLocation, excludeId: current.id });
    if (duplicate) {
      return res.status(409).json({ error: "A school with this name and location already exists." });
    }

    const school = await prisma.school.update({
      where: { id: current.id },
      data,
      include: { _count: { select: { students: true } } },
    });
    if (data.name) await syncSchoolName(school);
    if (data.status && data.status !== current.status) await notifyRequester(school, data.status);
    res.json({ school: serializeSchool(school) });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "A school with this name and location already exists." });
    console.error(err);
    res.status(500).json({ error: "Could not update the school." });
  }
});

router.post("/:id/status", async (req, res) => {
  try {
    const status = parseStatus(req.body?.status);
    if (!status) return res.status(400).json({ error: "Status must be Pending, Approved, or Rejected." });
    const current = await prisma.school.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "School not found." });
    const school = await prisma.school.update({
      where: { id: current.id },
      data: { status },
      include: { _count: { select: { students: true } } },
    });
    if (status !== current.status) await notifyRequester(school, status);
    res.json({ school: serializeSchool(school) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update school status." });
  }
});

router.post("/:id/logo", async (req, res) => {
  try {
    const current = await prisma.school.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "School not found." });
    if (!req.body?.logoBase64) return res.status(400).json({ error: "Choose a PNG or JPG logo." });
    const logoUrl = replaceSchoolLogo(current.logoUrl, {
      base64: req.body.logoBase64,
      fileName: req.body.fileName,
      mimeType: req.body.mimeType,
    });
    const school = await prisma.school.update({
      where: { id: current.id },
      data: { logoUrl },
      include: { _count: { select: { students: true } } },
    });
    res.json({ school: serializeSchool(school) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not upload the logo." });
  }
});

router.delete("/:id/logo", async (req, res) => {
  try {
    const current = await prisma.school.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "School not found." });
    removeUpload(current.logoUrl);
    const school = await prisma.school.update({
      where: { id: current.id },
      data: { logoUrl: null },
      include: { _count: { select: { students: true } } },
    });
    res.json({ school: serializeSchool(school) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove the logo." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const current = await prisma.school.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { students: true } } },
    });
    if (!current) return res.status(404).json({ error: "School not found." });
    if (current._count.students > 0) {
      return res.status(409).json({
        error: `This school is linked to ${current._count.students} student${current._count.students === 1 ? "" : "s"}. Unlink them before deleting.`,
        studentCount: current._count.students,
      });
    }
    removeUpload(current.logoUrl);
    await prisma.school.delete({ where: { id: current.id } });
    await prisma.activityLog.create({
      data: { userId: req.user.id, action: "school_deleted", meta: { schoolId: current.id, name: current.name } },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete the school." });
  }
});

module.exports = router;
