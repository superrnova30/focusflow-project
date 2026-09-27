import React, { memo, useState } from "react";
import { View, Text, TextInput, Pressable, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS, SPACING } from "../theme/theme";

const IS_NATIVE = Platform.OS === "ios" || Platform.OS === "android";

/**
 * Stable auth input for Expo Go / mobile. Avoids autofill, focus chaining, and
 * animated borders that cause the keyboard to jump between fields on Android.
 */
function AuthFieldInner({
  label,
  icon,
  value,
  onChangeText,
  secureTextEntry,
  colors,
  inputRef,
  ...props
}) {
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={styles.wrapper} collapsable={false}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View
        style={[styles.row, { backgroundColor: colors.bg, borderColor: colors.border }]}
        collapsable={false}
      >
        <Ionicons name={icon} size={19} color={colors.textMuted} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isPassword ? hidden : false}
          editable
          underlineColorAndroid="transparent"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          spellCheck={false}
          style={[
            styles.input,
            { color: colors.text },
            Platform.OS === "web" ? { outlineStyle: "none" } : null,
          ]}
          {...(IS_NATIVE
            ? {
                autoComplete: "off",
                importantForAutofill: "no",
                textContentType: "none",
                returnKeyType: "default",
                blurOnSubmit: true,
              }
            : {})}
          {...props}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setHidden((current) => !current)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            style={({ pressed }) => [styles.trailingButton, pressed && { opacity: 0.65 }]}
          >
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export const AuthField = memo(AuthFieldInner);

const styles = StyleSheet.create({
  wrapper: { width: "100%", marginBottom: SPACING.md },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 7 },
  row: {
    minHeight: 52,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingLeft: 14,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 48,
    fontSize: 16,
    paddingVertical: 0,
    paddingRight: 8,
  },
  trailingButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
