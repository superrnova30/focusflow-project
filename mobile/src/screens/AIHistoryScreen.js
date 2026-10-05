import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  TextInput,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { useAIHistory, bucketForDate, relativeTime } from '../context/AIHistoryContext';
import { useAIChat } from '../context/AIChatContext';
import { RADIUS, SPACING } from '../theme/theme';
const BUCKET_ORDER = ['Today', 'Yesterday', 'Earlier this week', 'Older'];

const ACCENT_CYCLE = ['violet', 'mint', 'amber', 'tomato'];

// Intent buckets double as the filter row and as per-row badges. Each gets its
// own accent so a long list stays visually rhythmic at a glance.
const INTENT_META = {
  all: { label: 'All', icon: 'albums-outline' },
  study: { label: 'Study', icon: 'school-outline', tone: 'violet' },
  casual: { label: 'Chat', icon: 'chatbubbles-outline', tone: 'mint' },
  other: { label: 'Other', icon: 'sparkles-outline', tone: 'amber' },
};

function useIntentMeta(colors) {
  return useMemo(() => ({
    study: { ...INTENT_META.study, color: colors.violet, soft: colors.violetSoft },
    casual: { ...INTENT_META.casual, color: colors.mint, soft: colors.mintSoft },
    other: { ...INTENT_META.other, color: colors.amber, soft: colors.amberSoft },
  }), [colors]);
}

function ConversationRow({ item, meta, colors, onOpen, onPin, onDelete, compact, accentColor }) {
  const scale = useRef(new Animated.Value(1)).current;
  const info = meta[item.intent] || meta.other;

  const pressIn = () => Animated.spring(scale, { toValue: 0.985, useNativeDriver: true, friction: 8 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onOpen}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={`${item.title || 'Untitled conversation'}, ${item.messageCount || 0} messages, updated ${relativeTime(item.updatedAt)}`}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: colors.surface,
            borderColor: item.pinned ? info.color : colors.border,
            opacity: pressed ? 0.92 : 1,
          },
          compact && styles.rowCompact,
        ]}
      >
        <View style={[styles.rowAccent, { backgroundColor: accentColor || info.color }]} />
        <View style={[styles.rowIcon, { backgroundColor: info.soft }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={17} color={info.color} />
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTitleLine}>
            {item.pinned ? <Ionicons name="pin" size={11} color={info.color} style={{ marginRight: 4 }} /> : null}
            <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title || 'Untitled conversation'}
            </Text>
          </View>

          {!!item.preview && (
            <Text style={[styles.rowPreview, { color: colors.textMuted }]} numberOfLines={compact ? 1 : 2}>
              {item.preview}
            </Text>
          )}

          <View style={styles.rowMetaLine}>
            <Text style={[styles.rowMetaText, { color: colors.textMuted }]}>
              {info.label}
              {!compact ? ` · ${item.messageCount || 0} messages` : ''}
              {` · ${relativeTime(item.updatedAt)}`}
            </Text>
          </View>
        </View>

        <View style={styles.rowActions}>
          <Pressable
            onPress={(event) => { event.stopPropagation?.(); onPin(); }}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={item.pinned ? 'Unpin conversation' : 'Pin conversation'}
          >
            <Ionicons
              name={item.pinned ? 'pin' : 'pin-outline'}
              size={17}
              color={item.pinned ? info.color : colors.textMuted}
            />
          </Pressable>
          <Pressable
            onPress={(event) => { event.stopPropagation?.(); onDelete(); }}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Delete conversation"
          >
            <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function AIHistoryScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const meta = useIntentMeta(colors);
  const isWide = width >= 840;
  const compact = width < 390;
  const styles2 = useMemo(
    () => createStyles(colors, isWide, compact),
    [colors, isWide, compact]
  );
  const { clear: startNewChat } = useAIChat();

  const {
    conversations,
    stats,
    total,
    loading,
    refreshing,
    error,
    search,
    intentFilter,
    load,
    refresh,
    runSearch,
    changeIntent,
    togglePin,
    remove,
    clearAll,
  } = useAIHistory();

  const [localSearch, setLocalSearch] = useState(search || '');

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroShift = useRef(new Animated.Value(24)).current;
  const listFade = useRef(new Animated.Value(0)).current;

  const runEntrance = useCallback(() => {
    heroOpacity.setValue(0);
    heroShift.setValue(24);
    listFade.setValue(0);
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(heroShift, { toValue: 0, duration: 520, useNativeDriver: true }),
      Animated.timing(listFade, { toValue: 1, duration: 620, delay: 120, useNativeDriver: true }),
    ]).start();
  }, [heroOpacity, heroShift, listFade]);

  // Reload whenever the tab/screen regains focus so new chats appear instantly.
  useFocusEffect(
    useCallback(() => {
      runEntrance();
      load({ mode: 'initial' });
    }, [runEntrance, load])
  );

  useEffect(() => {
    setLocalSearch(search || '');
  }, [search]);

  // Group into time buckets while preserving the server's pinned-first order.
  const sections = useMemo(() => {
    const pinned = conversations.filter((c) => c.pinned);
    const rest = conversations.filter((c) => !c.pinned);

    const groups = {};
    rest.forEach((c) => {
      const bucket = bucketForDate(c.updatedAt);
      if (!groups[bucket]) groups[bucket] = [];
      groups[bucket].push(c);
    });

    const list = [];
    if (pinned.length) list.push({ key: 'pinned', title: '📌 Pinned', data: pinned });
    BUCKET_ORDER.forEach((bucket) => {
      if (groups[bucket] && groups[bucket].length) {
        list.push({ key: bucket, title: bucket, data: groups[bucket] });
      }
    });
    return list;
  }, [conversations]);

  const flatRows = useMemo(() => {
    let itemIndex = 0;
    const rows = [];
    sections.forEach((section) => {
      rows.push({ type: 'heading', key: `h-${section.key}`, title: section.title, count: section.data.length });
      section.data.forEach((c) => {
        rows.push({ type: 'item', key: c.id, conversation: c, accentIndex: itemIndex });
        itemIndex += 1;
      });
    });
    return rows;
  }, [sections]);

  const accentForIndex = useCallback(
    (index) => {
      const key = ACCENT_CYCLE[index % ACCENT_CYCLE.length];
      if (key === 'mint') return colors.mint;
      if (key === 'amber') return colors.amber;
      if (key === 'tomato') return colors.tomato;
      return colors.violet;
    },
    [colors]
  );

  const confirmDelete = useCallback((conversation) => {
    const doDelete = async () => {
      try {
        await remove(conversation.id);
      } catch (e) {
        Alert.alert('Could not delete', e.message || 'Please try again.');
      }
    };

    if (Platform.OS === 'web') {
      // Alert.alert with buttons is not reliable on web; confirm() is.
      // eslint-disable-next-line no-alert
      const ok = typeof window !== 'undefined' && window.confirm
        ? window.confirm(`Delete "${conversation.title}"?`)
        : true;
      if (ok) doDelete();
      return;
    }

    Alert.alert('Delete conversation?', `"${conversation.title}" will be removed permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  }, [remove]);

  const confirmClearAll = useCallback(() => {
    const doClear = async () => {
      try {
        await clearAll();
      } catch (e) {
        Alert.alert('Could not clear history', e.message || 'Please try again.');
      }
    };

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      const ok = typeof window !== 'undefined' && window.confirm
        ? window.confirm('Clear your entire AI history? This cannot be undone.')
        : true;
      if (ok) doClear();
      return;
    }

    Alert.alert('Clear all AI history?', 'Every saved conversation will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: doClear },
    ]);
  }, [clearAll]);

  const renderRow = ({ item }) => {
    if (item.type === 'heading') {
      return (
        <View style={styles2.sectionHead}>
          <Text style={[styles2.sectionTitle, { color: colors.text }]}>{item.title}</Text>
          <View style={[styles2.sectionCountPill, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Text style={[styles2.sectionCount, { color: colors.textMuted }]}>{item.count}</Text>
          </View>
        </View>
      );
    }

    const conversation = item.conversation;
    return (
      <ConversationRow
        item={conversation}
        meta={meta}
        colors={colors}
        compact={compact}
        accentColor={accentForIndex(item.accentIndex)}
        onOpen={() => {
          const params = { conversationId: conversation.id, title: conversation.title };
          const routeNames = navigation.getState?.()?.routeNames || [];
          if (routeNames.includes('AIHistoryDetail')) {
            navigation.navigate('AIHistoryDetail', params);
          } else {
            navigation.navigate('Study', { screen: 'AIHistoryDetail', params });
          }
        }}
        onPin={() => togglePin(conversation.id)}
        onDelete={() => confirmDelete(conversation)}
      />
    );
  };

  const filters = ['all', 'study', 'casual', 'other'];

  const startConversation = useCallback(() => {
    startNewChat();
    const routeNames = navigation.getState?.()?.routeNames || [];
    if (routeNames.includes('StudyChat')) {
      navigation.navigate('StudyChat');
      return;
    }
    navigation.navigate('Study', { screen: 'StudyChat' });
  }, [navigation, startNewChat]);

  return (
    <Screen>
      <FlatList
        style={styles2.list}
        data={flatRows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={styles2.page}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.violet} colors={[colors.violet]} />
        }
        ListHeaderComponent={
          <Animated.View style={{ opacity: heroOpacity, transform: [{ translateY: heroShift }] }}>
            <View style={styles2.pageHeader}>
              {navigation.canGoBack?.() ? (
                <Pressable
                  onPress={() => navigation.goBack()}
                  style={({ pressed }) => [styles2.backBtn, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles2.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                >
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                </Pressable>
              ) : (
                <View style={styles2.backSpacer} />
              )}
              <View style={styles2.pageHeaderCopy}>
                <Text style={[styles2.pageTitle, { color: colors.text }]}>AI History</Text>
                <Text style={[styles2.pageMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {loading
                    ? 'Loading…'
                    : `${stats.totalConversations || 0} chat${(stats.totalConversations || 0) === 1 ? '' : 's'} · ${stats.totalMessages || 0} messages`}
                </Text>
              </View>
              <Pressable
                onPress={startConversation}
                accessibilityRole="button"
                accessibilityLabel="Start a new AI conversation"
                style={({ pressed }) => [styles2.newChatBtn, pressed && styles2.pressed]}
              >
                <Ionicons name="add" size={18} color="#fff" />
                {!compact && <Text style={styles2.newChatText}>New</Text>}
              </Pressable>
            </View>

            <View style={[styles2.searchWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Ionicons name="search" size={17} color={colors.textMuted} style={styles2.searchLeading} />
              <TextInput
                value={localSearch}
                onChangeText={(t) => { setLocalSearch(t); runSearch(t); }}
                placeholder="Search conversations…"
                placeholderTextColor={colors.textMuted}
                style={[styles2.searchInput, { color: colors.text }]}
                returnKeyType="search"
                onSubmitEditing={() => load({ searchTerm: localSearch })}
                accessibilityLabel="Search AI conversation history"
              />
              {!!localSearch && (
                <Pressable
                  onPress={() => { setLocalSearch(''); runSearch(''); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={styles2.clearSearchBtn}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            <View style={[styles2.filterBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {filters.map((key) => {
                const active = intentFilter === key;
                const info = key === 'all' ? INTENT_META.all : meta[key];
                const accent = key === 'all' ? colors.violet : info.color;
                return (
                  <Pressable
                    key={key}
                    onPress={() => changeIntent(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles2.filterTab, active && { backgroundColor: colors.violetSoft }]}
                  >
                    <Ionicons name={info.icon} size={13} color={active ? accent : colors.textMuted} />
                    <Text style={[styles2.filterTabText, { color: active ? accent : colors.textMuted }]}>
                      {info.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles2.toolsRow}>
              {!!search.trim() && !loading ? (
                <Text style={[styles2.resultNote, { color: colors.textMuted }]}>
                  {total} result{total === 1 ? '' : 's'}
                </Text>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              {conversations.length > 0 ? (
                <Pressable
                  onPress={confirmClearAll}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all AI history"
                  style={({ pressed }) => [styles2.clearAllBtn, pressed && styles2.pressed]}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles2.clearAllText, { color: colors.textMuted }]}>Clear all</Text>
                </Pressable>
              ) : null}
            </View>

            {error ? (
              <View style={[styles2.errorBox, { borderColor: colors.tomato, backgroundColor: colors.surface }]}>
                <Ionicons name="cloud-offline-outline" size={18} color={colors.tomato} />
                <Text style={[styles2.errorText, { color: colors.text }]}>{error}</Text>
                <Pressable
                  onPress={refresh}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading AI history"
                  style={({ pressed }) => [styles2.retryBtn, pressed && styles2.pressed]}
                >
                  <Text style={styles2.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </Animated.View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles2.emptyWrap}>
              <ActivityIndicator color={colors.violet} />
              <Text style={[styles2.emptyText, { color: colors.textMuted }]}>Loading your AI history…</Text>
            </View>
          ) : (
            <View style={styles2.emptyWrap}>
              <View style={[styles2.emptyIcon, { backgroundColor: colors.violetSoft }]}>
                <Ionicons name="chatbubbles-outline" size={30} color={colors.violet} />
              </View>
              <Text style={[styles2.emptyTitle, { color: colors.text }]}>
                {search.trim() || intentFilter !== 'all' ? 'No conversations match' : 'No AI history yet'}
              </Text>
              <Text style={[styles2.emptyText, { color: colors.textMuted }]}>
                {search.trim() || intentFilter !== 'all'
                  ? 'Try a different search term or filter.'
                  : 'Ask the AI anything from the Study tab — your conversations will appear here automatically.'}
              </Text>
              {(!search.trim() && intentFilter === 'all') && (
                <Pressable
                  onPress={startConversation}
                  style={({ pressed }) => [styles2.cta, pressed && styles2.pressed]}
                >
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles2.ctaText}>Start a conversation</Text>
                </Pressable>
              )}
            </View>
          )
        }
        ListFooterComponent={null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingVertical: 10,
    paddingRight: 8,
    paddingLeft: 0,
    marginBottom: 6,
    overflow: 'hidden',
  },
  rowCompact: { paddingVertical: 9 },
  rowAccent: { width: 4, alignSelf: 'stretch', borderTopLeftRadius: RADIUS.lg, borderBottomLeftRadius: RADIUS.lg, marginRight: 8 },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0, paddingVertical: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  rowPreview: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  rowMetaText: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  rowActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  iconBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    list: {
      flex: 1,
    },
    page: {
      width: '100%',
      maxWidth: isWide ? 720 : '100%',
      alignSelf: 'center',
      paddingTop: compact ? 8 : 10,
      paddingBottom: SPACING.md,
      paddingHorizontal: compact ? 12 : 14,
    },
    pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
    pageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    backSpacer: { width: 40 },
    pageHeaderCopy: { flex: 1, minWidth: 0 },
    pageTitle: { fontSize: compact ? 18 : 20, fontWeight: '900', letterSpacing: -0.3 },
    pageMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    newChatBtn: {
      height: 40,
      minWidth: compact ? 40 : 72,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderRadius: 14,
      paddingHorizontal: compact ? 0 : 12,
      backgroundColor: colors.tomato,
      flexShrink: 0,
    },
    newChatText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 12,
      marginBottom: 8,
      minHeight: 44,
    },
    searchLeading: { marginRight: 8 },
    searchInput: {
      flex: 1,
      fontSize: 14,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
      minWidth: 0,
    },
    clearSearchBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    filterBar: {
      flexDirection: 'row',
      borderWidth: 1,
      borderRadius: 12,
      padding: 3,
      marginBottom: 8,
      gap: 2,
    },
    filterTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 7,
      borderRadius: 9,
    },
    filterTabText: { fontSize: compact ? 10.5 : 11.5, fontWeight: '800' },
    toolsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
      minHeight: 28,
    },
    clearAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 6,
    },
    clearAllText: { fontSize: 11, fontWeight: '700' },
    resultNote: { fontSize: 11.5, fontWeight: '600' },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: 13,
      marginBottom: 12,
    },
    errorText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
    retryBtn: { paddingVertical: 6, paddingHorizontal: 8 },
    retryText: { color: colors.tomato, fontSize: 11, fontWeight: '900' },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 6,
    },
    sectionTitle: { fontSize: 13, fontWeight: '800' },
    sectionCountPill: {
      minWidth: 24,
      height: 22,
      paddingHorizontal: 8,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionCount: { fontSize: 11, fontWeight: '800' },
    emptyWrap: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingVertical: 32,
      paddingHorizontal: 20,
      marginTop: 4,
    },
    emptyIcon: { width: 64, height: 64, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 16, fontWeight: '900', marginTop: 14 },
    emptyText: { fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 320 },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderRadius: RADIUS.md,
      paddingHorizontal: 18,
      paddingVertical: 12,
      marginTop: 18,
      backgroundColor: colors.tomato,
    },
    ctaText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  });
