import React from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SPACING } from "../theme/theme";
import { useTheme } from "../context/ThemeContext";

export function Screen({ children, style }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }, style]}>
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
}

export function Card({ children, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: SPACING.lg },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: SPACING.lg,
  },
});
