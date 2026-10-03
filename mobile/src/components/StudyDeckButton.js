import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS, SPACING } from "../theme/theme";

/**
 * Primary deck CTA — visually distinct from secondary/outline buttons on deck screens.
 */
export default function StudyDeckButton({
  onPress,
  disabled = false,
  loading = false,
  accentColor,
  colors,
  compact = false,
  style,
}) {
  const styles = useMemo(
    () => createStyles(colors, accentColor, compact),
    [colors, accentColor, compact]
  );

  return (
    <Pressable
      onPress={(event) => {
        event?.stopPropagation?.();
        onPress?.(event);
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel="Study deck"
      style={({ pressed }) => [
        styles.root,
        disabled && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
    >
      <View style={styles.shine} pointerEvents="none" />
      <View style={styles.iconOrb}>
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name="play" size={compact ? 17 : 20} color="#fff" />
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>Start studying</Text>
        <Text style={styles.label}>Study deck</Text>
        {!compact ? (
          <Text style={styles.hint} numberOfLines={1}>
            Memorize · AI tutor · Practice test
          </Text>
        ) : null}
      </View>
      {!loading ? (
        <View style={styles.arrowWrap}>
          <Ionicons name="arrow-forward" size={compact ? 16 : 18} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

function createStyles(colors, accentColor, compact) {
  const accent = accentColor || colors.violet;
  return StyleSheet.create({
    root: {
      position: "relative",
      overflow: "hidden",
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 10 : 12,
      minHeight: compact ? 48 : 62,
      paddingHorizontal: compact ? 14 : 16,
      paddingVertical: compact ? 10 : 12,
      borderRadius: compact ? RADIUS.lg : RADIUS.xl,
      backgroundColor: accent,
      borderWidth: 1.5,
      borderColor: accent + "CC",
      ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
      shadowColor: accent,
      shadowOpacity: 0.38,
      shadowRadius: compact ? 10 : 16,
      shadowOffset: { width: 0, height: compact ? 4 : 8 },
      elevation: 6,
    },
    shine: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "48%",
      backgroundColor: "rgba(255,255,255,0.14)",
      borderTopLeftRadius: compact ? RADIUS.lg : RADIUS.xl,
      borderTopRightRadius: compact ? RADIUS.lg : RADIUS.xl,
    },
    iconOrb: {
      width: compact ? 34 : 40,
      height: compact ? 34 : 40,
      borderRadius: compact ? 17 : 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.22)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.35)",
    },
    copy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      color: "rgba(255,255,255,0.82)",
      fontSize: compact ? 9 : 9.5,
      fontWeight: "900",
      letterSpacing: 0.9,
      textTransform: "uppercase",
      marginBottom: 1,
    },
    label: {
      color: "#fff",
      fontSize: compact ? 14 : 16,
      fontWeight: "900",
      letterSpacing: -0.2,
    },
    hint: {
      color: "rgba(255,255,255,0.78)",
      fontSize: compact ? 10 : 11,
      fontWeight: "600",
      marginTop: 2,
    },
    arrowWrap: {
      width: compact ? 28 : 32,
      height: compact ? 28 : 32,
      borderRadius: compact ? 14 : 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    pressed: {
      opacity: 0.92,
      transform: [{ scale: 0.985 }],
    },
    disabled: {
      opacity: 0.48,
      shadowOpacity: 0,
      elevation: 0,
    },
  });
}
