import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

import AdminDashboardScreen from "./AdminDashboardScreen";
import AdminUsersScreen from "./AdminUsersScreen";
import AdminContentScreen from "./AdminContentScreen";
import AdminLogsScreen from "./AdminLogsScreen";
import AdminSettingsScreen from "./AdminSettingsScreen";

const Tabs = createBottomTabNavigator();

export default function AdminHomeScreen() {
  const { colors } = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
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
        name="Content"
        component={AdminContentScreen}
        options={{
          tabBarLabel: "Content",
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" color={color} size={size} />,
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
