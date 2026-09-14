import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import client from '../api/client';

const AIChatContext = createContext(null);

export function AIChatProvider({ children }) {
  const [messages, setMessages] = useState([
    // Keep the client-side system message neutral — backend will pick a
    // system prompt based on intent. Avoid forcing a study template here.
    { id: 'system', role: 'system', content: 'You are a friendly conversational assistant. Respond naturally and match the user tone.' },
  ]);
  const messagesRef = useRef(messages);
   const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);

  const appendMessage = useCallback((msg) => {
    setMessages((m) => {
      const next = [...m, msg];
      messagesRef.current = next;
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    const initial = [{ id: 'system', role: 'system', content: messagesRef.current?.[0]?.content || '' }];
    messagesRef.current = initial;
    setMessages(initial);
  }, []);

  const send = useCallback(async (text) => {
    if (!text || !String(text).trim()) return;
     // prevent concurrent sends
     if (sendingRef.current) return;
     sendingRef.current = true;
    const userMsg = { id: `user-${Date.now()}`, role: 'user', content: String(text) };
    // Optimistically append the user message and use the latest messages from the ref
    appendMessage(userMsg);
    setSending(true);
    try {
      const conversation = (messagesRef.current || []).concat([userMsg]).map(({ role, content }) => ({ role, content }));
      const { data } = await client.post('/ai/chat', { messages: conversation }, { timeout: 30000 });
      let replyContent = 'Sorry, no response.';
      if (data) {
        if (data.reply && typeof data.reply === 'object' && data.reply.content) replyContent = data.reply.content;
        else if (data.raw && data.raw.choices && data.raw.choices[0] && data.raw.choices[0].message && data.raw.choices[0].message.content) replyContent = data.raw.choices[0].message.content;
        else if (typeof data.reply === 'string') replyContent = data.reply;
      }
      const assistant = { id: `assistant-${Date.now()}`, role: 'assistant', content: String(replyContent) };
      appendMessage(assistant);
      return assistant;
      } catch (err) {
      // Try to extract a helpful error from the server response
      let friendly = 'Sorry, something went wrong. Please try again.';
      try {
        if (err && err.response && err.response.data) {
          const d = err.response.data;
            if (d.reply && d.reply.content) friendly = String(d.reply.content);
            else if (d.message) friendly = String(d.message);
            else if (d.error) friendly = String(d.error);
            else if (d.body) friendly = String(d.body);
            else if (d.raw && d.raw.openai && d.raw.openai.error && d.raw.openai.error.message) friendly = `AI fallback error: ${d.raw.openai.error.message}`;
            else if (d.raw && d.raw.geminiError) friendly = `Gemini error: ${String(d.raw.geminiError).slice(0, 800)}`;
            else if (typeof d === 'string') friendly = d;
        } else if (err && err.message) {
          friendly = err.message;
        }
      } catch (e) {
        // ignore extraction errors
      }

      const errMsg = { id: `error-${Date.now()}`, role: 'assistant', content: friendly };
      appendMessage(errMsg);
      // rethrow so callers can handle programmatically
      throw err;
    } finally {
       sendingRef.current = false;
      setSending(false);
    }
  }, [appendMessage, messages]);

  return (
    <AIChatContext.Provider value={{ messages, appendMessage, send, sending, clear }}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChat() {
  const ctx = useContext(AIChatContext);
  if (!ctx) throw new Error('useAIChat must be used inside AIChatProvider');
  return ctx;
}

export default AIChatContext;
