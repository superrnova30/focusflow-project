const MARKS = ["bold", "italic", "underline"];

export function sanitizeMarks(marks) {
  if (!Array.isArray(marks)) return [];
  return MARKS.filter((mark) => marks.includes(mark));
}

export function marksEqual(left, right) {
  const a = sanitizeMarks(left);
  const b = sanitizeMarks(right);
  return a.length === b.length && a.every((mark) => b.includes(mark));
}

export function blockToSpans(block) {
  if (Array.isArray(block?.spans) && block.spans.length) {
    const spans = block.spans.map((span) => ({
      text: String(span?.text || ""),
      marks: sanitizeMarks(span?.marks),
    }));
    return mergeSpans(spans);
  }
  return mergeSpans([{ text: String(block?.text || ""), marks: sanitizeMarks(block?.marks) }]);
}

export function spansToText(spans) {
  return (spans || []).map((span) => span.text).join("");
}

export function mergeSpans(spans) {
  const next = [];
  (spans || []).forEach((span) => {
    const text = String(span?.text || "");
    const marks = sanitizeMarks(span?.marks);
    if (!text && next.length) return;
    const last = next[next.length - 1];
    if (last && marksEqual(last.marks, marks)) {
      last.text += text;
    } else {
      next.push({ text, marks });
    }
  });
  return next.length ? next : [{ text: "", marks: [] }];
}

function marksAt(spans, index) {
  let offset = 0;
  const list = mergeSpans(spans);
  for (const span of list) {
    const end = offset + span.text.length;
    if (index < end) return span.marks;
    offset = end;
  }
  return list[list.length - 1]?.marks || [];
}

export function rangeHasMark(spans, start, end, mark) {
  const text = spansToText(spans);
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.max(0, Math.min(Math.max(start, end), text.length));
  if (from === to) return marksAt(spans, Math.max(0, from - 1)).includes(mark);
  let offset = 0;
  let covered = false;
  for (const span of mergeSpans(spans)) {
    const spanEnd = offset + span.text.length;
    const overlap = Math.max(from, offset) < Math.min(to, spanEnd);
    if (overlap) {
      covered = true;
      if (!span.marks.includes(mark)) return false;
    }
    offset = spanEnd;
  }
  return covered;
}

export function toggleMarkOnRange(spans, start, end, mark) {
  const text = spansToText(spans);
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.max(0, Math.min(Math.max(start, end), text.length));
  if (from === to) return { spans: mergeSpans(spans), empty: true };

  const chars = [];
  mergeSpans(spans).forEach((span) => {
    Array.from(span.text).forEach((ch) => {
      chars.push({ ch, marks: [...span.marks] });
    });
  });

  const selected = chars.slice(from, to);
  const allHave = selected.length > 0 && selected.every((item) => item.marks.includes(mark));
  for (let i = from; i < to; i += 1) {
    const marks = chars[i].marks;
    const idx = marks.indexOf(mark);
    if (allHave && idx >= 0) marks.splice(idx, 1);
    else if (!allHave && idx < 0) marks.push(mark);
  }

  return {
    spans: mergeSpans(chars.map((item) => ({ text: item.ch, marks: item.marks }))),
    empty: false,
  };
}

export function applyTextChange(prevText, nextText, spans) {
  let start = 0;
  while (start < prevText.length && start < nextText.length && prevText[start] === nextText[start]) {
    start += 1;
  }
  let prevEnd = prevText.length;
  let nextEnd = nextText.length;
  while (prevEnd > start && nextEnd > start && prevText[prevEnd - 1] === nextText[nextEnd - 1]) {
    prevEnd -= 1;
    nextEnd -= 1;
  }

  const inserted = nextText.slice(start, nextEnd);
  const inherit = marksAt(spans, start > 0 ? start - 1 : start);
  return replaceRange(spans, start, prevEnd, inserted, inherit);
}

function replaceRange(spans, start, end, insert, insertMarks) {
  const before = [];
  const after = [];
  let offset = 0;
  mergeSpans(spans).forEach((span) => {
    const spanEnd = offset + span.text.length;
    if (spanEnd <= start) {
      before.push(span);
    } else if (offset >= end) {
      after.push(span);
    } else {
      if (offset < start) {
        before.push({ text: span.text.slice(0, start - offset), marks: span.marks });
      }
      if (spanEnd > end) {
        after.push({ text: span.text.slice(end - offset), marks: span.marks });
      }
    }
    offset = spanEnd;
  });
  const middle = insert ? [{ text: insert, marks: sanitizeMarks(insertMarks) }] : [];
  return mergeSpans([...before, ...middle, ...after]);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function spansToHtml(spans) {
  return mergeSpans(spans)
    .map((span) => {
      let html = escapeHtml(span.text).replace(/\n/g, "<br>");
      if (span.marks.includes("italic")) html = `<i>${html}</i>`;
      if (span.marks.includes("bold")) html = `<b>${html}</b>`;
      if (span.marks.includes("underline")) html = `<u>${html}</u>`;
      return html;
    })
    .join("");
}

function collectMarks(node, inherited = []) {
  const marks = [...inherited];
  const tag = String(node.nodeName || "").toLowerCase();
  if (tag === "b" || tag === "strong") marks.push("bold");
  if (tag === "i" || tag === "em") marks.push("italic");
  if (tag === "u") marks.push("underline");
  const style = node.style || {};
  const weight = String(style.fontWeight || "");
  if (weight === "bold" || Number(weight) >= 600) marks.push("bold");
  if (String(style.fontStyle || "") === "italic") marks.push("italic");
  if (String(style.textDecoration || "").includes("underline")) marks.push("underline");
  return sanitizeMarks(marks);
}

export function sliceSpans(spans, start, end) {
  const text = spansToText(spans);
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.max(0, Math.min(Math.max(start, end), text.length));
  if (from === to) return [{ text: "", marks: [] }];
  const chars = [];
  mergeSpans(spans).forEach((span) => {
    Array.from(span.text).forEach((ch) => chars.push({ ch, marks: [...span.marks] }));
  });
  return mergeSpans(chars.slice(from, to).map((item) => ({ text: item.ch, marks: item.marks })));
}

export function htmlToBlocks(html) {
  if (typeof document === "undefined") {
    const text = String(html || "").replace(/<[^>]+>/g, "");
    return text.trim() ? [{ type: "text", text, marks: [], spans: [{ text, marks: [] }] }] : [];
  }
  const root = document.createElement("div");
  root.innerHTML = html || "";
  const blocks = [];

  const spansFrom = (node, inherited = []) => {
    const spans = [];
    const walk = (current, marks) => {
      if (current.nodeType === 3) {
        spans.push({ text: String(current.textContent || "").replace(/\u00a0/g, " "), marks });
        return;
      }
      if (current.nodeType !== 1) return;
      const tag = String(current.nodeName || "").toLowerCase();
      if (tag === "br") {
        spans.push({ text: "\n", marks });
        return;
      }
      if (tag === "ul" || tag === "ol") return;
      const nextMarks = collectMarks(current, marks);
      Array.from(current.childNodes || []).forEach((child) => walk(child, nextMarks));
    };
    const startMarks = collectMarks(node, inherited);
    Array.from(node.childNodes || []).forEach((child) => walk(child, startMarks));
    return mergeSpans(spans);
  };

  const pushLeaf = (type, node, extra = {}) => {
    const spans = spansFrom(node);
    const text = spansToText(spans).replace(/\n+/g, " ").trim();
    if (!text && type !== "text") return;
    blocks.push({ type, text, marks: [], spans, ...extra });
  };

  const walkTop = (node) => {
    if (node.nodeType === 3) {
      const text = String(node.textContent || "").replace(/\u00a0/g, " ");
      if (text.trim()) blocks.push({ type: "text", text, marks: [], spans: [{ text, marks: [] }] });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = String(node.nodeName || "").toLowerCase();
    if (tag === "ul" || tag === "ol") {
      const type = tag === "ol" ? "numbered" : "bullet";
      Array.from(node.children || []).forEach((item) => {
        if (String(item.nodeName || "").toLowerCase() !== "li") return;
        pushLeaf(type, item);
      });
      return;
    }
    if (tag === "li") {
      pushLeaf("bullet", node);
      return;
    }
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      pushLeaf("heading", node, { level: Number(tag.slice(1)) || 2 });
      return;
    }
    if (tag === "br") return;
    const nestedList = Array.from(node.children || []).some((child) =>
      ["ul", "ol"].includes(String(child.nodeName || "").toLowerCase())
    );
    if (nestedList || tag === "div" || tag === "p" || tag === "section") {
      if (nestedList) {
        Array.from(node.childNodes || []).forEach(walkTop);
        return;
      }
      const spans = spansFrom(node);
      const text = spansToText(spans);
      if (text.trim()) blocks.push({ type: "text", text, marks: [], spans });
      return;
    }
    const spans = spansFrom(node);
    const text = spansToText(spans);
    if (text.trim()) blocks.push({ type: "text", text, marks: [], spans });
  };

  Array.from(root.childNodes || []).forEach(walkTop);
  return blocks;
}

export function blocksToHtml(blocks) {
  const html = [];
  let index = 0;
  const list = Array.isArray(blocks) ? blocks : [];
  while (index < list.length) {
    const block = list[index];
    if (block?.type === "bullet" || block?.type === "numbered") {
      const kind = block.type;
      const tag = kind === "numbered" ? "ol" : "ul";
      const items = [];
      while (index < list.length && list[index]?.type === kind) {
        items.push(`<li>${spansToHtml(blockToSpans(list[index]))}</li>`);
        index += 1;
      }
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    if (block?.type === "heading") {
      const level = [1, 2, 3].includes(block.level) ? block.level : 2;
      html.push(`<h${level}>${spansToHtml(blockToSpans(block))}</h${level}>`);
      index += 1;
      continue;
    }
    html.push(`<div>${spansToHtml(blockToSpans(block))}</div>`);
    index += 1;
  }
  return html.join("");
}

export function blocksToPlainSpans(blocks) {
  const spans = [];
  let number = 0;
  (blocks || []).forEach((block, index) => {
    if (index) spans.push({ text: "\n", marks: [] });
    const body = blockToSpans(block);
    if (block.type === "bullet") {
      number = 0;
      spans.push({ text: "• ", marks: [] }, ...body);
    } else if (block.type === "numbered") {
      number += 1;
      spans.push({ text: `${number}. `, marks: [] }, ...body);
    } else {
      number = 0;
      spans.push(...body);
    }
  });
  return mergeSpans(spans);
}

export function blocksToPlain(blocks) {
  let number = 0;
  return (blocks || []).map((block) => {
    const text = spansToText(blockToSpans(block));
    if (block.type === "bullet") {
      number = 0;
      return `• ${text}`;
    }
    if (block.type === "numbered") {
      number += 1;
      return `${number}. ${text}`;
    }
    number = 0;
    return text;
  }).join("\n");
}

export function plainToBlocks(text, spans = []) {
  const lines = String(text || "").split("\n");
  const blocks = [];
  let offset = 0;
  lines.forEach((line, index) => {
    let type = "text";
    let body = line;
    let prefix = 0;
    const bullet = line.match(/^\s*[•*-]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet) {
      type = "bullet";
      body = bullet[1];
      prefix = line.length - body.length;
    } else if (numbered) {
      type = "numbered";
      body = numbered[1];
      prefix = line.length - body.length;
    }
    const lineSpans = sliceSpans(spans, offset + prefix, offset + line.length);
    blocks.push({ type, text: body, marks: [], spans: lineSpans });
    offset += line.length + (index === lines.length - 1 ? 0 : 1);
  });
  return blocks.filter((block) => block.text.trim() || block.type === "text");
}

function toggleLinePrefix(text, start, end, kind) {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const lines = String(text || "").split("\n");
  let cursor = 0;
  const next = lines.map((line) => {
    const lineStart = cursor;
    const lineEnd = cursor + line.length;
    cursor = lineEnd + 1;
    const overlaps = lineEnd >= from && lineStart <= to;
    if (!overlaps) return line;
    if (kind === "bullet") {
      if (/^\s*[•*-]\s+/.test(line)) return line.replace(/^\s*[•*-]\s+/, "");
      return `• ${line.replace(/^\s*\d+\.\s+/, "")}`;
    }
    if (kind === "numbered") {
      if (/^\s*\d+\.\s+/.test(line)) return line.replace(/^\s*\d+\.\s+/, "");
      return `1. ${line.replace(/^\s*[•*-]\s+/, "")}`;
    }
    return line;
  });
  return next.join("\n");
}

export function toggleListInPlain(text, start, end, kind) {
  return toggleLinePrefix(text, start, end, kind);
}

export function htmlToSpans(html) {
  if (typeof document === "undefined") {
    return [{ text: String(html || "").replace(/<[^>]+>/g, ""), marks: [] }];
  }
  const root = document.createElement("div");
  root.innerHTML = html || "";
  const spans = [];

  const walk = (node, inherited) => {
    if (node.nodeType === 3) {
      spans.push({ text: String(node.textContent || "").replace(/\u00a0/g, " "), marks: inherited });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = String(node.nodeName || "").toLowerCase();
    if (tag === "br") {
      spans.push({ text: "\n", marks: inherited });
      return;
    }
    const marks = collectMarks(node, inherited);
    if ((tag === "div" || tag === "p" || tag === "li") && spans.length && !String(spans[spans.length - 1].text).endsWith("\n")) {
      spans.push({ text: "\n", marks });
    }
    Array.from(node.childNodes || []).forEach((child) => walk(child, marks));
  };

  Array.from(root.childNodes || []).forEach((child) => walk(child, []));
  return mergeSpans(spans);
}
