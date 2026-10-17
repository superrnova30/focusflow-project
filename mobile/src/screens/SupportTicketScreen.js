import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import RefreshButton from "../components/RefreshButton";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS } from "../theme/theme";
import { formatWhen } from "../lib/notifications";

function statusTone(status, colors) {
  if (status === "RESOLVED") return { color: colors.mint, soft: colors.mintSoft, label: "Resolved" };
  if (status === "IN_PROGRESS") return { color: colors.amber, soft: colors.amberSoft, label: "In progress" };
  return { color: colors.violet, soft: colors.violetSoft, label: "Open" };
}

export default function SupportTicketScreen({ route, navigation }) {
  const ticketId = route?.params?.ticketId;
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 400;
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!ticketId) {
      setError("This support conversation is missing or no longer available.");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await client.get(`/support/tickets/${ticketId}`);
      setTicket(data.ticket);
    } catch (e) {
      setTicket(null);
      const status = e?.response?.status;
      setError(
        status === 404
          ? "This support request was not found, or it doesn’t belong to your account."
          : e?.response?.data?.error || e.message || "Could not load this conversation."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openContactSupport = () => {
    // Same Study stack — keep Profile tab free of Support screens.
    navigation.navigate("ContactSupport");
  };

  if (loading && !ticket) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.violet} />
          <Text style={styles.emptyBody}>Loading conversation…</Text>
        </View>
      </Screen>
    );
  }

  if (error && !ticket) {
    return (
      <Screen>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Support reply</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.tomatoSoft }]}>
            <Ionicons name="alert-circle-outline" size={26} color={colors.tomato} />
          </View>
          <Text style={styles.emptyTitle}>Unavailable</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Pressable
            onPress={openContactSupport}
            style={[styles.primaryBtn, { backgroundColor: colors.violet }]}
          >
            <Text style={styles.primaryBtnText}>Contact PomodAI</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const tone = statusTone(ticket.status, colors);
  const staffReplies = (ticket.replies || []).filter((row) => row.isStaff);
  const allReplies = ticket.replies || [];

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    load({ silent: true });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
          <Text style={styles.eyebrow}>SUPPORT</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {ticket.ticketCode || route?.params?.ticketCode || "Conversation"}
          </Text>
        </View>
        <RefreshButton
          refreshing={refreshing}
          onPress={onRefresh}
          color={colors.violet}
          backgroundColor={colors.violetSoft}
          size={18}
          accessibilityLabel="Refresh conversation"
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.violet}
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={[styles.statusPill, { backgroundColor: tone.soft, borderColor: tone.color + "44" }]}>
              <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
              <Text style={[styles.statusText, { color: tone.color }]}>
                {ticket.statusLabel || tone.label}
              </Text>
            </View>
            {ticket.categoryLabel ? (
              <View style={[styles.metaChip, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} />
                <Text style={styles.metaChipText}>{ticket.categoryLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.subject}>{ticket.subject}</Text>
          {ticket.createdAt ? (
            <Text style={styles.submitted}>
              Submitted {formatWhen(ticket.createdAt)}
            </Text>
          ) : null}
        </View>

        <Text style={styles.sectionEyebrow}>YOUR REQUEST</Text>
        <View style={styles.block}>
          <View style={styles.bubbleHeader}>
            <Text style={styles.bubbleAuthor}>You</Text>
            {ticket.createdAt ? (
              <Text style={styles.bubbleTime}>{formatWhen(ticket.createdAt)}</Text>
            ) : null}
          </View>
          <Text style={styles.bubbleBody}>{ticket.message}</Text>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionEyebrowInline}>POMODAI REPLIES</Text>
          <Text style={styles.sectionMeta}>
            {staffReplies.length} {staffReplies.length === 1 ? "reply" : "replies"}
          </Text>
        </View>

        {staffReplies.length === 0 ? (
          <View style={[styles.block, styles.emptyReplies]}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textMuted} />
            <Text style={styles.emptyRepliesTitle}>No replies yet</Text>
            <Text style={styles.emptyBody}>
              Our team will respond here and by email when they get to your request.
            </Text>
          </View>
        ) : (
          <View style={styles.thread}>
            {staffReplies.map((item) => (
              <View key={item.id} style={[styles.replyCard, { borderColor: colors.violet + "33" }]}>
                <View style={styles.bubbleHeader}>
                  <View style={styles.staffLabel}>
                    <View style={[styles.staffAvatar, { backgroundColor: colors.violetSoft }]}>
                      <Ionicons name="shield-checkmark" size={14} color={colors.violet} />
                    </View>
                    <Text style={[styles.bubbleAuthor, { color: colors.violet }]}>
                      {item.author?.name || "PomodAI Support"}
                    </Text>
                  </View>
                  {item.createdAt ? (
                    <Text style={styles.bubbleTime}>{formatWhen(item.createdAt)}</Text>
                  ) : null}
                </View>
                <Text style={styles.bubbleBody}>{item.body}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Show non-staff thread entries if any exist later */}
        {allReplies.some((row) => !row.isStaff) ? (
          <>
            <Text style={styles.sectionEyebrow}>YOUR FOLLOW-UPS</Text>
            <View style={styles.thread}>
              {allReplies
                .filter((row) => !row.isStaff)
                .map((item) => (
                  <View key={item.id} style={styles.block}>
                    <View style={styles.bubbleHeader}>
                      <Text style={styles.bubbleAuthor}>You</Text>
                      {item.createdAt ? (
                        <Text style={styles.bubbleTime}>{formatWhen(item.createdAt)}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.bubbleBody}>{item.body}</Text>
                  </View>
                ))}
            </View>
          </>
        ) : null}

        <View style={styles.againCard}>
          <Text style={styles.againTitle}>Need more help?</Text>
          <Text style={styles.againBody}>
            Start a new Contact PomodAI request if this didn’t fully resolve your issue.
          </Text>
          <Pressable
            onPress={openContactSupport}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.violet, opacity: pressed ? 0.88 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Support again"
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Support Again?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    eyebrow: {
      color: colors.violet,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    headerTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "900",
      marginTop: 1,
    },
    page: { paddingBottom: 40 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 24,
    },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
    emptyBody: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
      fontWeight: "500",
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? 14 : 16,
      marginBottom: 14,
    },
    heroTop: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 11, fontWeight: "800" },
    metaChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    metaChipText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    subject: {
      color: colors.text,
      fontSize: compact ? 17 : 19,
      fontWeight: "900",
      lineHeight: 24,
      letterSpacing: -0.2,
    },
    submitted: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 8,
    },
    sectionEyebrow: {
      color: colors.violet,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 2,
    },
    sectionEyebrowInline: {
      color: colors.violet,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
      marginTop: 4,
    },
    sectionMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
    block: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    thread: { gap: 10, marginBottom: 8 },
    replyCard: {
      borderWidth: 1,
      backgroundColor: colors.violetSoft,
      borderRadius: 16,
      padding: 14,
    },
    bubbleHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 8,
    },
    staffLabel: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
    staffAvatar: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    bubbleAuthor: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
    bubbleTime: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
    bubbleBody: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: "500" },
    emptyReplies: { alignItems: "center", gap: 6, paddingVertical: 22 },
    emptyRepliesTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
    againCard: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 16,
      gap: 8,
    },
    againTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
    againBody: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontWeight: "500", marginBottom: 4 },
    primaryBtn: {
      minHeight: 46,
      borderRadius: RADIUS.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 16,
      marginTop: 4,
    },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  });
