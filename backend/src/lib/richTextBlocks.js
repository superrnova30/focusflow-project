const ALLOWED_MARKS = ["bold", "italic", "underline"];

function sanitizeSpans(block) {
  if (!Array.isArray(block?.spans)) return [];
  return block.spans
    .filter((span) => span && typeof span === "object")
    .map((span) => ({
      text: span.text != null ? String(span.text) : "",
      marks: Array.isArray(span.marks) ? span.marks.filter((mark) => ALLOWED_MARKS.includes(mark)) : [],
    }))
    .filter((span) => span.text);
}

function withTextAndSpans(block) {
  const spans = sanitizeSpans(block);
  const text = (spans.length ? spans.map((span) => span.text).join("") : block.text != null ? String(block.text) : "").trim();
  return { text, spans };
}

/** Normalize rich-text block arrays (notes, task descriptions). */
function sanitizeRichTextBlocks(blocks) {
  if (!Array.isArray(blocks)) return null;
  const filtered = blocks
    .filter((block) => block && typeof block === "object")
    .map((block) => {
      if (block.type === "heading") {
        const { text, spans } = withTextAndSpans(block);
        if (!text) return null;
        const level = [1, 2, 3].includes(block.level) ? block.level : 2;
        return spans.length ? { type: "heading", level, text, spans } : { type: "heading", level, text };
      }
      if (block.type === "bullet" || block.type === "numbered") {
        const { text, spans } = withTextAndSpans(block);
        return text ? (spans.length ? { type: block.type, text, spans } : { type: block.type, text }) : null;
      }
      if (block.type === "checklist") {
        const { text } = withTextAndSpans(block);
        return text ? { type: "checklist", checked: Boolean(block.checked), text } : null;
      }
      const { text, spans } = withTextAndSpans(block);
      if (!text) return null;
      const marks = Array.isArray(block.marks)
        ? block.marks.filter((mark) => ALLOWED_MARKS.includes(mark))
        : [];
      return spans.length ? { type: "text", text, marks, spans } : { type: "text", text, marks };
    })
    .filter(Boolean);
  return filtered.length ? filtered : null;
}

module.exports = { sanitizeRichTextBlocks };
