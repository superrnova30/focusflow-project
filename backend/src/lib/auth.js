const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!JWT_SECRET) {
  // Fail loudly at startup rather than silently signing tokens with "undefined"
  throw new Error("JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
}

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Strip sensitive fields before sending a user object back to the client
function publicUser(user) {
  const { passwordHash, emailVerificationCode, ...safe } = user;
  return safe;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, publicUser };
