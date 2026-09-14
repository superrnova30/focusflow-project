import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, Modal, Animated, Platform, useWindowDimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

const roleColors = (colors) => ({
  ADMIN: colors.tomato,
  STUDENT: colors.mint,
});

// react-native-web ships a no-op Alert (no buttons/onPress), so confirmation and
// informational dialogs must be rendered as a Modal on web to keep the admin
// actions (disable, reset password, delete) working across every platform.
const isWeb = Platform.OS === "web";

export default function AdminUsersScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const styles = useStyles(colors, isCompact);
  const rc = roleColors(colors);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
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
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const { data } = await client.get(`/admin/users${q}`);
      setUsers(data.users);
    } catch (e) {
      showInfo("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [search]);

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
    confirmAction({
      title: "Reset password?",
      message: `Generate a temporary password for ${user.name}?`,
      confirmText: "Reset",
      onConfirm: async () => {
        try {
          const { data } = await client.post(`/admin/users/${user.id}/reset-password`);
          showInfo("Temporary password", `Temporary password for ${user.name}: ${data.tempPassword}`);
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
        <Text style={styles.header}>Users</Text>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowCreateUser(true)}
            style={({ pressed }) => [
              styles.headerButton,
              styles.primaryButton,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={styles.headerButtonText}>Create User</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchField}>
        <Input value={search} onChangeText={setSearch} placeholder="Search users..." compact style={styles.searchInput} />
      </View>

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={fetchUsers}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.muted}>No users found.</Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card style={styles.userCard}>
            <View style={styles.userRow}>
              <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.userName}>{item.name}</Text>
                  <View
                    style={[
                      styles.roleBadge,
                      {
                        borderColor: rc[item.role] || colors.border,
                        backgroundColor: `${rc[item.role] || colors.textMuted}22`,
                      },
                    ]}
                  >
                    <Text style={[styles.roleBadgeText, { color: rc[item.role] || colors.textMuted }]}>{item.role}</Text>
                  </View>
                </View>
                <Text style={styles.userMeta}>{item.email}</Text>
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

            <View style={styles.actions}>
              <Pressable onPress={() => toggleStatus(item)} style={styles.actionButton}>
                <Text style={[styles.actionText, { color: item.status === "ACTIVE" ? colors.tomato : colors.mint }]}>
                  {item.status === "ACTIVE" ? "Disable" : "Enable"}
                </Text>
              </Pressable>
              <Pressable onPress={() => resetPassword(item)} style={styles.actionButton}>
                <Text style={styles.actionText}>Reset pw</Text>
              </Pressable>
              <Pressable onPress={() => removeUser(item)} style={styles.actionButton}>
                <Text style={[styles.actionText, { color: colors.tomato }]}>Delete</Text>
              </Pressable>
            </View>
          </Card>
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

const useStyles = (colors, isCompact) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 16,
      marginBottom: 14,
      gap: 8,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      flexWrap: "wrap",
      gap: 6,
      marginLeft: "auto",
      maxWidth: isCompact ? "100%" : "72%",
    },
    header: {
      color: colors.text,
      fontSize: isCompact ? 22 : 24,
      fontWeight: "800",
      letterSpacing: -0.6,
      marginTop: 0,
    },
    headerButton: {
      borderRadius: 12,
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: isCompact ? 9 : 10,
      minWidth: isCompact ? 78 : 90,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButton: { backgroundColor: colors.tomato, borderColor: colors.tomato },
    headerButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    searchField: { flex: 0, flexGrow: 0, flexShrink: 0 },
    searchInput: {
      marginTop: 0,
      marginBottom: 0,
      height: 40,
    },
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
    list: { marginTop: 28, flex: 1 },
    listContent: { paddingTop: 0, paddingBottom: 18 },
    emptyCard: { marginTop: 0, alignItems: "center", paddingVertical: 14 },
    muted: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
    userCard: {
      marginBottom: 8,
      paddingVertical: isCompact ? 9 : 10,
      paddingHorizontal: isCompact ? 10 : 12,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    userRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    userInfo: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    userName: { color: colors.text, fontSize: 15, fontWeight: "700" },
    roleBadge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      alignSelf: "flex-start",
    },
    roleBadgeText: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.5 },
    statusBadge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      minWidth: isCompact ? 62 : 70,
      alignItems: "center",
      justifyContent: "center",
    },
    statusBadgeText: { fontSize: 9.5, fontWeight: "700" },
    userMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 3 },
    actions: {
      flexDirection: "row",
      marginTop: 10,
      flexWrap: "wrap",
      gap: isCompact ? 10 : 12,
    },
    actionButton: { marginRight: 0, marginBottom: 0 },
    actionText: { color: colors.tomato, fontSize: 12, fontWeight: "700" },
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
