import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

/**
 * Circular profile photo. The image fills the circle (`cover`) so the frame
 * is always a perfect circle, including in the nav bar and lists.
 */
export default function UserAvatar({ user, size = 44, style, ringColor }) {
  const { colors } = useTheme();

  const uri = user && user.profilePicture ? String(user.profilePicture).trim() : "";
  const hasImage = uri.length > 0;

  const initials = (() => {
    const name = (user && user.name) || "";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  const palette = [colors.violet, colors.mint, colors.amber, colors.tomato];
  const seed = ((user && user.id) || (user && user.name) || "x")
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const accent = palette[seed % palette.length];
  const radius = size / 2;

  const box = {
    width: size,
    height: size,
    borderRadius: radius,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ringColor || colors.border,
  };

  if (hasImage) {
    return (
      <View
        style={[box, styles.frame, { backgroundColor: colors.surfaceRaised }, style]}
        accessibilityLabel={`${(user && user.name) || "User"} profile picture`}
      >
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  return (
    <View style={[box, styles.fallback, { backgroundColor: accent + "26" }, style]}>
      <Text style={[styles.initials, { color: accent, fontSize: Math.max(11, size * 0.34) }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
  fallback: { alignItems: "center", justifyContent: "center" },
  initials: { fontWeight: "800" },
});
