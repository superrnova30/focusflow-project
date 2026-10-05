import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, Modal, Animated, Platform, useWindowDimensions, TextInput, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import UserAvatar from "../components/UserAvatar";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

const roleColors = (colors) => ({
  ADMIN: colors.tomato,
  STUDENT: colors.mint,
});

const GOLD = "#FFC15E";
const GOLD_DEEP = "#E8A020";

// react-native-web ships a no-op Alert (no buttons/onPress), so confirmation and
// informational dialogs must be rendered as a Modal on web to keep the admin
// actions (disable, reset password, delete) working across every platform.
const isWeb = Platform.OS === "web";

export default function AdminUsersScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const isWide = width >= 900;
  const styles = useMemo(() => createStyles(colors, isWide, isCompact), [colors, isWide, isCompact]);
  const rc = roleColors(colors);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("STUDENT");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const formTranslateY = useRef(new Animated.Value(30)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;

  // Cross-platform dialogs. On native we reuse the system Alert; on web we show
  // a Modal so the confirm/info callbacks actually fire.
  const [dialog, setDialog] = useState(null);

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

  const showInfo = (title, message, onClose) => {
    if (!isWeb) {
      Alert.alert(title, message);
      if (onClose) onClose();
      return;
    }
    setDialog({ title, message, buttons: [{ text: "OK", style: "default", onPress: onClose }] });
  };

  const closeDialog = () => setDialog(null);

  const runDialogButton = (button) => {
    setDialog(null);
    if (button && typeof button.onPress === "function") {
      const result = button.onPress();
      if (result && typeof result.then === "function") result.catch(() => {});
    }
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(formOpacity, {
        toValue: showCreateUser ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(formTranslateY, {
        toValue: showCreateUser ? 0 : 30,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [showCreateUser, formOpacity, formTranslateY]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = [];
      if (debouncedSearch.trim()) params.push(`search=${encodeURIComponent(debouncedSearch.trim())}`);
      if (roleFilter !== "ALL") params.push(`role=${roleFilter}`);
      if (statusFilter !== "ALL") params.push(`status=${statusFilter}`);
      const q = params.length ? `?${params.join("&")}` : "";
      const { data } = await client.get(`/admin/users${q}`);
      setUsers(data.users);
    } catch (e) {
      showInfo("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, roleFilter, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [fetchUsers])
  );

  const createUser = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword) {
      showInfo("Fill all fields", "Name, email, and password are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      showInfo("Invalid email", "Enter a valid email address.");
      return;
    }
    if (newPassword.length < 8) {
      showInfo("Password too short", "Use at least 8 characters.");
      return;
    }
    setCreating(true);
    try {
      await client.post("/admin/users", {
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
      });
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("STUDENT");
      setShowCreateUser(false);
      await fetchUsers();
      showInfo("Created", "User account created.");
    } catch (e) {
      showInfo("Error", e.message);
    } finally {
      setCreating(false);
    }
  };

  const patchUser = async (user, data) => {
    try {
      await client.patch(`/admin/users/${user.id}`, data);
      await fetchUsers();
    } catch (e) {
      showInfo("Error", e.message);
      throw e;
    }
  };

  const toggleStatus = (user) => {
    const disabling = user.status === "ACTIVE";
    confirmAction({
      title: disabling ? "Disable account?" : "Enable account?",
      message: `${user.name} will be ${disabling ? "blocked from logging in" : "allowed to log in again"}.`,
      confirmText: disabling ? "Disable" : "Enable",
      destructive: disabling,
      onConfirm: async () => {
        try {
          await patchUser(user, { status: disabling ? "DISABLED" : "ACTIVE" });
          showInfo(
            disabling ? "Account disabled" : "Account enabled",
            `${user.name} has been ${disabling ? "disabled" : "enabled"}.`
          );
        } catch (e) {
          // patchUser already surfaced the error.
        }
      },
    });
  };

  const resetPassword = (user) => {
    if (user.role !== "STUDENT") {
      showInfo("Reset password", "Password reset emails can only be sent to student accounts.");
      return;
    }
    confirmAction({
      title: "Send password reset email?",
      message: `We'll email a verification code to ${user.email}. ${user.name} can use it in Forgot password to create a new password. Their current password stays active until they finish.`,
      confirmText: "Send email",
      onConfirm: async () => {
        try {
          const { data } = await client.post(`/admin/users/${user.id}/reset-password`);
          showInfo("Reset email sent", data.message || `A password reset email was sent to ${user.email}.`);
        } catch (e) {
          showInfo("Error", e.message);
        }
      },
    });
  };

  const removeUser = (user) => {
    confirmAction({
      title: "Delete user?",
      message: `Delete ${user.name}? This cannot be undone.`,
      confirmText: "Delete",
      destructive: true,
      onConfirm: async () => {
        try {
          await client.delete(`/admin/users/${user.id}`);
          await fetchUsers();
        } catch (e) {
          showInfo("Error", e.message);
        }
      },
    });
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>USER MANAGEMENT</Text>
          <Text style={styles.header}>Users</Text>
          <Text style={styles.headerSubtitle}>Review accounts, update access, and open student profiles.</Text>
        </View>
        <Pressable
          onPress={() => setShowCreateUser(true)}
          accessibilityRole="button"
          accessibilityLabel="Create user"
          style={({ pressed }) => [styles.headerButton, styles.primaryButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={18} color="#fff" />
          {!isCompact && <Text style={styles.headerButtonText}>Create user</Text>}
        </Pressable>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, email, student ID, or course"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search users"
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.filters}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>ROLE</Text>
            <View style={styles.filterChips}>
              {["ALL", "STUDENT", "ADMIN"].map((role) => (
                <Pressable
                  key={role}
                  onPress={() => setRoleFilter(role)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: roleFilter === role }}
                  style={[styles.filterChip, roleFilter === role && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, roleFilter === role && styles.filterChipTextActive]}>
                    {role === "ALL" ? "All" : role === "STUDENT" ? "Students" : "Admins"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>STATUS</Text>
            <View style={styles.filterChips}>
              {["ALL", "ACTIVE", "DISABLED"].map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setStatusFilter(status)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: statusFilter === status }}
                  style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, statusFilter === status && styles.filterChipTextActive]}>
                    {status === "ALL" ? "All" : status === "ACTIVE" ? "Active" : "Disabled"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.resultRow}>
        <Text style={styles.resultCount}>{users.length} account{users.length === 1 ? "" : "s"}</Text>
        {(roleFilter !== "ALL" || statusFilter !== "ALL" || search) && (
          <Pressable
            onPress={() => { setSearch(""); setRoleFilter("ALL"); setStatusFilter("ALL"); }}
            style={({ pressed }) => [styles.clearFilters, pressed && styles.pressed]}
          >
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        key={isWide ? "users-grid" : "users-list"}
        data={users}
        keyExtractor={(u) => u.id}
        numColumns={isWide ? 2 : 1}
        columnWrapperStyle={isWide ? styles.columnWrapper : undefined}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={fetchUsers}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyCard}>
              <ActivityIndicator color={colors.violet} />
              <Text style={styles.muted}>Loading accounts…</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={26} color={colors.violet} />
              </View>
              <Text style={styles.emptyTitle}>No matching users</Text>
              <Text style={styles.muted}>Try changing your search or filters.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.userCardWrap}>
          <Card style={styles.userCard}>
            <View style={styles.userRow}>
              <UserAvatar user={item} size={isCompact ? 42 : 48} ringColor={item.premium && item.premium.isPremium ? GOLD : undefined} />

              <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.userName} numberOfLines={1}>{item.name || "Unnamed user"}</Text>
                </View>
                <Text style={styles.userMeta} numberOfLines={1}>{item.email}</Text>
              </View>

              <View
                style={[
                  styles.statusBadge,
                  {
                    borderColor: item.status === "ACTIVE" ? colors.mint : colors.tomato,
                    backgroundColor: item.status === "ACTIVE" ? colors.mintSoft : colors.tomatoSoft,
                  },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: item.status === "ACTIVE" ? colors.mint : colors.tomato }]}>
                  {item.status === "ACTIVE" ? "Active" : "Disabled"}
                </Text>
              </View>
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.roleBadge, { backgroundColor: `${rc[item.role] || colors.textMuted}18` }]}>
                <Text style={[styles.roleBadgeText, { color: rc[item.role] || colors.textMuted }]}>{item.role}</Text>
              </View>
              {item.premium && item.premium.isPremium && (
                <View style={[styles.roleBadge, { backgroundColor: GOLD + "1A" }]}>
                  <Ionicons name="star" size={10} color={GOLD_DEEP} />
                  <Text style={[styles.roleBadgeText, { color: GOLD_DEEP }]}>UNLIMITED</Text>
                </View>
              )}
              {!!item.course && (
                <Text style={styles.courseText} numberOfLines={1}>{item.course}</Text>
              )}
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => navigation.navigate("UserDetail", { user: item, userId: item.id })}
                style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
              >
                <Ionicons name="person-outline" size={15} color={colors.violet} />
                <Text style={styles.profileButtonText}>View profile</Text>
              </Pressable>
              <Pressable
                onPress={() => toggleStatus(item)}
                accessibilityLabel={item.status === "ACTIVE" ? "Disable account" : "Enable account"}
                style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
              >
                <Ionicons name={item.status === "ACTIVE" ? "ban-outline" : "checkmark-circle-outline"} size={17} color={item.status === "ACTIVE" ? colors.tomato : colors.mint} />
              </Pressable>
              <Pressable
                onPress={() => resetPassword(item)}
                accessibilityLabel="Reset password"
                style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
              >
                <Ionicons name="key-outline" size={17} color={colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => removeUser(item)}
                accessibilityLabel="Delete user"
                style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={17} color={colors.tomato} />
              </Pressable>
            </View>
          </Card>
          </View>
        )}
      />

      <Modal transparent visible={showCreateUser} animationType="fade" onRequestClose={() => setShowCreateUser(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowCreateUser(false)}>
          <Pressable onPress={() => {}} style={styles.modalPressBlock}>
            <Animated.View
              style={[
                styles.modalSheet,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: formOpacity,
                  transform: [{ translateY: formTranslateY }],
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Create User</Text>
                <Pressable
                  onPress={() => setShowCreateUser(false)}
                  style={[styles.closeButton, { borderColor: colors.border, backgroundColor: colors.bg }]}
                >
                  <Text style={[styles.closeButtonText, { color: colors.textMuted }]}>Close</Text>
                </Pressable>
              </View>

              <Card style={styles.modalCard}>
                <Text style={styles.sectionLabel}>ROLE</Text>
                <View style={styles.roleRow}>
                  {["STUDENT", "ADMIN"].map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setNewRole(r)}
                      style={[styles.roleChip, newRole === r && styles.roleChipSelected]}
                    >
                      <Text style={[styles.roleChipText, newRole === r && { color: rc[r] }]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.formStack}>
                  <Input value={newName} onChangeText={setNewName} placeholder="Full name" style={{ marginBottom: 12 }} />
                  <Input value={newEmail} onChangeText={setNewEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" style={{ marginBottom: 12 }} />
                  <Input value={newPassword} onChangeText={setNewPassword} placeholder="Password" secureTextEntry style={{ marginBottom: 14 }} />
                </View>

                <Button title="Create user" onPress={createUser} loading={creating} />
              </Card>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={!!dialog}
        animationType="fade"
        onRequestClose={closeDialog}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeDialog}>
          <Pressable onPress={() => {}} style={styles.modalPressBlock}>
            <View
              style={[
                styles.confirmSheet,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {dialog?.title ? (
                <Text style={[styles.confirmTitle, { color: colors.text }]}>{dialog.title}</Text>
              ) : null}
              {dialog?.message ? (
                <Text style={[styles.confirmMessage, { color: colors.textMuted }]}>{dialog.message}</Text>
              ) : null}

              <View style={styles.confirmActions}>
                {(dialog?.buttons || []).map((button, index) => {
                  const isCancel = button.style === "cancel";
                  return (
                    <Pressable
                      key={`${button.text}-${index}`}
                      onPress={() => runDialogButton(button)}
                      style={({ pressed }) => [
                        styles.confirmButton,
                        isCancel
                          ? { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1 }
                          : { backgroundColor: colors.tomato, borderColor: colors.tomato, borderWidth: 1 },
                        { opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.confirmButtonText,
                          { color: isCancel ? colors.textMuted : "#fff" },
                        ]}
                      >
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
    pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginTop: SPACING.md,
      marginBottom: SPACING.lg,
      gap: 12,
    },
    eyebrow: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
    header: {
      color: colors.text,
      fontSize: isCompact ? 25 : 29,
      lineHeight: isCompact ? 31 : 35,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    headerSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3, maxWidth: 520 },
    headerButton: {
      height: 43,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: RADIUS.md,
      paddingHorizontal: isCompact ? 12 : 15,
      flexShrink: 0,
    },
    primaryButton: { backgroundColor: colors.tomato, borderColor: colors.tomato },
    headerButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
    toolbar: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: isCompact ? 10 : 12,
      gap: 11,
    },
    searchField: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: isCompact ? 11.5 : 13,
      minWidth: 0,
    },
    filters: { flexDirection: isWide ? "row" : "column", gap: isWide ? 18 : 10 },
    filterGroup: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    filterLabel: { color: colors.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 0.7, width: isCompact ? 43 : 50 },
    filterChips: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
    filterChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingVertical: 6,
      paddingHorizontal: isCompact ? 8 : 10,
      backgroundColor: colors.bg,
    },
    filterChipActive: { borderColor: colors.violet, backgroundColor: colors.violetSoft },
    filterChipText: { color: colors.textMuted, fontSize: isCompact ? 9.5 : 10.5, fontWeight: "700" },
    filterChipTextActive: { color: colors.violet, fontWeight: "900" },
    resultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36, paddingHorizontal: 2 },
    resultCount: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
    clearFilters: { paddingVertical: 7, paddingHorizontal: 5 },
    clearFiltersText: { color: colors.violet, fontSize: 10.5, fontWeight: "800" },
    createCard: { marginBottom: 10 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 10 },
    roleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    formStack: { width: "100%" },
    roleChip: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: "center",
    },
    roleChipSelected: { borderColor: colors.violet, backgroundColor: colors.violetSoft },
    roleChipText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    list: { flex: 1 },
    listContent: { paddingTop: 2, paddingBottom: 24, flexGrow: 1 },
    columnWrapper: { gap: 10, alignItems: "stretch" },
    emptyCard: { flex: 1, minHeight: 210, alignItems: "center", justifyContent: "center", paddingVertical: 30, gap: 7 },
    emptyIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft, marginBottom: 3 },
    emptyTitle: { color: colors.text, fontSize: 14.5, fontWeight: "900" },
    muted: { color: colors.textMuted, fontSize: 11.5, textAlign: "center" },
    userCardWrap: { width: isWide ? "49%" : "100%" },
    userCard: {
      flex: 1,
      marginBottom: 9,
      paddingVertical: isCompact ? 11 : 13,
      paddingHorizontal: isCompact ? 11 : 13,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    userInfo: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    userName: { flex: 1, color: colors.text, fontSize: isCompact ? 13.5 : 14.5, fontWeight: "900" },
    badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 11 },
    roleBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 7,
      paddingVertical: 3,
      alignSelf: "flex-start",
    },
    roleBadgeText: { fontSize: 8.5, fontWeight: "900", letterSpacing: 0.45 },
    courseText: { flex: 1, minWidth: 70, color: colors.textMuted, fontSize: 9.5, fontWeight: "600" },
    statusBadge: {
      borderRadius: RADIUS.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    statusBadgeText: { fontSize: 8.5, fontWeight: "900" },
    userMeta: { color: colors.textMuted, fontSize: 10.5, marginTop: 3 },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    profileButton: {
      flex: 1,
      height: 34,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      backgroundColor: colors.violetSoft,
      borderRadius: RADIUS.md,
    },
    profileButtonText: { color: colors.violet, fontSize: 10.5, fontWeight: "900" },
    iconAction: {
      width: 34,
      height: 34,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(12, 15, 24, 0.7)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 20,
    },
    modalPressBlock: {
      width: "100%",
      maxWidth: 520,
    },
    modalSheet: {
      borderWidth: 1,
      borderRadius: 24,
      padding: 18,
      maxHeight: "82%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.22,
      shadowRadius: 20,
      elevation: 16,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 18, fontWeight: "700" },
    closeButton: {
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 7,
      paddingHorizontal: 12,
      minWidth: 72,
      alignItems: "center",
    },
    closeButtonText: { fontSize: 12, fontWeight: "700" },
    modalCard: {
      marginTop: 12,
      padding: 0,
      backgroundColor: "transparent",
      borderWidth: 0,
      elevation: 0,
      shadowOpacity: 0,
    },
    confirmSheet: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.22,
      shadowRadius: 20,
      elevation: 16,
    },
    confirmTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
    confirmMessage: { fontSize: 13.5, lineHeight: 19, marginTop: 8 },
    confirmActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 18,
    },
    confirmButton: {
      flex: 1,
      minWidth: 100,
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmButtonText: { fontSize: 13.5, fontWeight: "700" },
  });
