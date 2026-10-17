import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { resolveMediaUrl } from "../lib/media";

/**
 * Circular school logo. The image fills the circle (`cover`) so the frame
 * stays a perfect circle at any size, including lists, heroes, and pickers.
 */
export default function SchoolLogo({ school, uri, size = 40, style }) {
  const { colors } = useTheme();
  const source = resolveMediaUrl(uri || school?.logoUrl);
  const radius = size / 2;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={school?.name ? `${school.name} logo` : "School logo"}
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: colors.violetSoft,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {source ? (
        <Image
          source={{ uri: source }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name="school" size={Math.max(12, size * 0.46)} color={colors.violet} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
    aspectRatio: 1,
  },
});
