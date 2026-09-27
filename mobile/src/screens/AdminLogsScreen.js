import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

const FILTERS = [
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
  if (key.includes("quiz") || key.includes("session") || key.includes("xp") || key.includes("note") || key.includes("upload") || key.includes("challenge") || key.includes("flash") || key.includes("import")) {
    return { icon: "book-outline", color: colors.mint, soft: colors.mintSoft, group: "study" };
  }
  return { icon: "pulse-outline", color: colors.textMuted, soft: colors.bg, group: "all" };
}

function relativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Unknown time";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function metaEntries(meta) {
  if (!meta || typeof meta !== "object") return [];
  return Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 4)
    .map(([key, value]) => ({
      key,
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
}

export default function AdminLogsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = debouncedSearch.trim()
        ? `?search=${encodeURIComponent(debouncedSearch.trim())}`
        : "";
      const { data } = await client.get(`/admin/logs${q}`);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load activity logs.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [fetchLogs])
  );

  const visibleLogs = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((log) => actionMeta(log.action, colors).group === filter);
  }, [logs, filter, colors]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>AUDIT TRAIL</Text>
          <Text style={styles.header}>Activity logs</Text>
          <Text style={styles.subtitle}>Track account, study, and admin events in one place.</Text>
        </View>
        <Pressable
          onPress={fetchLogs}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Refresh activity logs"
          style={({ pressed }) => [styles.refreshBtn, (pressed || loading) && styles.pressed]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.violet} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.violet} />
          )}
        </Pressable>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search action or student name"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search activity logs"
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? (
        <View style={styles.warning}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.tomato} />
          <Text style={styles.warningText}>{error}</Text>
          <Pressable onPress={fetchLogs}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.resultCount}>
        {visibleLogs.length} event{visibleLogs.length === 1 ? "" : "s"}
      </Text>

      <FlatList
        data={visibleLogs}
        keyExtractor={(item) => item.id}
        key={isWide ? "logs-wide" : "logs-list"}
        numColumns={isWide ? 2 : 1}
        columnWrapperStyle={isWide ? styles.columnWrapper : undefined}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={fetchLogs}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.violet} />
              <Text style={styles.emptyText}>Loading activity…</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="document-text-outline" size={24} color={colors.violet} />
              </View>
              <Text style={styles.emptyTitle}>No matching logs</Text>
              <Text style={styles.emptyText}>Try a different search or filter.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const tone = actionMeta(item.action, colors);
          const details = metaEntries(item.meta);
          return (
            <View style={styles.cardWrap}>
              <View style={styles.logCard}>
                <View style={styles.logTop}>
                  <View style={[styles.actionIcon, { backgroundColor: tone.soft }]}>
                    <Ionicons name={tone.icon} size={16} color={tone.color} />
                  </View>
                  <View style={styles.logCopy}>
                    <Text style={styles.logAction} numberOfLines={1}>
                      {formatAction(item.action)}
                    </Text>
                    <Text style={styles.logUser} numberOfLines={1}>
                      {item.user?.name || "Unknown user"}
                      {item.user?.email ? ` · ${item.user.email}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.logTime}>{relativeTime(item.createdAt)}</Text>
                </View>
                {details.length > 0 && (
                  <View style={styles.metaRow}>
                    {details.map((entry) => (
                      <View key={`${item.id}-${entry.key}`} style={styles.metaChip}>
                        <Text style={styles.metaKey}>{entry.key}</Text>
                        <Text style={styles.metaValue} numberOfLines={1}>
                          {entry.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginTop: SPACING.md,
      marginBottom: 12,
    },
    eyebrow: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
    header: {
      color: colors.text,
      fontSize: compact ? 24 : 28,
      lineHeight: compact ? 30 : 34,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3, maxWidth: 520 },
    refreshBtn: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      flexShrink: 0,
    },
    pressed: { opacity: 0.72 },
    toolbar: {
      flexGrow: 0,
      flexShrink: 0,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: 10,
      gap: 8,
      marginBottom: 8,
    },
    searchField: {
      height: 42,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: 11,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 13, minWidth: 0, paddingVertical: 0 },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: compact ? 9 : 11,
      paddingVertical: 6,
      backgroundColor: colors.bg,
    },
    chipActive: { backgroundColor: colors.tomato, borderColor: colors.tomato },
    chipText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    chipTextActive: { color: "#fff" },
    warning: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.tomatoSoft,
      borderRadius: RADIUS.md,
      padding: 10,
      marginBottom: 8,
    },
    warningText: { flex: 1, color: colors.text, fontSize: 11.5 },
    retryText: { color: colors.tomato, fontSize: 11, fontWeight: "900" },
    resultCount: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginBottom: 8, paddingHorizontal: 2 },
    list: { flex: 1 },
    listContent: { paddingBottom: 28, flexGrow: 1 },
    columnWrapper: { gap: 10 },
    cardWrap: { width: isWide ? "49%" : "100%" },
    logCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: compact ? 11 : 13,
      marginBottom: 8,
    },
    logTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    actionIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    logCopy: { flex: 1, minWidth: 0 },
    logAction: { color: colors.text, fontSize: compact ? 13 : 14, fontWeight: "800" },
    logUser: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    logTime: { color: colors.textMuted, fontSize: 10, fontWeight: "700", flexShrink: 0 },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
    metaChip: {
      maxWidth: "100%",
      backgroundColor: colors.bg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    metaKey: { color: colors.textMuted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
    metaValue: { color: colors.text, fontSize: 10.5, fontWeight: "700", maxWidth: 160 },
    emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 36, gap: 7 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      marginBottom: 2,
    },
    emptyTitle: { color: colors.text, fontSize: 14.5, fontWeight: "900" },
    emptyText: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  });
