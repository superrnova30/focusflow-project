import React, { useMemo } from "react";
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SPACING } from "../theme/theme";

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={Boolean(visible)} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={loading ? undefined : onCancel}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={loading}
              style={({ pressed }) => [styles.button, styles.cancelButton, { borderColor: colors.border }, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, { color: colors.textMuted }]}>{cancelText}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: destructive ? colors.tomato : colors.violet, opacity: loading ? 0.7 : pressed ? 0.85 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmText}>{confirmText}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      padding: SPACING.lg,
    },
    sheet: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      maxWidth: 420,
      width: "100%",
      alignSelf: "center",
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 8,
    },
    message: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: SPACING.sm,
      marginTop: SPACING.lg,
    },
    button: {
      minWidth: 96,
      minHeight: 44,
      borderRadius: RADIUS.md,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButton: {
      borderWidth: 1,
      backgroundColor: colors.bg,
    },
    buttonText: {
      fontWeight: "700",
      fontSize: 14,
    },
    confirmText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 14,
    },
    pressed: {
      opacity: 0.85,
    },
  });
