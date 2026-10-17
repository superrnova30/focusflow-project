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
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import RefreshButton from "../components/RefreshButton";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";
import { timeAgo } from "../lib/notifications";

const STATUS_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "RESOLVED", label: "Resolved" },
];

const CATEGORY_FILTERS = [
  { key: "ALL", label: "All topics" },
  { key: "ACCOUNT", label: "Account" },
  { key: "SCHOOL_CHANGE", label: "School" },
  { key: "PAYMENTS", label: "Payments" },
  { key: "SHOP_COINS", label: "Coins" },
  { key: "BUG_REPORT", label: "Bugs" },
  { key: "OTHER", label: "Other" },
];

function statusTone(status, colors) {
  if (status === "RESOLVED") return { color: colors.mint, soft: colors.mintSoft, label: "Resolved", icon: "checkmark-circle" };
  if (status === "IN_PROGRESS") return { color: colors.amber, soft: colors.amberSoft, label: "In progress", icon: "time" };
  return { color: colors.tomato, soft: colors.tomatoSoft, label: "Open", icon: "ellipse" };
}

function categoryIcon(category) {
  switch (category) {
    case "ACCOUNT":
      return "person-outline";
    case "SCHOOL_CHANGE":
      return "school-outline";
    case "PAYMENTS":
      return "card-outline";
    case "SHOP_COINS":
      return "diamond-outline";
    case "BUG_REPORT":
      return "bug-outline";
    default:
      return "chatbubble-ellipses-outline";
  }
}

function initials(name) {
  const parts = String(name || "S").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function AdminSupportScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const compact = width < 420;
  const tablet = width >= 640 && width < 900;
  const wide = width >= 900;
  const styles = useMemo(
    () => createStyles(colors, compact, tablet, wide),
    [colors, compact, tablet, wide]
  );
  const canGoBack = navigation.canGoBack?.() ?? false;

  const [tickets, setTickets] = useState([]);
  const [openCount, setOpenCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/admin/support/tickets", {
        params: {
          q: debounced || undefined,
          status: status === "ALL" ? undefined : status,
          category: category === "ALL" ? undefined : category,
        },
      });
      setTickets(data.tickets || []);
      setOpenCount(data.openCount || 0);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load support requests.");
      setTickets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debounced, status, category]);

  useFocusEffect(useCallback(() => { load({ silent: true }); }, [load]));

  const renderItem = ({ item }) => {
    const tone = statusTone(item.status, colors);
    return (
      <Pressable
        onPress={() => navigation.navigate("SupportDetail", { ticketId: item.id })}
        style={({ pressed }) => [styles.ticketCard, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${item.ticketCode} ${item.subject}`}
      >
        <View style={styles.ticketAccent}>
          <View style={[styles.ticketAccentBar, { backgroundColor: tone.color }]} />
        </View>

        <View style={styles.ticketMain}>
          <View style={styles.ticketTop}>
            <View style={[styles.avatar, { backgroundColor: colors.violetSoft }]}>
              <Text style={[styles.avatarText, { color: colors.violet }]}>
                {initials(item.user?.name)}
              </Text>
            </View>

            <View style={styles.ticketIdentity}>
              <View style={styles.ticketCodeRow}>
                <Text style={styles.ticketCode}>{item.ticketCode}</Text>
                <View style={[styles.statusPill, { backgroundColor: tone.soft, borderColor: tone.color + "44" }]}>
                  <Ionicons name={tone.icon} size={10} color={tone.color} />
                  <Text style={[styles.statusText, { color: tone.color }]}>
                    {item.statusLabel || tone.label}
                  </Text>
                </View>
              </View>
              <Text style={styles.studentName} numberOfLines={1}>
                {item.user?.name || "Student"}
                {item.user?.email ? ` · ${item.user.email}` : ""}
              </Text>
            </View>
          </View>

          <Text style={styles.subject} numberOfLines={2}>{item.subject}</Text>

          <View style={styles.ticketFooter}>
            <View style={[styles.categoryChip, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name={categoryIcon(item.category)} size={12} color={colors.textMuted} />
              <Text style={styles.categoryText} numberOfLines={1}>
                {item.categoryLabel || item.category || "Support"}
              </Text>
            </View>
            <View style={styles.footerMeta}>
              {item.replyCount > 0 ? (
                <View style={styles.metaItem}>
                  <Ionicons name="chatbubbles-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.when}>{item.replyCount}</Text>
                </View>
              ) : null}
              <Text style={styles.when}>
                {item.createdAt ? timeAgo(item.createdAt) || new Date(item.createdAt).toLocaleString() : ""}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    load({ silent: true });
  };

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
          <Text style={styles.eyebrow}>ADMIN WORKSPACE</Text>
          <Text style={styles.title}>Support inbox</Text>
          <Text style={styles.subtitle}>
            Triage Contact PomodAI requests, update status, and reply in one place.
          </Text>
        </View>
        <RefreshButton
          refreshing={refreshing}
          onPress={onRefresh}
          color={colors.violet}
          backgroundColor={colors.violetSoft}
          accessibilityLabel="Refresh inbox"
        />
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sectionEyebrow}>AT A GLANCE</Text>
            <Text style={styles.sectionTitle}>Inbox overview</Text>
          </View>
          {openCount > 0 ? (
            <View style={[styles.liveBadge, { backgroundColor: colors.tomatoSoft }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.tomato }]} />
              <Text style={[styles.liveText, { color: colors.tomato }]}>{openCount} open</Text>
            </View>
          ) : (
            <View style={[styles.liveBadge, { backgroundColor: colors.mintSoft }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.mint }]} />
              <Text style={[styles.liveText, { color: colors.mint }]}>Caught up</Text>
            </View>
          )}
        </View>
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryItem, styles.summaryItemBorder]}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.tomatoSoft }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.tomato} />
            </View>
            <Text style={styles.summaryValue}>{openCount}</Text>
            <Text style={styles.summaryLabel}>Open now</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemBorder]}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name="layers-outline" size={16} color={colors.violet} />
            </View>
            <Text style={styles.summaryValue}>{tickets.length}</Text>
            <Text style={styles.summaryLabel}>In this view</Text>
          </View>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.mintSoft }]}>
              <Ionicons name="chatbubbles-outline" size={16} color={colors.mint} />
            </View>
            <Text style={[styles.summaryValue, { fontSize: compact ? 13 : 15 }]}>Reply</Text>
            <Text style={styles.summaryLabel}>In-thread</Text>
          </View>
        </View>
      </View>

      <View style={styles.filtersCard}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search ticket, name, email, subject…"
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

        <Text style={styles.filterLabel}>Status</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
          style={styles.chipScrollWrap}
        >
          {STATUS_FILTERS.map((item) => {
            const on = status === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setStatus(item.key)}
                style={[
                  styles.chip,
                  on && { backgroundColor: colors.violetSoft, borderColor: colors.violet },
                ]}
              >
                <Text style={[styles.chipText, on && { color: colors.violet }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.filterLabel}>Topic</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
          style={styles.chipScrollWrap}
        >
          {CATEGORY_FILTERS.map((item) => {
            const on = category === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setCategory(item.key)}
                style={[
                  styles.chip,
                  on && { backgroundColor: colors.mintSoft, borderColor: colors.mint },
                ]}
              >
                <Text style={[styles.chipText, on && { color: colors.mint }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.violet} />
          <Text style={styles.emptyBody}>Loading requests…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.tomatoSoft }]}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.tomato} />
          </View>
          <Text style={styles.emptyTitle}>Inbox unavailable</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={wide || tablet ? 2 : 1}
          key={wide || tablet ? "support-grid" : "support-list"}
          columnWrapperStyle={wide || tablet ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.violet}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.violetSoft }]}>
                <Ionicons name="mail-open-outline" size={26} color={colors.violet} />
              </View>
              <Text style={styles.emptyTitle}>No support requests</Text>
              <Text style={styles.emptyBody}>
                New Contact PomodAI messages will appear here for triage and reply.
              </Text>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const createStyles = (colors, compact, tablet, wide) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: SPACING.sm + 2,
      marginBottom: SPACING.md + 2,
    },
    backBtn: {
      width: 43,
      height: 43,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 2,
    },
    eyebrow: {
      color: colors.violet,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1,
      marginBottom: 3,
    },
    title: {
      color: colors.text,
      fontSize: compact ? 22 : tablet ? 26 : 28,
      fontWeight: "900",
      letterSpacing: -0.6,
      lineHeight: compact ? 28 : 34,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 12.5,
      marginTop: 4,
      fontWeight: "500",
      lineHeight: 18,
      maxWidth: 560,
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? 13 : 16,
      marginBottom: 12,
    },
    summaryHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 14,
    },
    sectionEyebrow: {
      color: colors.violet,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    sectionTitle: { color: colors.text, fontSize: compact ? 15 : 17, fontWeight: "900" },
    liveBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: RADIUS.pill,
      paddingVertical: 6,
      paddingHorizontal: 9,
      flexShrink: 0,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3 },
    liveText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.2 },
    summaryGrid: { flexDirection: "row", alignItems: "stretch" },
    summaryItem: {
      flex: 1,
      alignItems: "flex-start",
      paddingHorizontal: 4,
      minWidth: 0,
    },
    summaryItemBorder: {
      borderRightWidth: 1,
      borderRightColor: colors.border,
      marginRight: 8,
      paddingRight: 10,
    },
    summaryIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    summaryValue: { color: colors.text, fontSize: compact ? 17 : 20, fontWeight: "900" },
    summaryLabel: { color: colors.textMuted, fontSize: compact ? 9.5 : 10.5, fontWeight: "700", marginTop: 2 },
    filtersCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? 12 : 14,
      marginBottom: 10,
    },
    searchField: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 12,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "500", padding: 0 },
    filterLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginBottom: 7,
      marginTop: 2,
    },
    chipScrollWrap: { maxHeight: 40, marginBottom: 10 },
    chipScroll: { flexDirection: "row", gap: 8, paddingRight: 8 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    list: { paddingTop: 6, paddingBottom: 36, gap: 10 },
    columnWrapper: { gap: 10 },
    ticketCard: {
      flex: wide || tablet ? 1 : undefined,
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      overflow: "hidden",
      minWidth: 0,
    },
    ticketAccent: { width: 4, paddingVertical: 0 },
    ticketAccentBar: { flex: 1, width: 4 },
    ticketMain: { flex: 1, padding: compact ? 12 : 14, minWidth: 0 },
    ticketTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    avatarText: { fontSize: 12.5, fontWeight: "900" },
    ticketIdentity: { flex: 1, minWidth: 0 },
    ticketCodeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    ticketCode: { color: colors.violet, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.2 },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
      flexShrink: 0,
    },
    statusText: { fontSize: 10.5, fontWeight: "800" },
    studentName: { color: colors.textMuted, fontSize: 11.5, marginTop: 3, fontWeight: "600" },
    subject: {
      color: colors.text,
      fontSize: compact ? 14 : 15,
      fontWeight: "800",
      marginTop: 10,
      lineHeight: 21,
    },
    ticketFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginTop: 12,
    },
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
      maxWidth: "58%",
    },
    categoryText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    footerMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
    when: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
    center: { alignItems: "center", paddingVertical: 48, gap: 8, paddingHorizontal: 24 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
    emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
    emptyBody: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18 },
    retryBtn: {
      marginTop: 8,
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
    pressed: { opacity: 0.88 },
  });
