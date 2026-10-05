import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  Platform,
  Clipboard,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AiAssistantAvatar, ChatParticipantAvatar } from '../components/ChatAvatars';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useAIHistory, relativeTime } from '../context/AIHistoryContext';
import { useAIChat } from '../context/AIChatContext';

const INTENT_STYLE = {
  study: { label: 'Study session', icon: 'school' },
  casual: { label: 'Casual chat', icon: 'chatbubbles' },
  other: { label: 'Conversation', icon: 'sparkles' },
};

function MessageBubble({ message, colors, isWide, index, user }) {
  const isUser = message.role === 'user';
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 300, delay: Math.min(index * 45, 320), useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 300, delay: Math.min(index * 45, 320), useNativeDriver: true }),
    ]).start();
  }, [fade, rise, index]);

  return (
    <Animated.View
      style={[
        styles.messageRow,
        isUser ? styles.messageRowUser : styles.messageRowAssistant,
        { opacity: fade, transform: [{ translateY: rise }] },
      ]}
    >
      {!isUser && (
        <View style={styles.avatarSlot}>
          <AiAssistantAvatar size={32} />
        </View>
      )}

      <View style={[styles.bubbleWrap, { maxWidth: isWide ? '72%' : '84%' }]}>
        <View
          style={[
            styles.bubble,
            isUser
              ? { backgroundColor: colors.tomato, borderColor: colors.tomato, borderBottomRightRadius: 8 }
              : { backgroundColor: colors.surface, borderColor: colors.border, borderBottomLeftRadius: 8 },
          ]}
        >
          <Text style={[styles.bubbleRole, { color: isUser ? 'rgba(255,255,255,0.82)' : colors.textMuted }]}>
            {isUser ? 'You' : 'FocusFlow AI'}
          </Text>
          <Text style={[styles.bubbleText, { color: isUser ? '#fff' : colors.text }]}>{message.content}</Text>
        </View>
        <Text
          style={[
            styles.bubbleTime,
            { color: colors.textMuted, textAlign: isUser ? 'right' : 'left' },
          ]}
        >
          {relativeTime(message.createdAt)}
        </Text>
      </View>

      {isUser && (
        <View style={[styles.avatarSlot, styles.avatarSlotUser]}>
          <ChatParticipantAvatar role="user" user={user} size={32} />
        </View>
      )}
    </Animated.View>
  );
}

export default function AIHistoryDetailScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const s = useStyles(colors);

  const conversationId = route?.params?.conversationId;
  const initialTitle = route?.params?.title;

  const { loadConversation, togglePin, remove, rename, conversations } = useAIHistory();
  const { resumeConversation } = useAIChat();

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Keep the header title in sync with a rename done here or on the list.
  const listVersion = conversations.find((c) => c.id === conversationId);
  const displayTitle = conversation?.title || listVersion?.title || initialTitle || 'Conversation';
  const isPinned = conversation?.pinned || listVersion?.pinned;

  const fetchOne = useCallback(async () => {
    if (!conversationId) {
      setError('That conversation could not be found.');
      setLoading(false);
      return;
    }
    try {
      const data = await loadConversation(conversationId);
      setConversation(data.conversation);
      setMessages(data.messages);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load that conversation');
    } finally {
      setLoading(false);
    }
  }, [conversationId, loadConversation]);

  useEffect(() => {
    fetchOne();
  }, [fetchOne]);

  const copyTranscript = useCallback(() => {
    const text = messages
      .map((m) => `${m.role === 'user' ? 'You' : 'FocusFlow AI'}: ${m.content}`)
      .join('\n\n');
    try {
      if (Clipboard && typeof Clipboard.setString === 'function') {
        Clipboard.setString(text);
        Alert.alert('Copied', 'The full conversation was copied to your clipboard.');
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text);
        Alert.alert('Copied', 'The full conversation was copied to your clipboard.');
      }
    } catch (e) {
      Alert.alert('Could not copy', 'Your device blocked clipboard access.');
    }
  }, [messages]);

  const handlePin = useCallback(async () => {
    if (!conversationId) return;
    setConversation((c) => (c ? { ...c, pinned: !c.pinned } : c));
    await togglePin(conversationId);
  }, [conversationId, togglePin]);

  const handleRename = useCallback(() => {
    const submit = async (next) => {
      if (!next || !next.trim()) return;
      setBusy(true);
      try {
        await rename(conversationId, next.trim());
        setConversation((c) => (c ? { ...c, title: next.trim() } : c));
      } catch (e) {
        Alert.alert('Could not rename', e.message || 'Please try again.');
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'ios' && Alert.prompt) {
      Alert.prompt('Rename conversation', 'Give this conversation a clearer name.', (text) => submit(text), 'plain-text', displayTitle);
      return;
    }

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      const next = typeof window !== 'undefined' && window.prompt ? window.prompt('Rename conversation', displayTitle) : null;
      submit(next);
      return;
    }

    Alert.alert('Rename conversation', 'Renaming is available on iOS and web. You can still delete or continue this chat.', [
      { text: 'OK' },
    ]);
  }, [conversationId, rename, displayTitle]);

  const handleDelete = useCallback(() => {
    const doDelete = async () => {
      setBusy(true);
      try {
        await remove(conversationId);
        navigation.goBack();
      } catch (e) {
        Alert.alert('Could not delete', e.message || 'Please try again.');
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('Delete this conversation permanently?') : true;
      if (ok) doDelete();
      return;
    }

    Alert.alert('Delete conversation?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  }, [conversationId, remove, navigation]);

  const handleContinue = useCallback(() => {
    resumeConversation(conversationId, messages);
    const routeNames = navigation.getState?.()?.routeNames || [];
    if (routeNames.includes('StudyChat')) {
      navigation.navigate('StudyChat', { resumedConversationId: conversationId, conversationTitle: displayTitle });
    } else {
      navigation.navigate('Study', {
        screen: 'StudyChat',
        params: { resumedConversationId: conversationId, conversationTitle: displayTitle },
      });
    }
  }, [conversationId, displayTitle, messages, navigation, resumeConversation]);

  const intent = INTENT_STYLE[conversation?.intent] || INTENT_STYLE.other;
  const userCount = messages.filter((m) => m.role === 'user').length;

  if (loading) {
    return (
      <Screen>
        <View style={s.centerFill}>
          <ActivityIndicator color={colors.violet} />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>Loading conversation…</Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={s.centerFill}>
          <View style={[s.errorIcon, { backgroundColor: colors.tomatoSoft }]}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.tomato} />
          </View>
          <Text style={[s.errorTitle, { color: colors.text }]}>Could not open this conversation</Text>
          <Text style={[s.errorBody, { color: colors.textMuted }]}>{error}</Text>
          <Pressable onPress={() => navigation.goBack()} style={[s.primaryBtn, { backgroundColor: colors.tomato }]}>
            <Text style={s.primaryBtnText}>Back to history</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 40,
          paddingTop: 14,
          maxWidth: isWide ? 820 : undefined,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {/* Header card */}
        <View style={[s.headerCard, { backgroundColor: colors.violetSoft, borderColor: colors.border }]}>
          <View style={s.headerTop}>
            <View style={[s.headerIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name={intent.icon} size={21} color={colors.violet} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: colors.text }]} numberOfLines={2}>
                {displayTitle}
              </Text>
              <Text style={[s.headerMeta, { color: colors.textMuted }]}>
                {intent.label} · {userCount} question{userCount === 1 ? '' : 's'} · {relativeTime(conversation?.updatedAt)}
              </Text>
            </View>
          </View>

          <View style={s.actionRow}>
            <Pressable onPress={handleContinue} style={[s.continuePill, { backgroundColor: colors.violet }]}>
              <Ionicons name="chatbubble-ellipses" size={15} color="#fff" />
              <Text style={s.continuePillText}>Continue chat</Text>
            </Pressable>
            <Pressable onPress={handlePin} style={[s.actionPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name={isPinned ? 'pin' : 'pin-outline'} size={15} color={isPinned ? colors.violet : colors.textMuted} />
              <Text style={[s.actionPillText, { color: colors.text }]}>{isPinned ? 'Pinned' : 'Pin'}</Text>
            </Pressable>
            <Pressable onPress={copyTranscript} style={[s.actionPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="copy-outline" size={15} color={colors.textMuted} />
              <Text style={[s.actionPillText, { color: colors.text }]}>Copy</Text>
            </Pressable>
            <Pressable onPress={handleRename} disabled={busy} style={[s.actionPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="pencil-outline" size={15} color={colors.textMuted} />
              <Text style={[s.actionPillText, { color: colors.text }]}>Rename</Text>
            </Pressable>
            <Pressable onPress={handleDelete} disabled={busy} style={[s.actionPill, { backgroundColor: colors.surface, borderColor: colors.tomato }]}>
              <Ionicons name="trash-outline" size={15} color={colors.tomato} />
              <Text style={[s.actionPillText, { color: colors.tomato }]}>Delete</Text>
            </Pressable>
          </View>
        </View>

        {/* Timeline */}
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>CONVERSATION TIMELINE</Text>
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id || String(index)}
            message={message}
            colors={colors}
            isWide={isWide}
            index={index}
            user={user}
          />
        ))}

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14 },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowAssistant: { justifyContent: 'flex-start' },
  avatarSlot: {
    marginRight: 9,
    flexShrink: 0,
  },
  avatarSlotUser: {
    marginRight: 0,
    marginLeft: 9,
  },
  bubbleWrap: { flexShrink: 1 },
  bubble: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleRole: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 },
  bubbleText: { fontSize: 14.5, lineHeight: 21, flexShrink: 1 },
  bubbleTime: { fontSize: 10, fontWeight: '600', marginTop: 4, marginHorizontal: 4 },
});

const useStyles = (colors) =>
  StyleSheet.create({
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
    loadingText: { fontSize: 13, marginTop: 12 },
    errorIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    errorTitle: { fontSize: 16, fontWeight: '800', marginTop: 14 },
    errorBody: { fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 320 },
    primaryBtn: { borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
    headerCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 16 },
    headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
    headerMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 3 },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    actionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    actionPillText: { fontSize: 12, fontWeight: '700' },
    continuePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    continuePillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    sectionLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.7, marginBottom: 12, marginTop: 4 },
  });
