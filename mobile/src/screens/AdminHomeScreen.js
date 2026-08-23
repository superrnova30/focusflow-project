import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

import AdminDashboardScreen from "./AdminDashboardScreen";
import AdminUsersScreen from "./AdminUsersScreen";
import AdminLogsScreen from "./AdminLogsScreen";
import AdminSettingsScreen from "./AdminSettingsScreen";

const Tabs = createBottomTabNavigator();

function AdminHeader({ title }) {
  const { logout } = useAuth();
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={["top"]} style={[styles.headerSafe, { backgroundColor: colors.bg }]}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Image source={require("../theme/logo.png")} style={styles.logoImg} resizeMode="contain" />
          <Text style={[styles.headerTitle, { color: colors.text }]}>· Admin</Text>
        </View>
        <Pressable
          onPress={logout}
          style={[styles.logoutBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Text style={[styles.logoutText, { color: colors.textMuted }]}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function AdminHomeScreen() {
  const { colors } = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={{
        header: () => <AdminHeader />,
        tabBarActiveTintColor: colors.tomato,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="Overview"
        component={AdminDashboardScreen}
        options={{
          tabBarLabel: "Overview",
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="Users"
        component={AdminUsersScreen}
        options={{
          tabBarLabel: "Users",
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="Logs"
        component={AdminLogsScreen}
        options={{
          tabBarLabel: "Logs",
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="System"
        component={AdminSettingsScreen}
        options={{
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs.Navigator>
  );
}

const styles = StyleSheet.create({
  headerSafe: {},
  headerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  logoImg: { width: 36, height: 36, marginRight: 10 },
  logoutBtn: {
    borderWidth: 1,
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8,
  },
  logoutText: { fontSize: 12, fontWeight: "700" },
});
