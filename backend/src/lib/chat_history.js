function trimConversationHistory(messages, limit = 8) {
  if (!Array.isArray(messages)) return [];

  const filtered = messages.filter((message) => {
    const role = (message && message.role) || 'user';
    return role !== 'system';
  });

  if (filtered.length <= limit) return filtered;

  return filtered.slice(-limit);
}

module.exports = { trimConversationHistory };
