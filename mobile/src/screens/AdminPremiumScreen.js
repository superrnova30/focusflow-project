import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  Alert,
  Platform,
  useWindowDimensions,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

const GOLD = "#FFC15E";
const isWeb = Platform.OS === "web";

// The requested admin view: Student Name | Account | Plan | Status
export default function AdminPremiumScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 420;
  const isWide = width >= 900;
  const styles = useMemo(() => createStyles(colors, isWide, isCompact), [colors, isWide, isCompact]);

  const [subscribers, setSubscribers] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | premium | basic
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const confirmAction = ({ title, message, confirmText = "Confirm", destructive = false, onConfirm }) => {
    if (!isWeb) {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        { text: confirmText, style: destructive ? "destructive" : "default", onPress: onConfirm },
      ]);
      return;
    }
    setDialog({
      title,
      message,
      buttons: [
        { text: "Cancel", style: "cancel", onPress: () => {} },
        { text: confirmText, style: destructive ? "destructive" : "default", onPress: onConfirm },
      ],
    });
  };

  const showInfo = (title, message) => {
    if (!isWeb) {
      Alert.alert(title, message);
      return;
    }
    setDialog({ title, message, buttons: [{ text: "OK", style: "default", onPress: () => {} }] });
  };

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const params = [];
      if (debouncedSearch.trim()) params.push(`search=${encodeURIComponent(debouncedSearch.trim())}`);
      if (filter !== "all") params.push(`status=${filter}`);
      const qs = params.join("&");
      const { data } = await client.get(`/admin/premium/subscribers${qs ? `?${qs}` : ""}`);
      setSubscribers(data.subscribers || []);
      setStats(data.stats || null);
    } catch (e) {
      showInfo("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter]);

  useFocusEffect(
    useCallback(() => {
      fetchSubscribers();
    }, [fetchSubscribers])
  );

  const changePlan = (student, action) => {
    const granting = action === "grant";
    confirmAction({
      title: granting ? "Grant Go Unlimited?" : "Revoke Go Unlimited?",
      message: granting
        ? `${student.name} will get a 30-day Go Unlimited subscription.`
        : `${student.name} will immediately lose Unlimited access.`,
      confirmText: granting ? "Grant" : "Revoke",
      destructive: !granting,
      onConfirm: async () => {
        setBusyId(student.id);
        try {
          await client.post(`/admin/premium/subscribers/${student.id}`, { action });
          await fetchSubscribers();
          showInfo(
            granting ? "Subscription granted" : "Subscription revoked",
            `${student.name} is now on ${granting ? "Go Unlimited" : "Basic"}.`
          );
        } catch (e) {
          showInfo("Error", e.message);
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  const planBadge = (item) => {
    if (item.isPremium) {
      return { label: "Go Unlimited", color: GOLD, background: GOLD + "1F", icon: "star" };
    }
    if (item.status === "Expired" || item.subscriptionStatus === "EXPIRED") {
      return { label: "Expired", color: colors.amber, background: colors.amberSoft, icon: "time-outline" };
    }
    return { label: "Basic plan", color: colors.textMuted, background: colors.bg, icon: null };
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>BILLING</Text>
          <Text style={styles.header}>Subscriptions</Text>
          <Text style={styles.subheader}>Review Go Unlimited members and grant or revoke access.</Text>
        </View>
        {loading && <ActivityIndicator color={colors.violet} />}
      </View>

      {stats && (
        <View style={styles.statRow}>
          {[
            { label: "Premium", value: stats.premium, color: GOLD, icon: "star", soft: colors.amberSoft },
            { label: "Basic", value: stats.basic, color: colors.textMuted, icon: "person-outline", soft: colors.bg },
            { label: "Students", value: stats.totalStudents, color: colors.violet, icon: "people", soft: colors.violetSoft },
          ].map((tile) => (
            <View key={tile.label} style={styles.statTile}>
              <View style={[styles.statIcon, { backgroundColor: tile.soft }]}>
                <Ionicons name={tile.icon} size={15} color={tile.color} />
              </View>
              <Text style={styles.statValue}>{tile.value}</Text>
              <Text style={styles.statLabel}>{tile.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.toolbar}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search subscribers"
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <View style={styles.filterRow}>
          {["all", "premium", "basic"].map((key) => {
            const active = filter === key;
            return (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {key === "all" ? "All" : key === "premium" ? "Go Unlimited" : "Basic"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.resultCount}>
        {subscribers.length} student{subscribers.length === 1 ? "" : "s"}
      </Text>

      <FlatList
        data={subscribers}
        keyExtractor={(u) => u.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={fetchSubscribers}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyCard}>
              <Ionicons name="star-outline" size={24} color={colors.violet} />
              <Text style={styles.emptyTitle}>No matching students</Text>
              <Text style={styles.muted}>Try a different search or plan filter.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const badge = planBadge(item);
          return (
          <View style={styles.rowCard}>
            <View style={styles.rowMain}>
              <View style={styles.nameCell}>
                <View style={styles.nameLine}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.isPremium && (
                    <View style={styles.crownPill}>
                      <Ionicons name="star" size={10} color={GOLD} />
                    </View>
                  )}
                </View>
                <Text style={styles.account} numberOfLines={1}>
                  {item.email}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.isPremium
                    ? `${item.daysRemaining} day${item.daysRemaining === 1 ? "" : "s"} left`
                    : item.subscriptionStatus === "EXPIRED"
                    ? "Subscription expired"
                    : "No active subscription"}
                  {item.lastPayment ? ` · last ₱${item.lastPayment.amount}` : ""}
                </Text>
              </View>

              <View style={styles.badgeStack}>
                <View style={[styles.planBadge, { borderColor: badge.color, backgroundColor: badge.background }]}>
                  {badge.icon ? <Ionicons name={badge.icon} size={9} color={badge.color} /> : null}
                  <Text style={[styles.planText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              {item.isPremium ? (
                <Pressable
                  onPress={() => changePlan(item, "revoke")}
                  disabled={busyId === item.id}
                  style={({ pressed }) => [styles.actionBtn, styles.revokeBtn, pressed && styles.pressed]}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={colors.tomato} />
                  ) : (
                    <Text style={[styles.actionText, { color: colors.tomato }]}>Revoke</Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => changePlan(item, "grant")}
                  disabled={busyId === item.id}
                  style={({ pressed }) => [styles.actionBtn, styles.grantBtn, pressed && styles.pressed]}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={colors.mint} />
                  ) : (
                    <Text style={[styles.actionText, { color: colors.mint }]}>Grant 30 days</Text>
                  )}
                </Pressable>
              )}
              <Pressable
                onPress={() => setSelected(item)}
                style={({ pressed }) => [styles.actionBtn, styles.detailsBtn, pressed && styles.pressed]}
              >
                <Text style={[styles.actionText, { color: colors.violet }]}>Details</Text>
              </Pressable>
            </View>
          </View>
          );
        }}
      />

      {/* Details modal */}
      <Modal transparent visible={!!selected} animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
          <Pressable onPress={() => {}} style={styles.pressBlock}>
            <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{selected?.name}</Text>
              <Text style={[styles.sheetSub, { color: colors.textMuted }]}>{selected?.email}</Text>

              {[
                ["Account", selected?.accountStatus],
                ["Plan", selected?.isPremium ? "Go Unlimited" : selected?.status === "Expired" ? "Expired" : "Basic"],
                ["Member since", selected?.premiumSince ? new Date(selected.premiumSince).toLocaleDateString() : "—"],
                ["Renews", selected?.premiumUntil ? new Date(selected.premiumUntil).toLocaleDateString() : "—"],
                ["Days remaining", selected?.isPremium ? String(selected.daysRemaining) : "—"],
                ["Last payment", selected?.lastPayment ? `₱${selected.lastPayment.amount} (${selected.lastPayment.method || "—"})` : "—"],
              ].map(([label, value]) => (
                <View key={label} style={[styles.sheetRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>{label}</Text>
                  <Text style={[styles.sheetValue, { color: colors.text }]}>{value || "—"}</Text>
                </View>
              ))}

              <Pressable
                onPress={() => setSelected(null)}
                style={[styles.sheetClose, { backgroundColor: colors.bg, borderColor: colors.border }]}
              >
                <Text style={[styles.sheetCloseText, { color: colors.text }]}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Confirm dialog (web needs a Modal because Alert has no buttons) */}
      <Modal transparent visible={!!dialog} animationType="fade" onRequestClose={() => setDialog(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDialog(null)}>
          <Pressable onPress={() => {}} style={styles.pressBlock}>
            <View style={[styles.confirmSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{dialog?.title}</Text>
              <Text style={[styles.confirmMessage, { color: colors.textMuted }]}>{dialog?.message}</Text>
              <View style={styles.confirmActions}>
                {(dialog?.buttons || []).map((button, index) => {
                  const isCancel = button.style === "cancel";
                  return (
                    <Pressable
                      key={`${button.text}-${index}`}
                      onPress={() => {
                        setDialog(null);
                        if (button.onPress) button.onPress();
                      }}
                      style={[
                        styles.confirmButton,
                        isCancel
                          ? { backgroundColor: colors.bg, borderColor: colors.border }
                          : { backgroundColor: colors.tomato, borderColor: colors.tomato },
                      ]}
                    >
                      <Text style={[styles.confirmButtonText, { color: isCancel ? colors.textMuted : "#fff" }]}>
                        {button.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors, isWide, isCompact) =>
  StyleSheet.create({
    headerRow: { flexDirection: "row", alignItems: "flex-start", marginTop: SPACING.md, marginBottom: 12, gap: 10 },
    eyebrow: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
    header: { color: colors.text, fontSize: isCompact ? 24 : 28, fontWeight: "900", letterSpacing: -0.7 },
    subheader: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3, maxWidth: 520 },
    statRow: { flexDirection: "row", gap: 8, marginBottom: 10, flexShrink: 0 },
    statTile: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: isCompact ? 10 : 12,
    },
    statIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 6 },
    statValue: { color: colors.text, fontSize: isCompact ? 17 : 20, fontWeight: "900" },
    statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 1 },
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
    filterRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: isCompact ? 10 : 12,
      paddingVertical: 6,
      backgroundColor: colors.bg,
    },
    chipActive: { backgroundColor: colors.tomato, borderColor: colors.tomato },
    chipText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    chipTextActive: { color: "#fff" },
    resultCount: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginBottom: 8, paddingHorizontal: 2 },
    list: { flex: 1 },
    listContent: { paddingBottom: 24 },
    emptyCard: { alignItems: "center", paddingVertical: 28, gap: 6 },
    emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
    muted: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
    rowCard: {
      backgroundColor: colors.surface,
      marginBottom: 8,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: isCompact ? 11 : 13,
    },
    rowMain: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    nameCell: { flex: 1, minWidth: 0 },
    nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: { color: colors.text, fontSize: 14.5, fontWeight: "800", flexShrink: 1 },
    crownPill: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: GOLD + "22",
    },
    account: { color: colors.textMuted, fontSize: 11.5, marginTop: 3 },
    badgeStack: { alignItems: "flex-end", gap: 6, flexShrink: 0 },
    planBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    planText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.2 },
    statusBadge: {
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    statusText: { fontSize: 9.5, fontWeight: "800" },
    meta: { color: colors.textMuted, fontSize: 10.5, fontWeight: "600", marginTop: 5 },
    actions: { flexDirection: "row", gap: 8, marginTop: 12 },
    actionBtn: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 88,
    },
    grantBtn: { backgroundColor: colors.mintSoft },
    revokeBtn: { backgroundColor: colors.tomatoSoft },
    detailsBtn: { backgroundColor: colors.violetSoft },
    actionText: { fontSize: 11.5, fontWeight: "800" },
    pressed: { opacity: 0.72 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(12, 15, 24, 0.7)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 20,
    },
    pressBlock: { width: "100%", maxWidth: 520 },
    sheet: { borderWidth: 1, borderRadius: 20, padding: 20 },
    sheetTitle: { fontSize: 18, fontWeight: "800" },
    sheetSub: { fontSize: 12.5, marginTop: 3, marginBottom: 12 },
    sheetRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 9,
      borderBottomWidth: 1,
      gap: 12,
    },
    sheetLabel: { fontSize: 12.5 },
    sheetValue: { fontSize: 12.5, fontWeight: "700", flexShrink: 1, textAlign: "right" },
    sheetClose: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: "center",
      marginTop: 16,
    },
    sheetCloseText: { fontSize: 13.5, fontWeight: "700" },
    confirmSheet: { borderWidth: 1, borderRadius: 20, padding: 20 },
    confirmMessage: { fontSize: 13.5, lineHeight: 19, marginTop: 8 },
    confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18, flexWrap: "wrap" },
    confirmButton: {
      flex: 1,
      minWidth: 100,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: "center",
    },
    confirmButtonText: { fontSize: 13.5, fontWeight: "700" },
  });
