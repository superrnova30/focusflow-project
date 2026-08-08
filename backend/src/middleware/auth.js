const { verifyToken } = require("../lib/auth");
const prisma = require("../lib/prisma");

/**
 * Verifies the Bearer token on every protected route and attaches the
 * full, fresh user record to req.user. Rejects disabled accounts even
 * if their token hasn't expired yet.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing or invalid Authorization header" });

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "Account no longer exists" });
    if (user.status === "DISABLED") return res.status(403).json({ error: "This account has been disabled" });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Use after requireAuth: `router.get('/x', requireAuth, requireRole('ADMIN'), handler)` */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have permission to do that" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
