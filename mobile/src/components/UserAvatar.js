import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

/**
 * Profile avatar that renders the user's stored picture when there is one and
 * falls back to initials otherwise. The picture may be a remote URL or a
 * base64 data URI (both are accepted by React Native's Image), so no
 * transformation is needed here — we just resize it consistently.
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

  // Derive a stable accent per user so the initials fallback is not all one colour.
  const palette = [colors.violet, colors.mint, colors.amber, colors.tomato];
  const seed = ((user && user.id) || (user && user.name) || "x")
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const accent = palette[seed % palette.length];

  const box = {
    width: size,
    height: size,
    borderRadius: size / 2.6,
    borderWidth: 1,
    borderColor: ringColor || colors.border,
  };

  if (hasImage) {
    return (
      <Image
        source={{ uri }}
        style={[box, { backgroundColor: colors.surfaceRaised }, style]}
        resizeMode="cover"
        accessibilityLabel={`${(user && user.name) || "User"} profile picture`}
      />
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
  fallback: { alignItems: "center", justifyContent: "center" },
  initials: { fontWeight: "800", letterSpacing: 0.3 },
});
