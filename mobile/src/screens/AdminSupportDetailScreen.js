import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import RefreshButton from "../components/RefreshButton";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS } from "../theme/theme";
import { formatWhen } from "../lib/notifications";

const STATUSES = [
  { value: "OPEN", label: "Open", icon: "ellipse" },
  { value: "IN_PROGRESS", label: "In progress", icon: "time" },
  { value: "RESOLVED", label: "Resolved", icon: "checkmark-circle" },
];

function statusTone(status, colors) {
  if (status === "RESOLVED") return { color: colors.mint, soft: colors.mintSoft };
  if (status === "IN_PROGRESS") return { color: colors.amber, soft: colors.amberSoft };
  return { color: colors.tomato, soft: colors.tomatoSoft };
}

export default function AdminSupportDetailScreen({ route, navigation }) {
  const ticketId = route?.params?.ticketId;
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 420;
  const wide = width >= 720;
  const styles = useMemo(() => createStyles(colors, compact, wide), [colors, compact, wide]);

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!ticketId) {
      setError("This support request is missing or no longer available.");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await client.get(`/admin/support/tickets/${ticketId}`);
      setTicket(data.ticket);
    } catch (e) {
      setTicket(null);
      setError(e?.response?.data?.error || e.message || "Support request not found.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (status) => {
    if (!ticket || busy) return;
    setBusy(true);
    try {
      const { data } = await client.patch(`/admin/support/tickets/${ticket.id}/status`, { status });
      setTicket((current) => ({ ...current, ...data.ticket, replies: current?.replies || [] }));
    } catch (e) {
      Alert.alert("Update failed", e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!ticket || busy) return;
    const body = reply.trim();
    if (body.length < 2) {
      Alert.alert("Reply required", "Enter a reply message before sending.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await client.post(`/admin/support/tickets/${ticket.id}/replies`, { body });
      setTicket(data.ticket);
      setReply("");
      Alert.alert(
        data.emailDelivered ? "Reply sent" : "Reply saved",
        data.message || (data.emailDelivered ? "Emailed to the student." : "Saved without email delivery.")
      );
    } catch (e) {
      Alert.alert("Reply failed", e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const retryEmail = async () => {
    if (!ticket || busy) return;
    setBusy(true);
    try {
      const { data } = await client.post(`/admin/support/tickets/${ticket.id}/retry-email`);
      setTicket((current) => ({ ...current, ...data.ticket, replies: current?.replies || [] }));
      Alert.alert("Email sent", "Support inbox notification was resent.");
    } catch (e) {
      Alert.alert("Retry failed", e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !ticket) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.violet} />
          <Text style={styles.emptyBody}>Loading request…</Text>
        </View>
      </Screen>
    );
  }

  if (error && !ticket) {
    return (
      <Screen>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Support request</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.tomatoSoft }]}>
            <Ionicons name="alert-circle-outline" size={26} color={colors.tomato} />
          </View>
          <Text style={styles.emptyTitle}>Unavailable</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Pressable
            onPress={() => navigation.navigate("SupportInbox")}
            style={[styles.retryBtn, { backgroundColor: colors.violet }]}
          >
            <Text style={styles.retryBtnText}>Back to inbox</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const tone = statusTone(ticket.status, colors);
  const replies = ticket.replies || [];

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    load({ silent: true });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
          <Text style={styles.eyebrow}>CONTACT POMODAI</Text>
          <Text style={styles.headerTitle}>{ticket.ticketCode}</Text>
          <View style={[styles.headerStatus, { backgroundColor: tone.soft, borderColor: tone.color + "44" }]}>
            <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
            <Text style={[styles.headerStatusText, { color: tone.color }]}>
              {ticket.statusLabel || ticket.status}
            </Text>
          </View>
        </View>
        <RefreshButton
          refreshing={refreshing}
          onPress={onRefresh}
          color={colors.violet}
          backgroundColor={colors.violetSoft}
          size={18}
          accessibilityLabel="Refresh request"
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.violet}
          />
        }
      >
        <View style={styles.heroCard}>
          <Text style={styles.subject}>{ticket.subject}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.metaChip, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} />
              <Text style={styles.metaChipText}>{ticket.categoryLabel || ticket.category}</Text>
            </View>
            {ticket.createdAt ? (
              <View style={[styles.metaChip, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                <Text style={styles.metaChipText}>{formatWhen(ticket.createdAt)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={wide ? styles.columns : null}>
          <View style={wide ? styles.mainCol : null}>
            <Text style={styles.sectionEyebrow}>FROM</Text>
            <View style={styles.block}>
              <View style={styles.fromRow}>
                <View style={[styles.fromAvatar, { backgroundColor: colors.violetSoft }]}>
                  <Ionicons name="person" size={16} color={colors.violet} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.blockValue}>{ticket.user?.name || "Student"}</Text>
                  <Text style={styles.blockMuted}>{ticket.contactEmail}</Text>
                  {ticket.user?.school ? (
                    <Text style={styles.blockMuted}>{ticket.user.school}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            <Text style={styles.sectionEyebrow}>ORIGINAL MESSAGE</Text>
            <View style={styles.block}>
              <Text style={styles.message}>{ticket.message}</Text>
            </View>

            {ticket.emailError && !ticket.emailNotifiedAt ? (
              <View style={[styles.warn, { backgroundColor: colors.amberSoft, borderColor: colors.amber + "55" }]}>
                <View style={styles.warnTop}>
                  <Ionicons name="warning-outline" size={16} color={colors.amber} />
                  <Text style={styles.warnTitle}>Inbox email failed</Text>
                </View>
                <Text style={styles.warnText}>{ticket.emailError}</Text>
                <Pressable onPress={retryEmail} disabled={busy} style={styles.retryLink}>
                  <Ionicons name="mail-outline" size={14} color={colors.violet} />
                  <Text style={[styles.retryLinkText, { color: colors.violet }]}>Retry email</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.sectionRow}>
              <View>
                <Text style={styles.sectionEyebrow}>CONVERSATION</Text>
                <Text style={styles.sectionInline}>Thread</Text>
              </View>
              <Text style={styles.sectionMeta}>
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </Text>
            </View>

            <View style={styles.thread}>
              <View style={[styles.bubble, styles.bubbleStudent]}>
                <View style={styles.bubbleHeader}>
                  <Text style={styles.bubbleAuthor}>{ticket.user?.name || "Student"}</Text>
                  <Text style={styles.bubbleTag}>Original</Text>
                </View>
                <Text style={styles.bubbleBody}>{ticket.message}</Text>
              </View>

              {replies.map((item) => (
                <View key={item.id} style={[styles.bubble, styles.bubbleStaff]}>
                  <View style={styles.bubbleHeader}>
                    <Text style={[styles.bubbleAuthor, { color: colors.violet }]}>
                      {item.author?.name || "Staff"}
                    </Text>
                    {item.createdAt ? (
                      <Text style={styles.bubbleTag}>{formatWhen(item.createdAt)}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.bubbleBody}>{item.body}</Text>
                  {item.emailError && !item.emailSentAt ? (
                    <Text style={[styles.emailFail, { color: colors.tomato }]}>
                      Email failed: {item.emailError}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          <View style={wide ? styles.sideCol : null}>
            <Text style={styles.sectionEyebrow}>WORKFLOW</Text>
            <View style={styles.block}>
              <Text style={styles.sideLabel}>Status</Text>
              <View style={styles.statusRow}>
                {STATUSES.map((item) => {
                  const on = ticket.status === item.value;
                  const itemTone = statusTone(item.value, colors);
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setStatus(item.value)}
                      disabled={busy}
                      style={[
                        styles.statusChip,
                        on && {
                          backgroundColor: itemTone.soft,
                          borderColor: itemTone.color,
                        },
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={12}
                        color={on ? itemTone.color : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.statusChipText,
                          on && { color: itemTone.color },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Text style={styles.sectionEyebrow}>REPLY</Text>
            <View style={styles.block}>
              <Text style={styles.sideLabel}>Message to student</Text>
              <TextInput
                value={reply}
                onChangeText={setReply}
                placeholder="Write an official response…"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                style={styles.replyInput}
              />
              <Pressable
                onPress={sendReply}
                disabled={busy}
                style={({ pressed }) => [styles.sendBtn, (pressed || busy) && styles.pressed]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={15} color="#fff" />
                    <Text style={styles.sendBtnText}>Send reply</Text>
                  </>
                )}
              </Pressable>
              <Text style={styles.replyHint}>
                Replies are saved to the ticket and emailed to the student when delivery is available.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, compact, wide) =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
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
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    headerTitle: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 1 },
    headerStatus: {
      marginTop: 4,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    headerStatusText: { fontSize: 10.5, fontWeight: "800" },
    page: {
      paddingBottom: 44,
      maxWidth: wide ? 980 : undefined,
      width: "100%",
      alignSelf: "center",
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? 14 : 16,
      marginBottom: 14,
    },
    subject: {
      color: colors.text,
      fontSize: compact ? 18 : 21,
      fontWeight: "900",
      lineHeight: 26,
      letterSpacing: -0.2,
    },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    metaChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    metaChipText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    columns: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
    mainCol: { flex: 1.55, minWidth: 0 },
    sideCol: { flex: 1, minWidth: 0 },
    sectionEyebrow: {
      color: colors.violet,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginBottom: 7,
      marginTop: 4,
    },
    block: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    fromRow: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
    fromAvatar: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    blockValue: { color: colors.text, fontSize: 15, fontWeight: "800" },
    blockMuted: { color: colors.textMuted, fontSize: 12.5, marginTop: 2, fontWeight: "500" },
    message: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: "500" },
    warn: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12, gap: 6 },
    warnTop: { flexDirection: "row", alignItems: "center", gap: 7 },
    warnTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
    warnText: { color: colors.text, fontSize: 12.5, fontWeight: "500", lineHeight: 18 },
    retryLink: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 2 },
    retryLinkText: { fontSize: 12.5, fontWeight: "800" },
    sectionInline: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: -2 },
    sectionRow: {
      marginTop: 4,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
    },
    sectionMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginBottom: 2 },
    sideLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 10,
    },
    statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    statusChip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 12,
      paddingHorizontal: 11,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    statusChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
    thread: { gap: 10, marginBottom: 8 },
    bubble: {
      borderRadius: 16,
      padding: 13,
      borderWidth: 1,
    },
    bubbleStudent: {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      marginRight: compact ? 8 : 28,
    },
    bubbleStaff: {
      backgroundColor: colors.violetSoft,
      borderColor: colors.violet + "33",
      marginLeft: compact ? 8 : 28,
    },
    bubbleHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 6,
    },
    bubbleAuthor: { color: colors.textMuted, fontSize: 11.5, fontWeight: "800" },
    bubbleTag: { color: colors.textMuted, fontSize: 10.5, fontWeight: "600" },
    bubbleBody: { color: colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: "500" },
    emailFail: { marginTop: 6, fontSize: 11.5, fontWeight: "600" },
    replyInput: {
      minHeight: 120,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      fontWeight: "500",
      color: colors.text,
      marginBottom: 10,
    },
    sendBtn: {
      minHeight: 46,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.violet,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    sendBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
    replyHint: {
      color: colors.textMuted,
      fontSize: 11.5,
      lineHeight: 16,
      fontWeight: "500",
      marginTop: 10,
    },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
    emptyBody: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18 },
    retryBtn: {
      marginTop: 8,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    retryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
    pressed: { opacity: 0.88 },
  });
