import React from "react";
import { Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Same refresh affordance as Admin Overview: spinner while loading, icon when idle.
 */
export default function RefreshButton({
  refreshing = false,
  onPress,
  color,
  backgroundColor,
  size = 19,
  accessibilityLabel = "Refresh",
  style,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={refreshing}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.btn,
        backgroundColor ? { backgroundColor } : null,
        style,
        (pressed || refreshing) && styles.pressed,
      ]}
    >
      {refreshing ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name="refresh" size={size} color={color} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pressed: { opacity: 0.88 },
});
