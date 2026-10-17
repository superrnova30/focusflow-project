import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { useNotifications } from "../context/NotificationContext";
import client from "../api/client";
import UserAvatar from "../components/UserAvatar";
import {
  formatWhen,
  getNotificationDisplay,
  navigateFromActivityLog,
  navigateFromNotification,
  notificationIcon,
  notificationIsNavigable,
  notificationTypeLabel,
  timeAgo,
} from "../lib/notifications";
import { RADIUS } from "../theme/theme";

const FEED_FILTERS = [
  { key: "all", label: "All" },
  { key: "alerts", label: "Alerts" },
  { key: "activity", label: "Activity" },
];

const ACTIVITY_FILTERS = [
  { key: "all", label: "All" },
  { key: "account", label: "Accounts" },
  { key: "study", label: "Study" },
  { key: "admin", label: "Admin" },
  { key: "billing", label: "Billing" },
];

function formatAction(action) {
  return String(action || "activity")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionMeta(action, colors) {
  const key = String(action || "").toLowerCase();
  if (key.includes("login") || key.includes("verified") || key.includes("password") || key.includes("account")) {
    return { icon: "person-outline", color: colors.violet, soft: colors.violetSoft, group: "account" };
  }
  if (key.startsWith("admin_") || key.includes("role_change")) {
    return { icon: "shield-checkmark-outline", color: colors.tomato, soft: colors.tomatoSoft, group: "admin" };
  }
  if (key.includes("premium") || key.includes("checkout") || key.includes("payment")) {
    return { icon: "star-outline", color: colors.amber, soft: colors.amberSoft, group: "billing" };
  }
  if (
    key.includes("quiz") ||
    key.includes("session") ||
    key.includes("xp") ||
    key.includes("note") ||
    key.includes("upload") ||
    key.includes("challenge") ||
    key.includes("flash") ||
    key.includes("import")
  ) {
    return { icon: "book-outline", color: colors.mint, soft: colors.mintSoft, group: "study" };
  }
  return { icon: "pulse-outline", color: colors.textMuted, soft: colors.bg, group: "all" };
}

function metaEntries(meta) {
  if (!meta || typeof meta !== "object") return [];
  return Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 3)
    .map(([key, value]) => ({
      key,
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
}

export default function AdminNotificationsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const compact = width < 400;
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const canGoBack = navigation.canGoBack?.() ?? false;

  const {
    items: notifications,
    unreadCount,
    loading: notificationsLoading,
    refresh,
    markRead,
    markAllRead,
  } = useNotifications();

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [feedFilter, setFeedFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError("");
    try {
      const { data } = await client.get("/admin/logs");
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) {
      setLogsError(e?.response?.data?.error || e.message || "Could not load activity logs.");
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([refresh().catch(() => null), fetchLogs()]);
  }, [refresh, fetchLogs]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const feed = useMemo(() => {
    const alertItems = (notifications || []).map((item) => ({
      kind: "alert",
      id: `alert:${item.id}`,
      sortAt: item.createdAt,
      notification: item,
    }));

    const activityItems = (logs || []).map((log) => ({
      kind: "activity",
      id: `activity:${log.id}`,
      sortAt: log.createdAt,
      log,
      group: actionMeta(log.action, colors).group,
    }));

    let rows = [];
    if (feedFilter === "alerts") rows = alertItems;
    else if (feedFilter === "activity") rows = activityItems;
    else rows = [...alertItems, ...activityItems];

    if (feedFilter !== "alerts" && activityFilter !== "all") {
      rows = rows.filter((row) => row.kind !== "activity" || row.group === activityFilter);
    }

    if (debounced) {
      rows = rows.filter((row) => {
        if (row.kind === "alert") {
          const n = row.notification;
          const hay = `${n.title || ""} ${n.body || ""} ${n.type || ""} ${n.actor?.name || ""}`.toLowerCase();
          return hay.includes(debounced);
        }
        const log = row.log;
        const hay = `${log.action || ""} ${log.user?.name || ""} ${log.user?.email || ""}`.toLowerCase();
        return hay.includes(debounced);
      });
    }

    return rows.sort((a, b) => new Date(b.sortAt || 0) - new Date(a.sortAt || 0));
  }, [notifications, logs, feedFilter, activityFilter, debounced, colors]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const handlePress = async (row) => {
    if (row.kind === "alert") {
      const item = row.notification;
      if (item?.unread) await markRead(item.id);
      if (!navigateFromNotification(item) && !notificationIsNavigable(item)) {
        // Expand-only items stay here; nothing else to do.
      }
      return;
    }
    navigateFromActivityLog(row.log);
  };

  const renderAlert = (item) => {
    const icon = notificationIcon(item.type);
    const display = getNotificationDisplay(item);
    const actionable = notificationIsNavigable(item);
    return (
      <Pressable
        onPress={() => handlePress({ kind: "alert", notification: item })}
        style={({ pressed }) => [
          styles.card,
          item.unread && styles.cardUnread,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={display.accessibilityLabel || item.title}
      >
        {item.unread ? <View style={[styles.unreadBar, { backgroundColor: colors.tomato }]} /> : null}
        <View style={styles.cardInner}>
          <View style={styles.media}>
            {item.actor ? (
              <UserAvatar user={item.actor} size={compact ? 38 : 40} />
            ) : (
              <View style={[styles.iconWrap, { backgroundColor: `${icon.color}18` }]}>
                <Ionicons name={icon.name} size={17} color={icon.color} />
              </View>
            )}
          </View>
          <View style={styles.copy}>
            <View style={styles.cardTop}>
              <Text style={[styles.badge, { color: colors.violet, backgroundColor: colors.violetSoft }]}>
                {notificationTypeLabel(item.type)}
              </Text>
              <Text style={styles.when}>{timeAgo(item.createdAt) || formatWhen(item.createdAt)}</Text>
            </View>
            <Text style={[styles.title, item.unread && styles.titleUnread]} numberOfLines={2}>
              {display.mode === "actor" ? (
                <>
                  <Text style={styles.name}>{display.name}</Text>
                  <Text>{` ${display.activity}`}</Text>
                </>
              ) : (
                display.title || item.title
              )}
            </Text>
            {item.body ? (
              <Text style={styles.body} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
          </View>
          {actionable ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
        </View>
      </Pressable>
    );
  };

  const renderActivity = (log) => {
    const tone = actionMeta(log.action, colors);
    const details = metaEntries(log.meta);
    return (
      <Pressable
        onPress={() => handlePress({ kind: "activity", log })}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${formatAction(log.action)} for ${log.user?.name || "user"}`}
      >
        <View style={styles.cardInner}>
          <View style={[styles.iconWrap, { backgroundColor: tone.soft }]}>
            <Ionicons name={tone.icon} size={17} color={tone.color} />
          </View>
          <View style={styles.copy}>
            <View style={styles.cardTop}>
              <Text style={[styles.badge, { color: tone.color, backgroundColor: tone.soft }]}>Activity</Text>
              <Text style={styles.when}>{timeAgo(log.createdAt)}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {formatAction(log.action)}
            </Text>
            <Text style={styles.body} numberOfLines={1}>
              {log.user?.name || "Unknown user"}
              {log.user?.email ? ` · ${log.user.email}` : ""}
            </Text>
            {details.length ? (
              <View style={styles.metaRow}>
                {details.map((entry) => (
                  <View key={`${log.id}-${entry.key}`} style={styles.metaChip}>
                    <Text style={styles.metaKey}>{entry.key}</Text>
                    <Text style={styles.metaValue} numberOfLines={1}>
                      {entry.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </Pressable>
    );
  };

  const loading = (notificationsLoading || logsLoading) && !refreshing && feed.length === 0;

  return (
    <Screen>
      <View style={styles.header}>
        {canGoBack ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.eyebrow}>ADMIN</Text>
          <Text style={styles.heading}>Notifications</Text>
          <Text style={styles.subtitle}>
            {unreadCount ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}` : "Alerts and activity in one place"}
          </Text>
        </View>
        {unreadCount > 0 ? (
          <Pressable
            onPress={markAllRead}
            style={({ pressed }) => [styles.markBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Mark all alerts as read"
          >
            <Text style={styles.markText}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.searchField}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search alerts or activity…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {FEED_FILTERS.map((item) => {
          const on = feedFilter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFeedFilter(item.key)}
              style={[styles.chip, on && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {feedFilter !== "alerts" ? (
        <View style={styles.filterRow}>
          {ACTIVITY_FILTERS.map((item) => {
            const on = activityFilter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setActivityFilter(item.key)}
                style={[styles.chipSoft, on && styles.chipSoftActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipSoftText, on && styles.chipSoftTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {logsError && feedFilter !== "alerts" ? (
        <View style={styles.warning}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.tomato} />
          <Text style={styles.warningText}>{logsError}</Text>
          <Pressable onPress={fetchLogs}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.violet} />
          <Text style={styles.emptyBody}>Loading feed…</Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.violet} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={26} color={colors.violet} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>
                Support alerts and platform activity will show up in this feed.
              </Text>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === "alert" ? renderAlert(item.notification) : renderActivity(item.log)
          }
        />
      )}
    </Screen>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 2,
    },
    eyebrow: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    heading: { color: colors.text, fontSize: compact ? 22 : 24, fontWeight: "900", marginTop: 2 },
    subtitle: { color: colors.textMuted, fontSize: 13, fontWeight: "500", marginTop: 3 },
    markBtn: {
      backgroundColor: colors.violetSoft,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginTop: 4,
    },
    markText: { color: colors.violet, fontSize: 12, fontWeight: "800" },
    searchField: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "500", padding: 0 },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipActive: { backgroundColor: colors.violetSoft, borderColor: colors.violet },
    chipText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    chipTextActive: { color: colors.violet },
    chipSoft: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    chipSoftActive: { backgroundColor: colors.mintSoft, borderColor: colors.mint },
    chipSoftText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    chipSoftTextActive: { color: colors.mint },
    warning: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.tomatoSoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
    },
    warningText: { flex: 1, color: colors.tomato, fontSize: 12.5, fontWeight: "600" },
    retryText: { color: colors.violet, fontSize: 12.5, fontWeight: "800" },
    list: { paddingTop: 6, paddingBottom: 32, gap: 10 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      overflow: "hidden",
      position: "relative",
    },
    cardUnread: { borderColor: colors.violet + "55" },
    unreadBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
    cardInner: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 12 },
    media: { flexShrink: 0 },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    copy: { flex: 1, minWidth: 0 },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    badge: {
      fontSize: 10,
      fontWeight: "800",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
      overflow: "hidden",
    },
    when: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
    title: { color: colors.text, fontSize: 14.5, fontWeight: "700", marginTop: 5, lineHeight: 20 },
    titleUnread: { fontWeight: "800" },
    name: { fontWeight: "900" },
    body: { color: colors.textMuted, fontSize: 12.5, fontWeight: "500", marginTop: 3, lineHeight: 17 },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
    metaChip: {
      maxWidth: "100%",
      backgroundColor: colors.bg,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    metaKey: { color: colors.textMuted, fontSize: 9.5, fontWeight: "700", textTransform: "uppercase" },
    metaValue: { color: colors.text, fontSize: 11.5, fontWeight: "600", marginTop: 1 },
    center: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      marginBottom: 4,
    },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
    emptyBody: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18 },
    pressed: { opacity: 0.88 },
  });
