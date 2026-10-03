import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS, SPACING } from "../theme/theme";

export default function VisibilityPicker({ value, onChange, colors, compact = false, minimal = false }) {
  const styles = createStyles(colors, compact, minimal);

  if (minimal) {
    return (
      <View style={styles.wrapMinimal}>
        <Pressable
          onPress={() => onChange(false)}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor: !value ? colors.violet : colors.border,
              backgroundColor: !value ? colors.violetSoft : colors.bg,
            },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="lock-closed-outline" size={14} color={!value ? colors.violet : colors.textMuted} />
          <Text style={[styles.chipLabel, { color: !value ? colors.violet : colors.textMuted }]}>Private</Text>
        </Pressable>
        <Pressable
          onPress={() => onChange(true)}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor: value ? colors.mint : colors.border,
              backgroundColor: value ? colors.mintSoft : colors.bg,
            },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="globe-outline" size={14} color={value ? colors.mint : colors.textMuted} />
          <Text style={[styles.chipLabel, { color: value ? colors.mint : colors.textMuted }]}>Public</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onChange(false)}
        style={({ pressed }) => [
          styles.option,
          { borderColor: !value ? colors.tomato : colors.border, backgroundColor: !value ? colors.tomatoSoft : colors.bg },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="lock-closed-outline" size={compact ? 15 : 18} color={!value ? colors.tomato : colors.textMuted} />
        <View style={styles.copy}>
          <Text style={[styles.label, { color: !value ? colors.tomato : colors.text }]}>Private</Text>
          {!compact && <Text style={styles.hint}>Only you can view this</Text>}
        </View>
      </Pressable>
      <Pressable
        onPress={() => onChange(true)}
        style={({ pressed }) => [
          styles.option,
          { borderColor: value ? colors.mint : colors.border, backgroundColor: value ? colors.mintSoft : colors.bg },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="globe-outline" size={compact ? 15 : 18} color={value ? colors.mint : colors.textMuted} />
        <View style={styles.copy}>
          <Text style={[styles.label, { color: value ? colors.mint : colors.text }]}>Public</Text>
          {!compact && <Text style={styles.hint}>Other students can view on your profile</Text>}
        </View>
      </Pressable>
    </View>
  );
}

export function VisibilityBadge({ isPublic, colors, style }) {
  const accent = isPublic ? colors.mint : colors.textMuted;
  const soft = isPublic ? colors.mintSoft : colors.border;
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: soft }, style]}>
      <Ionicons name={isPublic ? "globe-outline" : "lock-closed-outline"} size={11} color={accent} />
      <Text style={{ color: accent, fontSize: 10, fontWeight: "800" }}>{isPublic ? "Public" : "Private"}</Text>
    </View>
  );
}

const createStyles = (colors, compact, minimal) =>
  StyleSheet.create({
    wrap: { gap: compact ? 6 : SPACING.sm },
    wrapMinimal: {
      flexDirection: "row",
      gap: 8,
    },
    chip: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingVertical: 7,
      paddingHorizontal: 10,
      minHeight: 34,
    },
    chipLabel: {
      fontSize: 12,
      fontWeight: "800",
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 8 : SPACING.md,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingVertical: compact ? 8 : 14,
      paddingHorizontal: compact ? 10 : 14,
      minHeight: compact ? 38 : undefined,
    },
    copy: { flex: 1 },
    label: { fontSize: compact ? 13 : 14, fontWeight: "800" },
    hint: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
    pressed: { opacity: 0.85 },
  });
