import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import RichTextEditor from "./RichTextEditor";
import { RADIUS } from "../theme/theme";

/**
 * Task-specific description field — collapsible, matches Tasks modal panels.
 */
export default function TaskDescriptionEditor({ value = [], onChange, compact = false, inModal = false }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, compact, inModal), [colors, compact, inModal]);
  const hasContent = (value?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(hasContent);

  useEffect(() => {
    if (hasContent) setExpanded(true);
  }, [hasContent]);

  const openEditor = () => {
    setExpanded(true);
    if (!hasContent) {
      onChange([{ type: "text", text: "", marks: [] }]);
    }
  };

  const collapseEditor = () => {
    const isEmpty =
      value.length === 0 ||
      (value.length === 1 &&
        value[0]?.type === "text" &&
        !String(value[0]?.text || "").trim());
    if (isEmpty) onChange([]);
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <Pressable
        onPress={openEditor}
        style={({ pressed }) => [styles.collapsedCard, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Add task description"
      >
        <View style={[styles.leadIcon, { backgroundColor: colors.mintSoft }]}>
          <Ionicons name="document-text-outline" size={18} color={colors.mint} />
        </View>
        <View style={styles.collapsedCopy}>
          <Text style={styles.collapsedTitle}>Add description</Text>
          <Text style={styles.collapsedSubtitle} numberOfLines={2}>
            Optional notes, steps, or bullet points
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <View style={[styles.leadIcon, { backgroundColor: colors.mintSoft }]}>
            <Ionicons name="document-text-outline" size={18} color={colors.mint} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.panelTitle}>Description</Text>
            <Text style={styles.panelSubtitle}>Optional · formatting supported</Text>
          </View>
        </View>
        <Pressable
          onPress={collapseEditor}
          hitSlop={10}
          style={({ pressed }) => [styles.collapseBtn, pressed && styles.pressed]}
          accessibilityLabel="Collapse description"
        >
          <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={[styles.editorShell, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <RichTextEditor
          embedded
          compact={compact || inModal}
          scrollable={inModal}
          value={value}
          onChange={onChange}
          placeholder="Write steps, context, or reminders…"
        />
      </View>
    </View>
  );
}

const createStyles = (colors, compact, inModal) =>
  StyleSheet.create({
    collapsedCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: compact ? 12 : 14,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    collapsedCopy: { flex: 1, minWidth: 0 },
    collapsedTitle: {
      color: colors.text,
      fontSize: compact ? 12.5 : 13,
      fontWeight: "800",
    },
    collapsedSubtitle: {
      color: colors.textMuted,
      fontSize: compact ? 10.5 : 11,
      lineHeight: 16,
      marginTop: 2,
    },
    panel: {
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      overflow: "hidden",
    },
    panelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingHorizontal: compact ? 12 : 14,
      paddingTop: compact ? 12 : 14,
      paddingBottom: 10,
    },
    panelHeaderLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
    },
    panelTitle: {
      color: colors.text,
      fontSize: compact ? 12.5 : 13,
      fontWeight: "800",
    },
    panelSubtitle: {
      color: colors.textMuted,
      fontSize: compact ? 9.5 : 10,
      marginTop: 2,
      fontWeight: "600",
    },
    leadIcon: {
      width: compact ? 34 : 36,
      height: compact ? 34 : 36,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    collapseBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editorShell: {
      marginHorizontal: compact ? 10 : 12,
      marginBottom: compact ? 10 : 12,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      overflow: "hidden",
      maxHeight: inModal ? (compact ? 150 : 180) : undefined,
    },
    pressed: { opacity: 0.82 },
  });
