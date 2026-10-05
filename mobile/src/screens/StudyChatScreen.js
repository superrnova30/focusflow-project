import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useAIChat } from '../context/AIChatContext';
import { AiAssistantAvatar, ChatParticipantAvatar } from '../components/ChatAvatars';
import { handleLimitError } from '../lib/upgradePrompt';
import { Ionicons } from '@expo/vector-icons';

function MessageBubble({ item, isMine, colors, isWide, user }) {
  const bubbleStyle = isMine
    ? { backgroundColor: colors.tomato, borderColor: colors.tomato }
    : { backgroundColor: colors.surface, borderColor: colors.border };

  return (
    <View style={[styles.messageRow, isMine && styles.userRow]}>
      {!isMine && (
        <View style={styles.avatarSlot}>
          <AiAssistantAvatar size={32} />
        </View>
      )}

      <View style={[styles.bubbleWrap, { maxWidth: isWide ? '72%' : '82%' }, isMine ? styles.userWrap : styles.assistantWrap]}>
        <View style={[styles.bubble, bubbleStyle, isMine ? styles.mine : styles.theirs]}>
          {!isMine && <Text style={[styles.metaText, { color: colors.textMuted }]}>FocusFlow AI</Text>}
          <Text style={[styles.messageText, { color: isMine ? '#FFFFFF' : colors.text }]}>{item.content}</Text>
        </View>
      </View>

      {isMine && (
        <View style={[styles.avatarSlot, styles.avatarSlotUser]}>
          <ChatParticipantAvatar role="user" user={user} size={32} />
        </View>
      )}
    </View>
  );
}

export default function StudyChatScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const { messages, send, sending, conversationId } = useAIChat();
  const visibleMessages = messages.filter((m) => m.role !== 'system');
  const isResumedConversation =
    Boolean(conversationId) && route?.params?.resumedConversationId === conversationId;
  const chatTitle = isResumedConversation && route?.params?.conversationTitle
    ? route.params.conversationTitle
    : 'Study Chat';
  const [text, setText] = useState('');
  const listRef = useRef();
  const [isAtBottom, setIsAtBottom] = useState(true);

  const sendMessage = async () => {
    if (!text.trim()) return;
    const toSend = text.trim();
    setText('');
    try {
      await send(toSend);
      if (isAtBottom) {
        setTimeout(() => listRef.current && listRef.current.scrollToEnd({ animated: true }), 120);
      }
    } catch (e) {
      if (!handleLimitError(navigation, e)) {
        // send handles appending an error assistant message
      }
    }
  };

  const handledInitialRequestRef = useRef(null);
  useEffect(() => {
    const initial = route?.params?.initialTopic;
    const requestKey = route?.params?.initialRequestId || initial;
    if (initial && initial.trim() && handledInitialRequestRef.current !== requestKey) {
      handledInitialRequestRef.current = requestKey;
      setTimeout(() => {
        send(initial).catch((e) => {
          handleLimitError(navigation, e);
        });
      }, 120);
    }
  }, [navigation, route?.params?.initialRequestId, route?.params?.initialTopic, send]);

  const handleScroll = (e) => {
    try {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const paddingToBottom = 60;
      const atBottom = contentOffset.y + layoutMeasurement.height + paddingToBottom >= contentSize.height;
      setIsAtBottom(atBottom);
    } catch (e) {}
  };

  const onContentSizeChange = () => {
    if (isAtBottom) {
      setTimeout(() => listRef.current && listRef.current.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}> 
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          accessibilityLabel="End conversation and go back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{chatTitle}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            {isResumedConversation
              ? 'Continuing saved conversation'
              : user?.name
                ? `${user.name.split(' ')[0]} · FocusFlow AI`
                : 'Study assistant'}
          </Text>
        </View>

        <View style={[styles.statusPill, { backgroundColor: colors.tomatoSoft, borderColor: colors.border }]}>
          <Ionicons name={conversationId ? 'cloud-done' : 'ellipse'} size={9} color={colors.tomato} />
          <Text style={[styles.statusText, { color: colors.tomato }]}>{conversationId ? 'Saved' : 'Online'}</Text>
        </View>

        {/* Jump straight to the saved AI history from where the chat happens. */}
        <TouchableOpacity
          onPress={() => navigation.navigate('AIHistory')}
          style={[styles.iconButton, styles.historyButton, { backgroundColor: colors.violetSoft, borderColor: colors.border }]}
          hitSlop={8}
        >
          <Ionicons name="time-outline" size={19} color={colors.violet} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={listRef}
        contentContainerStyle={styles.chatContent}
        style={styles.messagesScroll}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onContentSizeChange={onContentSizeChange}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
      >
        {visibleMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyAvatars}>
              <ChatParticipantAvatar role="user" user={user} size={44} />
              <View style={[styles.emptyConnector, { backgroundColor: colors.violetSoft }]}>
                <Ionicons name="chatbubbles-outline" size={18} color={colors.violet} />
              </View>
              <AiAssistantAvatar size={44} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Start your study conversation</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Ask about a topic, request summaries, or get help with flashcards and quizzes.
            </Text>
          </View>
        ) : null}

        {visibleMessages.map((item, i) => (
          <MessageBubble key={String(i)} item={item} isMine={item.role === 'user'} colors={colors} isWide={isWide} user={user} />
        ))}
      </ScrollView>

      <View style={[styles.composerWrap, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            placeholder='Ask me about a topic, request summaries, quizzes, or flashcards.'
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            style={[styles.input, { color: colors.text }]}
            onSubmitEditing={sendMessage}
            returnKeyType='send'
            multiline
            maxLength={2000}
          />

          <TouchableOpacity
            onPress={sendMessage}
            style={[styles.sendBtn, { backgroundColor: colors.tomato }, sending && styles.sendBtnDisabled]}
            disabled={sending || !text.trim()}
          >
            {sending ? (
              <ActivityIndicator size='small' color='#fff' />
            ) : (
              <Ionicons name='send' size={18} color='#fff' />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  historyButton: {
    borderWidth: 1,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messagesScroll: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 22,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  avatarSlot: {
    marginRight: 8,
    flexShrink: 0,
  },
  avatarSlotUser: {
    marginRight: 0,
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  emptyAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  emptyConnector: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
  },
  bubbleWrap: {
    flexShrink: 1,
  },
  userWrap: {
    marginLeft: 12,
  },
  assistantWrap: {
    marginRight: 12,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  mine: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 8,
  },
  theirs: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 8,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    flexShrink: 1,
  },
  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    fontSize: 15,
    lineHeight: 22,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 10,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
