import React from "react";
import { TextInput, Pressable, Text, StyleSheet, ActivityIndicator } from "react-native";
import { RADIUS } from "../theme/theme";
import { useTheme } from "../context/ThemeContext";

export function Input({ style, ...props }) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={[
        styles.input,
        { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        style,
      ]}
      {...props}
    />
  );
}

export function Button({ title, onPress, loading, variant = "primary", disabled }) {
  const { colors } = useTheme();
  const bg =
    variant === "primary" ? colors.tomato : variant === "ghost" ? "transparent" : colors.surface;
  const color = variant === "primary" ? "#fff" : variant === "ghost" ? colors.textMuted : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled || loading ? 0.6 : pressed ? 0.85 : 1 },
        variant === "secondary" && { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.buttonText, { color }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  button: {
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontWeight: "700", fontSize: 15 },
});
