import React, { useState } from "react";
import { TextInput, Pressable, Text, StyleSheet, ActivityIndicator, View } from "react-native";
import { RADIUS } from "../theme/theme";
import { useTheme } from "../context/ThemeContext";

export function Input({ style, label, secureTextEntry, ...props }) {
  const { colors } = useTheme();
  const [secure, setSecure] = useState(!!secureTextEntry);

  // Resolve marginBottom whether `style` is an object or array
  let wrapperMarginBottom = 12;
  if (style) {
    if (Array.isArray(style)) {
      for (const s of style) {
        if (s && typeof s === "object" && s.marginBottom != null) {
          wrapperMarginBottom = s.marginBottom;
          break;
        }
      }
    } else if (style.marginBottom != null) {
      wrapperMarginBottom = style.marginBottom;
    }
  }

  return (
    <View style={[styles.inputWrapper, { marginBottom: wrapperMarginBottom }]}> 
      {label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            { color: colors.text },
          ]}
          secureTextEntry={secure}
          {...props}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setSecure((s) => !s)} style={styles.toggle}>
            <Text style={{ color: colors.textMuted, fontWeight: "600" }}>{secure ? "Show" : "Hide"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Button({ title, onPress, loading, variant = "primary", disabled, style }) {
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
        variant === "primary" && styles.buttonPrimary,
        { backgroundColor: bg, opacity: disabled || loading ? 0.6 : pressed ? 0.85 : 1 },
        variant === "secondary" && { borderWidth: 1, borderColor: colors.border },
        style,
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
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minWidth: 0,
  },
  button: {
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  inputWrapper: {
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
    fontWeight: "600",
  },
  inputRow: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    minHeight: 50,
    minWidth: 0,
  },
  buttonText: { fontWeight: "700", fontSize: 15 },
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
