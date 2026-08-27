import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import client from '../api/client';

function MessageBubble({ item, isMine, colors }) {
  return (
    <View style={[styles.bubble, isMine ? styles.mine : styles.theirs, { backgroundColor: isMine ? colors.primary : colors.card }]}> 
      <Text style={{ color: isMine ? '#fff' : colors.text }}>{item.content}</Text>
    </View>
  );
}

export default function StudyChatScreen() {
  const { colors } = useTheme();
  const [messages, setMessages] = useState([
    { role: 'system', content: 'You are a friendly study assistant. Help the student with clear, concise answers.' },
  ]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef();

  const send = async () => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setText('');
    setSending(true);
    try {
      const { data } = await client.post('/ai/chat', { messages: next }, { timeout: 120000 });
      // Extract a sensible assistant reply from the backend response.
      let replyContent = 'Sorry, no response.';
      if (data) {
        if (data.reply && typeof data.reply === 'object' && data.reply.content) {
          replyContent = data.reply.content;
        } else if (data.raw && data.raw.choices && data.raw.choices[0] && data.raw.choices[0].message && data.raw.choices[0].message.content) {
          replyContent = data.raw.choices[0].message.content;
        } else if (typeof data.reply === 'string') {
          replyContent = data.reply;
        }
      }
      const assistant = { role: 'assistant', content: String(replyContent) };
      const appended = [...next, assistant];
      setMessages(appended);
      // scroll to end
      setTimeout(() => listRef.current && listRef.current.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <FlatList
        ref={listRef}
        data={messages.filter(m => m.role !== 'system')}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item, index }) => <MessageBubble item={item} isMine={item.role === 'user'} colors={colors} />}
      />

      <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.card }]}> 
        <TextInput
          placeholder='Ask me about a topic, request summaries, quizzes, or flashcards.'
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          style={[styles.input, { color: colors.text }]}
          onSubmitEditing={send}
          returnKeyType='send'
        />
        <TouchableOpacity onPress={send} style={[styles.sendBtn, { backgroundColor: colors.primary }]} disabled={sending}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{sending ? '...' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bubble: { padding: 12, borderRadius: 12, marginVertical: 6, maxWidth: '85%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  composer: { flexDirection: 'row', padding: 8, alignItems: 'center', borderTopWidth: 1 },
  input: { flex: 1, padding: 10, fontSize: 14 },
  sendBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
});
