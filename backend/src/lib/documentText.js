const SUPPORTED_FILE_TYPES = ["pdf", "docx", "pptx", "xlsx"];
const NOTES_SOURCE_LIMIT = 12000;

async function parsePdf(buffer) {
  try {
    const pdf = require("pdf-parse");
    const result = await pdf(buffer);
    return { text: (result && result.text) || "" };
  } catch (err) {
    console.error("PDF parsing failed:", err.message);
    return { text: "" };
  }
}

async function parseDocx(buffer) {
  try {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: (result && result.value) || "" };
  } catch (err) {
    console.error("DOCX parsing failed:", err.message);
    return { text: "" };
  }
}

async function parseOffice(buffer) {
  try {
    const officeParser = require("officeparser");
    const text = await officeParser.parseOfficeAsync(buffer);
    return { text: text || "" };
  } catch (err) {
    console.error("Office parsing failed:", err.message);
    return { text: "" };
  }
}

async function extractTextFromBuffer(fileType, buffer) {
  switch ((fileType || "pdf").toLowerCase()) {
    case "docx":
      return (await parseDocx(buffer)).text;
    case "pptx":
    case "xlsx":
      return (await parseOffice(buffer)).text;
    default:
      return (await parsePdf(buffer)).text;
  }
}

function clipStudySource(text, limit = NOTES_SOURCE_LIMIT) {
  const value = String(text || "").replace(/\u0000/g, "").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}\n\n[Source truncated to keep import fast.]`;
}

function hasCompleteJsonObject(text) {
  const value = String(text || "");
  const firstBrace = value.indexOf("{");
  if (firstBrace === -1) return false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = firstBrace; i < value.length; i += 1) {
    const ch = value[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return true;
    }
  }
  return false;
}

module.exports = {
  SUPPORTED_FILE_TYPES,
  NOTES_SOURCE_LIMIT,
  extractTextFromBuffer,
  clipStudySource,
  hasCompleteJsonObject,
};
