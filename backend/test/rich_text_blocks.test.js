const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeRichTextBlocks } = require("../src/lib/richTextBlocks");

test("sanitizeRichTextBlocks keeps a typed text description", () => {
  const saved = sanitizeRichTextBlocks([
    { type: "text", text: "Review chapter 4 examples", marks: [], spans: [{ text: "Review chapter 4 examples", marks: [] }] },
  ]);
  assert.equal(saved[0].text, "Review chapter 4 examples");
});

test("sanitizeRichTextBlocks keeps span-only blocks", () => {
  const saved = sanitizeRichTextBlocks([
    { type: "text", marks: [], spans: [{ text: "Bring the worksheet", marks: ["bold"] }] },
  ]);
  assert.equal(saved[0].text, "Bring the worksheet");
  assert.deepEqual(saved[0].spans[0].marks, ["bold"]);
});

test("sanitizeRichTextBlocks drops empty placeholder blocks", () => {
  assert.equal(
    sanitizeRichTextBlocks([{ type: "text", text: "", marks: [], spans: [{ text: "", marks: [] }] }]),
    null
  );
});

test("sanitizeRichTextBlocks accepts a plain string description", () => {
  const saved = sanitizeRichTextBlocks("Finish the lab report");
  assert.equal(saved[0].type, "text");
  assert.equal(saved[0].text, "Finish the lab report");
});

test("sanitizeRichTextBlocks accepts a JSON string of blocks", () => {
  const saved = sanitizeRichTextBlocks(JSON.stringify([{ type: "text", text: "Packed notes", marks: [] }]));
  assert.equal(saved[0].text, "Packed notes");
});
