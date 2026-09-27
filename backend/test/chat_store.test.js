const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveTitle, derivePreview } = require('../src/lib/chat_store');

test('deriveTitle collapses whitespace and keeps short questions intact', () => {
  assert.equal(deriveTitle('  Explain   photosynthesis  '), 'Explain photosynthesis');
});

test('deriveTitle truncates long messages on a word boundary with an ellipsis', () => {
  const long = `${'word '.repeat(40)}end`;
  const title = deriveTitle(long);

  assert.ok(title.length <= 69, `expected a bounded title, got ${title.length} chars`);
  assert.ok(title.endsWith('…'));
  // Should cut at a space, so no half-word before the ellipsis.
  assert.ok(!/\w…$/.test(title.replace(/\s+\w+…$/, '')));
});

test('deriveTitle falls back for empty input', () => {
  assert.equal(deriveTitle('   '), 'New conversation');
  assert.equal(deriveTitle(null), 'New conversation');
});

test('derivePreview bounds long text and normalizes whitespace', () => {
  assert.equal(derivePreview('  hello   world '), 'hello world');
  assert.equal(derivePreview(''), null);

  const long = 'a'.repeat(400);
  const preview = derivePreview(long);
  assert.ok(preview.length <= 161);
  assert.ok(preview.endsWith('…'));
});
