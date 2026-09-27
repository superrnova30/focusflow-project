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
import { RADIUS, SPACING } from '../theme/theme';

const BUCKET_ORDER = ['Today', 'Yesterday', 'Earlier this week', 'Older'];

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

function StatTile({ icon, value, label, color, soft, colors, compact }) {
  return (
    <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }, compact && styles.statTileCompact]}>
      <View style={[styles.statIconWrap, compact && styles.statIconWrapCompact, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ConversationRow({ item, meta, colors, onOpen, onPin, onDelete, isWide, compact }) {
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
            borderWidth: item.pinned ? 1.5 : 1,
            opacity: pressed ? 0.94 : 1,
          },
          isWide && styles.rowWide,
          compact && styles.rowCompact,
        ]}
      >
        <View style={[styles.rowIcon, { backgroundColor: info.soft }]}>
          <Ionicons name={info.icon} size={20} color={info.color} />
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTitleLine}>
            {item.pinned && <Ionicons name="pin" size={12} color={info.color} style={{ marginRight: 4 }} />}
            <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title || 'Untitled conversation'}
            </Text>
          </View>

          {!!item.preview && !compact && (
            <Text style={[styles.rowPreview, { color: colors.textMuted }]} numberOfLines={2}>
              {item.preview}
            </Text>
          )}

          <View style={styles.rowMetaLine}>
            <View style={[styles.badge, { backgroundColor: info.soft }]}>
              <Text style={[styles.badgeText, { color: info.color }]}>{info.label.toUpperCase()}</Text>
            </View>
            {!compact && (
              <>
                <Text style={[styles.rowMetaText, { color: colors.textMuted }]}>
                  {item.messageCount || 0} messages
                </Text>
                <Text style={[styles.rowMetaDot, { color: colors.textMuted }]}>•</Text>
              </>
            )}
            <Text style={[styles.rowMetaText, { color: colors.textMuted }]}>{relativeTime(item.updatedAt)}</Text>
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
    const rows = [];
    sections.forEach((section) => {
      rows.push({ type: 'heading', key: `h-${section.key}`, title: section.title, count: section.data.length });
      section.data.forEach((c) => rows.push({ type: 'item', key: c.id, conversation: c }));
    });
    return rows;
  }, [sections]);

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
          <Text style={[styles2.sectionTitle, { color: colors.textMuted }]}>{item.title}</Text>
          <View style={[styles2.sectionRule, { backgroundColor: colors.border }]} />
          <Text style={[styles2.sectionCount, { color: colors.textMuted }]}>{item.count}</Text>
        </View>
      );
    }

    const conversation = item.conversation;
    return (
      <ConversationRow
        item={conversation}
        meta={meta}
        colors={colors}
        isWide={isWide}
        compact={compact}
        onOpen={() => navigation.navigate('AIHistoryDetail', { conversationId: conversation.id, title: conversation.title })}
        onPin={() => togglePin(conversation.id)}
        onDelete={() => confirmDelete(conversation)}
      />
    );
  };

  const filters = ['all', 'study', 'casual', 'other'];

  const startConversation = useCallback(() => {
    const routeNames = navigation.getState?.()?.routeNames || [];
    if (routeNames.includes('StudyChat')) {
      navigation.navigate('StudyChat');
      return;
    }
    navigation.navigate('Study', { screen: 'StudyChat' });
  }, [navigation]);

  return (
    <Screen>
      <FlatList
        data={flatRows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles2.page}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.violet} colors={[colors.violet]} />
        }
        ListHeaderComponent={
          <Animated.View style={{ opacity: heroOpacity, transform: [{ translateY: heroShift }] }}>
            {/* Hero */}
            <View style={styles2.hero}>
              <View style={styles2.heroTop}>
                <View style={styles2.heroBadge}>
                  <Ionicons name="sparkles" size={22} color={colors.violet} />
                </View>
                <View style={styles2.heroCopy}>
                  <Text style={styles2.heroEyebrow}>YOUR AI WORKSPACE</Text>
                  <Text style={styles2.heroTitle}>Conversation history</Text>
                  <Text style={styles2.heroSubtitle}>
                    Revisit explanations, continue learning, and keep useful answers close.
                  </Text>
                </View>
                <Pressable
                  onPress={startConversation}
                  accessibilityRole="button"
                  accessibilityLabel="Start a new AI conversation"
                  style={({ pressed }) => [styles2.newChatBtn, pressed && styles2.pressed]}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  {!compact && <Text style={styles2.newChatText}>New chat</Text>}
                </Pressable>
              </View>

              {/* Stats */}
              <View style={styles2.statRow}>
                <StatTile
                  compact={isWide}
                  icon="chatbubbles"
                  value={stats.totalConversations || 0}
                  label="Conversations"
                  color={colors.violet}
                  soft={colors.surface}
                  colors={colors}
                />
                <StatTile
                  compact={isWide}
                  icon="swap-horizontal"
                  value={stats.totalExchanges || 0}
                  label="Exchanges"
                  color={colors.mint}
                  soft={colors.surface}
                  colors={colors}
                />
                <StatTile
                  compact={isWide}
                  icon="layers"
                  value={stats.totalMessages || 0}
                  label="Messages"
                  color={colors.amber}
                  soft={colors.surface}
                  colors={colors}
                />
              </View>
            </View>

            {/* Search */}
              <View style={styles2.searchWrap}>
                <View style={styles2.searchIcon}>
                <Ionicons name="search" size={17} color={colors.textMuted} />
                </View>
                <TextInput
                  value={localSearch}
                  onChangeText={(t) => { setLocalSearch(t); runSearch(t); }}
                  placeholder="Search titles, topics, or answers…"
                  placeholderTextColor={colors.textMuted}
                  style={styles2.searchInput}
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
                    <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>

            {/* Filters */}
            <View style={styles2.controlsRow}>
              <View style={styles2.filterRow}>
                {filters.map((key) => {
                  const active = intentFilter === key;
                  const info = key === 'all' ? INTENT_META.all : meta[key];
                  const accent = key === 'all' ? colors.tomato : info.color;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => changeIntent(key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles2.chip,
                        {
                          backgroundColor: active ? accent : colors.surface,
                          borderColor: active ? accent : colors.border,
                        },
                      ]}
                    >
                      <Ionicons name={info.icon} size={14} color={active ? '#fff' : accent} />
                      <Text style={[styles2.chipText, { color: active ? '#fff' : colors.text }]}>{info.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {conversations.length > 0 && (
                <Pressable
                  onPress={confirmClearAll}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all AI history"
                  style={({ pressed }) => [styles2.clearAllBtn, pressed && styles2.pressed]}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                  <Text style={styles2.clearAllText}>Clear history</Text>
                </Pressable>
              )}
            </View>

            {/* Result summary */}
            {!!search.trim() && !loading && (
              <Text style={[styles2.resultNote, { color: colors.textMuted }]}>
                {total} result{total === 1 ? '' : 's'} for "{search.trim()}"
              </Text>
            )}

            {error && (
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
            )}
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
  statTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 11,
    paddingHorizontal: 11,
    alignItems: 'flex-start',
    minWidth: 0,
  },
  statTileCompact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statIconWrap: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  statIconWrapCompact: { marginBottom: 0 },
  statValue: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  statLabel: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    padding: 14,
    marginBottom: 8,
  },
  rowWide: { paddingHorizontal: 16 },
  rowCompact: { paddingHorizontal: 10, paddingVertical: 11 },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  rowPreview: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 6 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  badgeText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.5 },
  rowMetaText: { fontSize: 10.5, fontWeight: '600' },
  rowMetaDot: { fontSize: 10 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 1, marginLeft: 5 },
  iconBtn: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    page: {
      width: '100%',
      maxWidth: 1040,
      alignSelf: 'center',
      paddingTop: SPACING.md,
      paddingBottom: 120,
    },
    pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
    hero: {
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? 14 : isWide ? 22 : 18,
      marginBottom: 12,
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: compact ? 9 : 12 },
    heroBadge: {
      width: compact ? 40 : 48,
      height: compact ? 40 : 48,
      borderRadius: compact ? 13 : 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      flexShrink: 0,
    },
    heroCopy: { flex: 1, minWidth: 0 },
    heroEyebrow: {
      color: colors.violet,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.9,
      marginBottom: 2,
    },
    heroTitle: {
      color: colors.text,
      fontSize: compact ? 19 : isWide ? 27 : 23,
      lineHeight: compact ? 24 : isWide ? 33 : 29,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    heroSubtitle: {
      color: colors.textMuted,
      fontSize: compact ? 11.5 : 12.5,
      lineHeight: 18,
      marginTop: 3,
      maxWidth: 560,
    },
    newChatBtn: {
      height: compact ? 40 : 43,
      minWidth: compact ? 40 : 104,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 13,
      paddingHorizontal: compact ? 10 : 14,
      backgroundColor: colors.tomato,
      flexShrink: 0,
      shadowColor: colors.tomato,
      shadowOpacity: 0.22,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    newChatText: { color: '#fff', fontSize: 12, fontWeight: '900' },
    statRow: { flexDirection: 'row', gap: compact ? 6 : 9, marginTop: compact ? 14 : 18 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 10,
    },
    searchIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.violetSoft,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: compact ? 12.5 : 14,
      paddingVertical: 10,
      minWidth: 0,
    },
    clearSearchBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    controlsRow: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'stretch',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 12,
    },
    filterRow: { flexDirection: 'row', alignItems: 'center', gap: compact ? 5 : 7, flexWrap: 'wrap' },
    chip: {
      flex: compact ? 1 : undefined,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: compact ? 8 : 12,
      paddingVertical: 8,
      minWidth: compact ? 0 : 72,
    },
    chipText: { fontSize: compact ? 10.5 : 12, fontWeight: '800' },
    clearAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      alignSelf: isWide ? 'auto' : 'flex-end',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    clearAllText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
    resultNote: { fontSize: 11.5, fontWeight: '600', marginBottom: 10 },
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
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 9 },
    sectionTitle: { fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
    sectionRule: { flex: 1, height: 1 },
    sectionCount: { fontSize: 11, fontWeight: '700' },
    emptyWrap: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      paddingVertical: 42,
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
