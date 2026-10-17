const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function detectImageKind(buffer, mimeType, fileName) {
  const mime = String(mimeType || "").toLowerCase().split(";")[0].trim();
  if (IMAGE_TYPES[mime]) return IMAGE_TYPES[mime];
  const ext = path.extname(String(fileName || "")).toLowerCase().replace(".", "");
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (buffer && buffer.length >= 8) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  }
  return null;
}

function decodeDataUrlOrBase64(raw) {
  const value = String(raw || "").trim();
  if (!value) return { buffer: null, mimeType: null };
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (match) {
    return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1] };
  }
  return { buffer: Buffer.from(value, "base64"), mimeType: null };
}

function saveImageUpload({ base64, fileName, mimeType, prefix = "img", maxBytes = 2 * 1024 * 1024 }) {
  const { buffer, mimeType: embeddedMime } = decodeDataUrlOrBase64(base64);
  if (!buffer || !buffer.length) {
    const err = new Error("Please choose an image file.");
    err.status = 400;
    throw err;
  }
  if (buffer.length > maxBytes) {
    const err = new Error(`Images must be ${Math.round(maxBytes / (1024 * 1024))}MB or smaller.`);
    err.status = 400;
    throw err;
  }
  const kind = detectImageKind(buffer, mimeType || embeddedMime, fileName);
  if (!kind) {
    const err = new Error("School logos must be PNG, JPG, or JPEG.");
    err.status = 400;
    throw err;
  }
  ensureUploadDir();
  const storedName = `${prefix}_${crypto.randomBytes(8).toString("hex")}.${kind}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer);
  return `/uploads/${storedName}`;
}

function removeUpload(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return;
  if (!fileUrl.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(fileUrl));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("Could not delete upload:", err.message);
  }
}

module.exports = {
  UPLOAD_DIR,
  saveImageUpload,
  removeUpload,
};
