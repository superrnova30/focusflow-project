import React from "react";
import { useWindowDimensions } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

import AdminDashboardScreen from "./AdminDashboardScreen";
import AdminUsersScreen from "./AdminUsersScreen";
import AdminPremiumScreen from "./AdminPremiumScreen";
import AdminUserDetailScreen from "./AdminUserDetailScreen";
import AdminContentScreen from "./AdminContentScreen";
import AdminLogsScreen from "./AdminLogsScreen";
import AdminSettingsScreen from "./AdminSettingsScreen";

const Tabs = createBottomTabNavigator();
const UsersStack = createNativeStackNavigator();

// The Users tab needs its own stack so an admin can push into a student's full
// profile (with a proper back button) without losing the tab bar.
function UsersNavigator() {
  const { colors } = useTheme();
  return (
    <UsersStack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, fontWeight: "700", fontSize: 17 },
        headerTintColor: colors.tomato,
        headerShadowVisible: false,
      }}
    >
      <UsersStack.Screen name="UsersList" component={AdminUsersScreen} />
      <UsersStack.Screen
        name="UserDetail"
        component={AdminUserDetailScreen}
        options={{ headerShown: true, title: "Student Profile" }}
      />
    </UsersStack.Navigator>
  );
}

export default function AdminHomeScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const showTabLabels = width >= 430;
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tomato,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: showTabLabels,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: showTabLabels ? 66 : 58,
          paddingTop: 6,
          paddingBottom: showTabLabels ? 7 : 6,
        },
        tabBarItemStyle: { minWidth: 48 },
        tabBarLabelStyle: { fontSize: width < 620 ? 9 : 11, fontWeight: "700" },
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
        component={UsersNavigator}
        options={{
          tabBarLabel: "Users",
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="Subscriptions"
        component={AdminPremiumScreen}
        options={{
          tabBarLabel: "Premium",
          tabBarIcon: ({ color, size }) => <Ionicons name="star" color={color} size={size} />,
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
