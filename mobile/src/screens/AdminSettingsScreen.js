import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Pressable,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import UserAvatar from "../components/UserAvatar";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

const THEME_OPTIONS = [
  { key: "light", label: "Light", icon: "sunny-outline" },
  { key: "dark", label: "Dark", icon: "moon-outline" },
  { key: "system", label: "System", icon: "phone-portrait-outline" },
];

export default function AdminSettingsScreen() {
  const { colors, scheme, setScheme } = useTheme();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [allowSignups, setAllowSignups] = useState(true);
  const [defaultDailyGoal, setDefaultDailyGoal] = useState("120");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/admin/system");
      const settings = data.settings || {};
      setMaintenanceMode(!!settings.maintenanceMode);
      setAllowSignups(settings.allowSignups !== false);
      setDefaultDailyGoal(String(settings.defaultDailyGoal ?? 120));
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load system settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const save = async () => {
    const goal = Number(defaultDailyGoal);
    if (!Number.isFinite(goal) || goal < 5 || goal > 1440) {
      Alert.alert("Invalid daily goal", "Enter a study goal between 5 and 1440 minutes.");
      return;
    }
    setSaving(true);
    setError("");
    setSavedAt("");
    try {
      await client.patch("/admin/system", {
        maintenanceMode,
        allowSignups,
        defaultDailyGoal: Math.round(goal),
      });
      setSavedAt("Settings saved.");
      if (Platform.OS !== "web") Alert.alert("Saved", "System settings updated.");
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not save settings.");
      if (Platform.OS !== "web") Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const sendBroadcast = async () => {
    const title = broadcastTitle.trim();
    const body = broadcastBody.trim();
    if (!title) {
      Alert.alert("Add a title", "Students need a short heading for the update.");
      return;
    }
    setBroadcasting(true);
    try {
      const { data } = await client.post("/admin/notifications/broadcast", { title, body });
      setBroadcastTitle("");
      setBroadcastBody("");
      setSavedAt(`Update sent to ${data.sent || 0} student${data.sent === 1 ? "" : "s"}.`);
      if (Platform.OS !== "web") Alert.alert("Sent", `Update sent to ${data.sent || 0} students.`);
    } catch (e) {
      Alert.alert("Could not send", e?.response?.data?.error || e.message);
    } finally {
      setBroadcasting(false);
    }
  };

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      const confirmed = typeof window !== "undefined" && window.confirm
        ? window.confirm("Log out of the admin console?")
        : true;
      if (confirmed) logout();
      return;
    }
    Alert.alert("Log out?", "You’ll need to sign in again to manage FocusFlow.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.violet} />
          <Text style={styles.centerText}>Loading settings…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>System settings</Text>
          <Text style={styles.subtitle}>Control who can use FocusFlow and how new student accounts start.</Text>
        </View>

        {error ? (
          <View style={styles.bannerError}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.tomato} />
            <Text style={styles.bannerText}>{error}</Text>
            <Pressable onPress={loadSettings}><Text style={styles.retryText}>Retry</Text></Pressable>
          </View>
        ) : null}
        {!!savedAt && !error ? (
          <View style={styles.bannerOk}>
            <Ionicons name="checkmark-circle" size={18} color={colors.mint} />
            <Text style={styles.bannerText}>{savedAt}</Text>
          </View>
        ) : null}

        <View style={styles.accountRow}>
          <UserAvatar user={user} size={44} />
          <View style={styles.accountCopy}>
            <Text style={styles.accountName} numberOfLines={1}>{user?.name || "Administrator"}</Text>
            <Text style={styles.accountMeta} numberOfLines={1}>
              {[user?.email, user?.role || "ADMIN"].filter(Boolean).join("  ·  ")}
            </Text>
          </View>
          <Pressable
            onPress={confirmLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed]}
          >
            <Ionicons name="log-out-outline" size={17} color={colors.tomato} />
            {!compact && <Text style={styles.logoutText}>Log out</Text>}
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Access</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Maintenance mode</Text>
              <Text style={styles.rowHint}>
                {maintenanceMode
                  ? "Students and staff see a maintenance screen."
                  : "The app is open to signed-in users."}
              </Text>
            </View>
            <Switch
              value={maintenanceMode}
              onValueChange={setMaintenanceMode}
              trackColor={{ false: colors.border, true: colors.tomato }}
            />
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Allow new signups</Text>
              <Text style={styles.rowHint}>Let new students create accounts from the signup page.</Text>
            </View>
            <Switch
              value={allowSignups}
              onValueChange={setAllowSignups}
              trackColor={{ false: colors.border, true: colors.mint }}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Study default</Text>
        <View style={styles.group}>
          <View style={styles.goalBlock}>
            <Text style={styles.rowTitle}>Daily goal for new students</Text>
            <Text style={styles.rowHint}>Applied when a student account is created. Range: 5–1440 minutes.</Text>
            <View style={styles.goalField}>
              <TextInput
                value={defaultDailyGoal}
                onChangeText={setDefaultDailyGoal}
                keyboardType="number-pad"
                placeholder="120"
                placeholderTextColor={colors.textMuted}
                style={styles.goalInput}
                accessibilityLabel="Default daily goal in minutes"
              />
              <Text style={styles.goalSuffix}>min</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.group}>
          <View style={styles.themeTrack}>
            {THEME_OPTIONS.map((option) => {
              const selected = scheme === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setScheme(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.themeOption, selected && styles.themeOptionSelected]}
                >
                  <Ionicons name={option.icon} size={15} color={selected ? colors.violet : colors.textMuted} />
                  <Text style={[styles.themeOptionText, selected && styles.themeOptionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Student updates</Text>
        <View style={styles.group}>
          <View style={styles.goalBlock}>
            <Text style={styles.rowTitle}>Send a notification</Text>
            <Text style={styles.rowHint}>This appears in every student’s notification list.</Text>
            <TextInput
              value={broadcastTitle}
              onChangeText={setBroadcastTitle}
              placeholder="Title"
              placeholderTextColor={colors.textMuted}
              maxLength={80}
              style={styles.broadcastInput}
              accessibilityLabel="Notification title"
            />
            <TextInput
              value={broadcastBody}
              onChangeText={setBroadcastBody}
              placeholder="Short message"
              placeholderTextColor={colors.textMuted}
              maxLength={240}
              multiline
              style={[styles.broadcastInput, styles.broadcastBody]}
              accessibilityLabel="Notification message"
            />
            <Pressable
              onPress={sendBroadcast}
              disabled={broadcasting}
              style={({ pressed }) => [styles.broadcastBtn, (pressed || broadcasting) && styles.pressed]}
            >
              {broadcasting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Send to students</Text>
              )}
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save settings"
          style={({ pressed }) => [styles.saveBtn, (pressed || saving) && styles.pressed]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    page: {
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
      paddingTop: SPACING.md,
      paddingBottom: 48,
    },
    pressed: { opacity: 0.72 },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    centerText: { color: colors.textMuted, fontSize: 13 },
    header: { marginBottom: 18 },
    title: {
      color: colors.text,
      fontSize: compact ? 24 : 28,
      lineHeight: compact ? 30 : 34,
      fontWeight: "900",
      letterSpacing: -0.6,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
    },
    bannerError: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.tomatoSoft,
      borderRadius: RADIUS.md,
      padding: 11,
      marginBottom: 12,
    },
    bannerOk: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.mintSoft,
      borderRadius: RADIUS.md,
      padding: 11,
      marginBottom: 12,
    },
    bannerText: { flex: 1, color: colors.text, fontSize: 12 },
    retryText: { color: colors.tomato, fontSize: 11, fontWeight: "900" },
    accountRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: compact ? 12 : 14,
      marginBottom: 22,
    },
    accountCopy: { flex: 1, minWidth: 0 },
    accountName: { color: colors.text, fontSize: 15, fontWeight: "800" },
    accountMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    logoutBtn: {
      height: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: compact ? 9 : 11,
      backgroundColor: colors.bg,
    },
    logoutText: { color: colors.tomato, fontSize: 12, fontWeight: "800" },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginBottom: 8,
      marginLeft: 2,
    },
    group: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      marginBottom: 18,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: compact ? 13 : 15,
      paddingHorizontal: compact ? 13 : 16,
    },
    rowCopy: { flex: 1, minWidth: 0 },
    rowTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
    rowHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
    rowDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: compact ? 13 : 16 },
    goalBlock: { paddingVertical: compact ? 13 : 15, paddingHorizontal: compact ? 13 : 16 },
    goalField: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      marginTop: 12,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
    },
    goalInput: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      minWidth: 0,
      paddingVertical: 0,
    },
    goalSuffix: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    themeTrack: {
      flexDirection: "row",
      gap: 4,
      padding: 6,
    },
    themeOption: {
      flex: 1,
      height: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: RADIUS.md,
    },
    themeOptionSelected: { backgroundColor: colors.violetSoft },
    themeOptionText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    themeOptionTextSelected: { color: colors.violet },
    saveBtn: {
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.md,
      marginTop: 4,
    },
    saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    broadcastInput: {
      marginTop: 10,
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    broadcastBody: { minHeight: 76, textAlignVertical: "top" },
    broadcastBtn: {
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violet,
      borderRadius: RADIUS.md,
      marginTop: 12,
    },
  });
