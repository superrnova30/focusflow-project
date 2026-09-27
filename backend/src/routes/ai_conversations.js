const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Message content is returned as plain text; these caps keep a single response
// bounded even for very long tutoring sessions.
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MESSAGE_PAGE = 200;

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// Normalize a stored conversation into the shape the mobile History screen
// expects, so the UI never has to know about Prisma's field naming.
function serializeConversation(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    intent: conversation.intent || 'other',
    messageCount: conversation.messageCount || 0,
    preview: conversation.preview || '',
    pinned: Boolean(conversation.pinned),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function serializeMessage(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

// GET /api/ai/conversations
// Query: ?search=&intent=&limit=&offset=
// Returns the student's own conversations, newest activity first, with pinned
// conversations floated to the top. Also returns lightweight aggregate stats
// for the History dashboard header.
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = clampInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const search = String(req.query.search || '').trim();
    const intent = String(req.query.intent || '').trim();

    // Only filter on columns guaranteed to exist so a search never 500s.
    const where = { userId };
    if (intent && intent !== 'all') where.intent = intent;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { preview: { contains: search, mode: 'insensitive' } },
      ];
    }

    const countInclude = { _count: { select: { messages: true } } };

    const listQuery = prisma.chatConversation.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      skip: offset,
      include: countInclude,
    });

    const countQuery = prisma.chatConversation.count({ where });

    const aggregateQuery = prisma.chatConversation.aggregate({
      where: { userId },
      _sum: { messageCount: true },
      _count: { _all: true },
    });

    const results = await Promise.all([listQuery, countQuery, aggregateQuery]);
    const conversations = results[0];
    const total = results[1];
    const aggregate = results[2];

    const totalMessages = aggregate._sum.messageCount || 0;

    const serializedConversations = conversations.map(function mapConversation(c) {
      const base = serializeConversation(c);
      // Trust the live count so the list is accurate even if the denormalized
      // counter ever drifts.
      base.messageCount = c._count ? c._count.messages : c.messageCount;
      return base;
    });

    return res.json({
      conversations: serializedConversations,
      total,
      hasMore: offset + conversations.length < total,
      stats: {
        totalConversations: aggregate._count._all || 0,
        totalMessages,
        // A useful proxy for "how much have I used the AI tutor" — 2 messages
        // (one question + one answer) is the minimum for a real exchange.
        totalExchanges: Math.floor(totalMessages / 2),
      },
    });
  } catch (err) {
    console.error('List chat conversations failed', err);
    return res.status(500).json({ error: 'Could not load your AI history' });
  }
});

// GET /api/ai/conversations/:id  -> a single conversation with its messages.
router.get('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const messageInclude = {
      messages: { orderBy: { createdAt: 'asc' }, take: MESSAGE_PAGE },
    };

    const conversation = await prisma.chatConversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: messageInclude,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    return res.json({
      conversation: serializeConversation(conversation),
      messages: (conversation.messages || []).map(serializeMessage),
    });
  } catch (err) {
    console.error('Load chat conversation failed', err);
    return res.status(500).json({ error: 'Could not load that conversation' });
  }
});

// POST /api/ai/conversations  -> start a new, empty conversation.
// Lets the chat screen pre-create a thread so subsequent replies are appended
// server-side without the client juggling ids.
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const title = String(body.title || '').trim() || 'New conversation';
    const conversation = await prisma.chatConversation.create({
      data: { userId: req.user.id, title: title.slice(0, 120) },
    });
    return res.status(201).json({ conversation: serializeConversation(conversation) });
  } catch (err) {
    console.error('Create chat conversation failed', err);
    return res.status(500).json({ error: 'Could not start a new conversation' });
  }
});

// PATCH /api/ai/conversations/:id  -> rename and/or pin. Only the owner can.
router.patch('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const existing = await prisma.chatConversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Conversation not found' });

    const body = req.body || {};
    const data = {};
    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (!title) return res.status(400).json({ error: 'Title cannot be empty' });
      data.title = title.slice(0, 120);
    }
    if (typeof body.pinned === 'boolean') data.pinned = body.pinned;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const conversation = await prisma.chatConversation.update({
      where: { id: existing.id },
      data,
    });
    return res.json({ conversation: serializeConversation(conversation) });
  } catch (err) {
    console.error('Update chat conversation failed', err);
    return res.status(500).json({ error: 'Could not update that conversation' });
  }
});

// DELETE /api/ai/conversations/:id  -> removes the conversation and its messages.
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const existing = await prisma.chatConversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Conversation not found' });

    await prisma.chatConversation.delete({ where: { id: existing.id } });
    return res.json({ ok: true, id: existing.id });
  } catch (err) {
    console.error('Delete chat conversation failed', err);
    return res.status(500).json({ error: 'Could not delete that conversation' });
  }
});

// DELETE /api/ai/conversations  -> clear the student's entire AI history.
router.delete('/conversations', requireAuth, async (req, res) => {
  try {
    const result = await prisma.chatConversation.deleteMany({ where: { userId: req.user.id } });
    return res.json({ ok: true, deleted: result.count });
  } catch (err) {
    console.error('Clear chat history failed', err);
    return res.status(500).json({ error: 'Could not clear your AI history' });
  }
});

module.exports = router;
