const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { publicUser } = require("../lib/auth");
const {
  SCHOOL_TYPES,
  normalizeText,
  schoolNameKey,
  parseType,
  serializeSchool,
  findDuplicate,
  assignSchoolToUser,
  saveSchoolLogo,
} = require("../lib/schools");

const router = express.Router();
router.use(requireAuth);

router.get("/types", (_req, res) => {
  res.json({ types: SCHOOL_TYPES });
});

router.get("/", async (req, res) => {
  try {
    const query = normalizeText(req.query.q);
    const take = Math.min(40, Math.max(8, Number(req.query.take) || 20));
    const where = { status: "APPROVED" };
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { location: { contains: query, mode: "insensitive" } },
      ];
    }
    const schools = await prisma.school.findMany({
      where,
      include: { _count: { select: { students: true } } },
      orderBy: [{ name: "asc" }],
      take,
    });
    res.json({
      schools: schools.map((school) => serializeSchool(school)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not search schools." });
  }
});

router.post("/request", requireRole("STUDENT"), async (req, res) => {
  try {
    const name = normalizeText(req.body?.name);
    const location = normalizeText(req.body?.location);
    const type = parseType(req.body?.type);
    if (!name || name.length < 2) {
      return res.status(400).json({ error: "Enter the school name." });
    }
    if (!location || location.length < 2) {
      return res.status(400).json({ error: "Enter the school location." });
    }
    if (!type) {
      return res.status(400).json({ error: "Choose a school type." });
    }

    const duplicate = await findDuplicate({ name, location });
    if (duplicate) {
      if (duplicate.status === "APPROVED") {
        return res.status(409).json({
          error: "That school is already in FocusFlow. Search for it instead.",
          schoolId: duplicate.id,
        });
      }
      if (duplicate.status === "PENDING") {
        return res.status(409).json({
          error: "A request for this school is already pending admin review.",
          schoolId: duplicate.id,
        });
      }
      return res.status(409).json({
        error: "This school was previously reviewed. Ask an admin if it should be listed again.",
        schoolId: duplicate.id,
      });
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
        logoUrl,
        status: "PENDING",
        nameKey: schoolNameKey(name, location),
        requestedById: req.user.id,
      },
      include: { _count: { select: { students: true } } },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: "school_requested",
        meta: { schoolId: school.id, name, location, type },
      },
    });

    res.status(201).json({
      school: serializeSchool(school),
      message: "Request sent. We’ll notify you when an admin reviews it.",
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === "P2002") {
      return res.status(409).json({ error: "A school with this name and location already exists." });
    }
    console.error(err);
    res.status(500).json({ error: "Could not submit the school request." });
  }
});

router.post("/:id/select", requireRole("STUDENT"), async (req, res) => {
  try {
    const user = await assignSchoolToUser(req.user.id, req.params.id);
    res.json({ user: publicUser(user), school: serializeSchool(user.schoolRecord) });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code || undefined,
        schoolChange: err.schoolChange || undefined,
      });
    }
    console.error("[schools/select]", err);
    res.status(500).json({
      error: err.message || "Could not save your school.",
    });
  }
});

router.delete("/selection", requireRole("STUDENT"), async (req, res) => {
  try {
    const user = await assignSchoolToUser(req.user.id, null);
    res.json({ user: publicUser(user), school: null });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code || undefined,
        schoolChange: err.schoolChange || undefined,
      });
    }
    console.error("[schools/selection]", err);
    res.status(500).json({
      error: err.message || "Could not clear your school.",
    });
  }
});

module.exports = router;
