const prisma = require('./prisma');

// A conversation title should be a short, readable summary of what the student
// asked. Long first messages get truncated to a clean word boundary so the
// History list stays scannable.
const TITLE_MAX = 68;

// Collapse runs of whitespace without relying on a regex literal, so the
// normalization is identical in every environment.
function collapseWhitespace(text) {
  return String(text || '')
    .split(/[\t\n\r ]+/)
    .filter(Boolean)
    .join(' ');
}

function deriveTitle(text) {
  const value = collapseWhitespace(text);
  if (!value) return 'New conversation';
  if (value.length <= TITLE_MAX) return value;

  const clipped = value.slice(0, TITLE_MAX);
  const lastSpace = clipped.lastIndexOf(' ');
  const base = lastSpace > 30 ? clipped.slice(0, lastSpace) : clipped;
  return `${base.trim()}…`;
}

function derivePreview(text) {
  const value = collapseWhitespace(text);
  if (!value) return null;
  return value.length <= 160 ? value : `${value.slice(0, 160).trim()}…`;
}

/**
 * Persists one user → assistant exchange as a conversation. If `conversationId`
 * is supplied and belongs to the user, the messages are appended to it;
 * otherwise a new conversation is created. History persistence is best-effort:
 * a failure here must never break the actual AI response, so callers should
 * treat a null return as "history unavailable" rather than an error.
 */
async function recordExchange({ userId, conversationId, userText, assistantText, intent }) {
  if (!userId) return null;

  const userContent = String(userText || '').trim();
  const assistantContent = String(assistantText || '').trim();
  if (!userContent && !assistantContent) return null;

  try {
    let conversation = null;

    if (conversationId) {
      conversation = await prisma.chatConversation.findFirst({
        where: { id: conversationId, userId },
      });
    }

    if (!conversation) {
      conversation = await prisma.chatConversation.create({
        data: {
          userId,
          title: deriveTitle(userContent || assistantContent),
          intent: intent || 'other',
          preview: derivePreview(assistantContent || userContent),
        },
      });
    }

    const rows = [];
    if (userContent) rows.push({ conversationId: conversation.id, role: 'user', content: userContent });
    if (assistantContent) rows.push({ conversationId: conversation.id, role: 'assistant', content: assistantContent });

    if (rows.length) {
      await prisma.chatMessage.createMany({ data: rows });
    }

    const updated = await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        messageCount: { increment: rows.length },
        // Keep the newest assistant reply as the list preview.
        preview: derivePreview(assistantContent || conversation.preview || userContent),
        // Only the first question defines the intent; don't relabel mid-chat.
        intent: conversation.messageCount === 0 ? intent || conversation.intent : conversation.intent,
      },
    });

    return updated;
  } catch (err) {
    console.warn('Chat history persistence failed:', err && err.message ? err.message : err);
    return null;
  }
}

module.exports = { deriveTitle, derivePreview, recordExchange };
