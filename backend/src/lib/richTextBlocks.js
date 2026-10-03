/** Normalize rich-text block arrays (notes, task descriptions). */
function sanitizeRichTextBlocks(blocks) {
  if (!Array.isArray(blocks)) return null;
  const filtered = blocks
    .filter((block) => block && typeof block === "object")
    .map((block) => {
      const text = block.text != null ? String(block.text).trim() : "";
      if (!text) return null;
      if (block.type === "heading") {
        const level = [1, 2, 3].includes(block.level) ? block.level : 2;
        return { type: "heading", level, text };
      }
      if (block.type === "bullet") return { type: "bullet", text };
      if (block.type === "numbered") return { type: "numbered", text };
      if (block.type === "checklist") {
        return { type: "checklist", checked: Boolean(block.checked), text };
      }
      const marks = Array.isArray(block.marks)
        ? block.marks.filter((m) => ["bold", "italic", "underline"].includes(m))
        : [];
      return { type: "text", text, marks };
    })
    .filter(Boolean);
  return filtered.length ? filtered : null;
}

module.exports = { sanitizeRichTextBlocks };
