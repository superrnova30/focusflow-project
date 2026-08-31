import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, Modal, Animated } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

const roleColors = (colors) => ({
  ADMIN: colors.tomato,
  STUDENT: colors.mint,
});

export default function AdminUsersScreen() {
  const { colors } = useTheme();
  const styles = useStyles(colors);
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
      Alert.alert("Error", e.message);
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
      Alert.alert("Fill all fields", "Name, email, and password are required.");
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
      Alert.alert("Created", "User account created.");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setCreating(false);
    }
  };

  const patchUser = async (user, data) => {
    try {
      await client.patch(`/admin/users/${user.id}`, data);
      await fetchUsers();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const toggleStatus = (user) => {
    Alert.alert(
      user.status === "ACTIVE" ? "Disable account?" : "Enable account?",
      `${user.name} will be ${user.status === "ACTIVE" ? "blocked from logging in" : "allowed to log in again"}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: user.status === "ACTIVE" ? "Disable" : "Enable",
          onPress: () => patchUser(user, { status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
        },
      ]
    );
  };

  const resetPassword = (user) => {
    Alert.alert("Reset password?", `Generate a temporary password for ${user.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        onPress: async () => {
          try {
            const { data } = await client.post(`/admin/users/${user.id}/reset-password`);
            Alert.alert("Temporary password", `Temporary password for ${user.name}: ${data.tempPassword}`);
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const removeUser = (user) => {
    Alert.alert("Delete user?", `Delete ${user.name}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await client.delete(`/admin/users/${user.id}`);
            await fetchUsers();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Users</Text>
        <Pressable
          onPress={() => setShowCreateUser(true)}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: colors.tomato, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={styles.headerButtonText}>Create User</Text>
        </Pressable>
      </View>

      <Input value={search} onChangeText={setSearch} placeholder="Search users..." style={{ marginTop: 12 }} />

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
              <View style={{ flex: 1 }}>
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
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 12,
      marginBottom: 16,
      gap: 12,
    },
    header: { color: colors.text, fontSize: 22, fontWeight: "700" },
    headerButton: {
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 14,
      minWidth: 120,
      alignItems: "center",
    },
    headerButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    createCard: { marginBottom: 14 },
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
    list: { marginTop: 8, flex: 1 },
    listContent: { paddingBottom: 24 },
    emptyCard: { marginTop: 10, alignItems: "center" },
    muted: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 4 },
    userCard: { marginBottom: 8 },
    userRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    userName: { color: colors.text, fontSize: 14, fontWeight: "600" },
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
    },
    statusBadgeText: { fontSize: 9.5, fontWeight: "700" },
    userMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
    actions: { flexDirection: "row", marginTop: 12, flexWrap: "wrap" },
    actionButton: { marginRight: 16, marginBottom: 4 },
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
  });
