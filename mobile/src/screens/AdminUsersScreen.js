import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from "react-native";
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
      <Text style={styles.header}>Users</Text>

      <Card style={{ marginBottom: 14 }}>
        <Text style={styles.sectionLabel}>CREATE USER</Text>
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
        <Input value={newName} onChangeText={setNewName} placeholder="Full name" />
        <Input value={newEmail} onChangeText={setNewEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
        <Input value={newPassword} onChangeText={setNewPassword} placeholder="Password" secureTextEntry />
        <Button title="Create user" onPress={createUser} loading={creating} />
      </Card>

      <Input value={search} onChangeText={setSearch} placeholder="Search users..." />

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        style={{ marginTop: 8 }}
        refreshing={loading}
        onRefresh={fetchUsers}
        ListEmptyComponent={!loading && <Text style={styles.muted}>No users found.</Text>}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 8 }}>
            <View style={styles.userRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.userName}>{item.name}</Text>
<Text style={[styles.roleBadge, { color: rc[item.role] || colors.textMuted }]}>{item.role}</Text>
                </View>
                <Text style={styles.userMeta}>{item.email}</Text>
                <Text style={[styles.userMeta, { color: item.status === "ACTIVE" ? colors.mint : colors.tomato }]}>
                  {item.status === "ACTIVE" ? "Active" : "Disabled"}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={() => toggleStatus(item)} style={{ marginRight: 16 }}>
                <Text style={[styles.actionText, { color: item.status === "ACTIVE" ? colors.tomato : colors.mint }]}>
                  {item.status === "ACTIVE" ? "Disable" : "Enable"}
                </Text>
              </Pressable>
              <Pressable onPress={() => resetPassword(item)} style={{ marginRight: 16 }}>
                <Text style={styles.actionText}>Reset pw</Text>
              </Pressable>
              <Pressable onPress={() => removeUser(item)}>
                <Text style={[styles.actionText, { color: colors.tomato }]}>Delete</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700", marginTop: 12, marginBottom: 16 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 10 },
    roleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    roleChip: {
      flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.bg, alignItems: "center",
    },
    roleChipSelected: { borderColor: colors.violet, backgroundColor: colors.violetSoft },
    roleChipText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    muted: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 20 },
    userRow: { flexDirection: "row", alignItems: "center" },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    userName: { color: colors.text, fontSize: 14, fontWeight: "600" },
    roleBadge: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
    userMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
    actions: { flexDirection: "row", marginTop: 10 },
    actionText: { color: colors.tomato, fontSize: 12, fontWeight: "700" },
  });
