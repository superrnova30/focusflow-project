import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useNotifications } from "../context/NotificationContext";

export default function NotificationBell({ onPress }) {
  const { colors } = useTheme();
  const { unreadCount, openPanel, panelOpen, closePanel } = useNotifications();
  const badge = unreadCount > 99 ? "99+" : String(unreadCount || 0);

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (panelOpen) closePanel();
    else openPanel();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
      style={({ pressed }) => [styles.btn, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
    >
      <Ionicons name={unreadCount || panelOpen ? "notifications" : "notifications-outline"} size={18} color={colors.text} />
      {unreadCount > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.tomato, borderColor: colors.surface }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  badge: {
    position: "absolute",
    top: -4,
    right: -5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 11,
  },
});
