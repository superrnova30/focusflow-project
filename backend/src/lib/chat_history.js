function trimConversationHistory(messages, limit = 8) {
  if (!Array.isArray(messages)) return [];

  const filtered = [];
  for (const message of messages) {
    const role = (message && message.role) || 'user';
    if (role === 'system') continue;

    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!content) continue;

    const previous = filtered[filtered.length - 1];
    if (previous && previous.role === role && previous.content === content) continue;

    filtered.push({ role, content });
  }

  if (filtered.length <= limit) return filtered;

  return filtered.slice(-limit);
}

module.exports = { trimConversationHistory };
