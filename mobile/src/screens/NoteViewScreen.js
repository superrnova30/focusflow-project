import React, { useMemo, useLayoutEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import VisibilityPicker, { VisibilityBadge } from "../components/VisibilityPicker";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

function Block({ block, colors, index, numberedIndex }) {
  const styles = useMemo(() => createBlockStyles(colors), [colors]);

  if (block.type === "heading") {
    const size = block.level === 1 ? 24 : block.level === 3 ? 16 : 20;
    const marginTop = block.level === 1 ? 0 : 16;
    return (
      <Text style={[styles.heading, { fontSize: size, marginTop }]}>
        {block.text}
      </Text>
    );
  }

  if (block.type === "bullet") {
    return (
      <View style={styles.row}>
        <View style={[styles.bulletDot, { backgroundColor: colors.violet }]} />
        <Text style={styles.bodyText}>{block.text}</Text>
      </View>
    );
  }

  if (block.type === "numbered") {
    return (
      <View style={styles.row}>
        <Text style={[styles.numberMarker, { color: colors.violet }]}>{numberedIndex}.</Text>
        <Text style={styles.bodyText}>{block.text}</Text>
      </View>
    );
  }

  if (block.type === "checklist") {
    return (
      <View style={styles.row}>
        <Ionicons
          name={block.checked ? "checkbox" : "square-outline"}
          size={18}
          color={block.checked ? colors.mint : colors.textMuted}
          style={styles.checkIcon}
        />
        <Text style={[styles.bodyText, block.checked && styles.checkedText]}>{block.text}</Text>
      </View>
    );
  }

  const marks = Array.isArray(block.marks) ? block.marks : [];
  const parts = String(block.text || "").split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={styles.paragraph}>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={i} style={styles.boldText}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return (
          <Text
            key={i}
            style={[
              styles.bodyText,
              marks.includes("bold") && styles.boldText,
              marks.includes("italic") && styles.italicText,
              marks.includes("underline") && styles.underlineText,
            ]}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

function formatFullDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function NoteViewScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const { note: initialNote, noteId, readOnly: readOnlyParam } = route.params || {};
  const [note, setNote] = useState(initialNote || null);
  const [isOwner, setIsOwner] = useState(!readOnlyParam);
  const [loading, setLoading] = useState(Boolean(noteId && !initialNote));
  const [savingVisibility, setSavingVisibility] = useState(false);

  const fetchNote = useCallback(async () => {
    const id = noteId || initialNote?.id;
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await client.get(`/notes/${id}`);
      setNote(data.note);
      setIsOwner(Boolean(data.isOwner));
    } catch (e) {
      setNote(null);
    } finally {
      setLoading(false);
    }
  }, [noteId, initialNote?.id]);

  useFocusEffect(
    useCallback(() => {
      if (noteId || !initialNote?.contentJson) fetchNote();
    }, [fetchNote, noteId, initialNote])
  );

  const readOnly = readOnlyParam || !isOwner;
  const blocks = note?.contentJson || [];
  const isAi = note?.source === "ai";
  const accentColor = isAi ? colors.violet : colors.amber;
  const accentSoft = isAi ? colors.violetSoft : colors.amberSoft;

  let numberedCounter = 0;

  const updateVisibility = async (nextPublic) => {
    if (!note || readOnly) return;
    setSavingVisibility(true);
    try {
      const { data } = await client.patch(`/notes/${note.id}`, { isPublic: nextPublic });
      setNote(data.note);
    } catch (e) {
      // ignore — picker will revert on next fetch
    } finally {
      setSavingVisibility(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Note",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: readOnly ? "Profile" : "Notes",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg, readOnly]);

  if (loading && !note) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.violet} size="large" />
        </View>
      </Screen>
    );
  }

  if (!note) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Text style={styles.emptyContent}>Note not found or not available.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.page}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.heroTop}>
              <View style={[styles.heroIcon, { backgroundColor: accentSoft }]}>
                <Ionicons name={isAi ? "sparkles" : "document-text"} size={22} color={accentColor} />
              </View>
              <View style={styles.heroBadges}>
                <View style={[styles.sourcePill, { backgroundColor: accentSoft }]}>
                  <Text style={[styles.sourcePillText, { color: accentColor }]}>{isAi ? "AI generated" : "Manual note"}</Text>
                </View>
                <VisibilityBadge isPublic={note.isPublic} colors={colors} />
              </View>
            </View>

            <Text style={styles.title}>{note.title}</Text>

            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                <Text style={styles.metaText}>{formatFullDate(note.updatedAt || note.createdAt)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="layers-outline" size={14} color={colors.textMuted} />
                <Text style={styles.metaText}>{blocks.length} blocks</Text>
              </View>
            </View>

            {!readOnly && (
              <Pressable
                onPress={() => navigation.navigate("NoteEdit", { note })}
                style={({ pressed }) => [styles.editBtn, { backgroundColor: colors.tomato }, pressed && styles.pressed]}
              >
                <Ionicons name="pencil" size={16} color="#fff" />
                <Text style={styles.editBtnText}>Edit note</Text>
              </Pressable>
            )}
          </View>

          {!readOnly && (
            <View style={[styles.visibilityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.contentLabel}>Visibility</Text>
              {savingVisibility ? (
                <ActivityIndicator color={colors.violet} style={{ marginVertical: SPACING.sm }} />
              ) : (
                <VisibilityPicker value={Boolean(note.isPublic)} onChange={updateVisibility} colors={colors} compact />
              )}
            </View>
          )}

          {!!note.aiSummary && (
            <View style={[styles.summaryCard, { backgroundColor: colors.violetSoft, borderColor: colors.violet }]}>
              <View style={styles.summaryHeader}>
                <Ionicons name="bulb-outline" size={18} color={colors.violet} />
                <Text style={[styles.summaryTitle, { color: colors.violet }]}>AI summary</Text>
              </View>
              <Text style={styles.summaryText}>{note.aiSummary}</Text>
            </View>
          )}

          <View style={[styles.contentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.contentLabel}>Content</Text>
            {blocks.length === 0 ? (
              <Text style={styles.emptyContent}>This note has no content yet.</Text>
            ) : (
              blocks.map((block, index) => {
                if (block.type === "numbered") numberedCounter += 1;
                const numberedIndex = block.type === "numbered" ? numberedCounter : 0;
                return (
                  <Block
                    key={`${index}-${block.type}`}
                    block={block}
                    colors={colors}
                    index={index}
                    numberedIndex={numberedIndex}
                  />
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createBlockStyles = (colors) =>
  StyleSheet.create({
    heading: {
      color: colors.text,
      fontWeight: "800",
      lineHeight: 28,
      marginBottom: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 10,
    },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 8,
      marginRight: 12,
      marginLeft: 4,
    },
    numberMarker: {
      width: 22,
      fontSize: 14,
      fontWeight: "800",
      marginRight: 8,
      paddingTop: 1,
    },
    checkIcon: { marginRight: 10, marginTop: 2 },
    paragraph: { marginBottom: 12 },
    bodyText: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 24,
      flex: 1,
    },
    boldText: { color: colors.text, fontWeight: "800" },
    italicText: { fontStyle: "italic" },
    underlineText: { textDecorationLine: "underline" },
    checkedText: {
      textDecorationLine: "line-through",
      color: colors.textMuted,
    },
  });

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    scroll: {
      paddingBottom: SPACING.xl * 2,
      paddingTop: SPACING.md,
    },
    page: {
      width: "100%",
      maxWidth: isWide ? 720 : 520,
      alignSelf: "center",
    },
    heroCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: SPACING.md,
    },
    heroBadges: {
      alignItems: "flex-end",
      gap: 6,
    },
    heroIcon: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
    },
    sourcePill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
    },
    sourcePillText: { fontSize: 11.5, fontWeight: "800" },
    title: {
      color: colors.text,
      fontSize: compact ? 24 : 28,
      fontWeight: "900",
      letterSpacing: -0.4,
      lineHeight: compact ? 30 : 34,
      marginBottom: SPACING.md,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    metaText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600" },
    editBtn: {
      height: 44,
      borderRadius: RADIUS.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    editBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
    summaryCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    summaryHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: SPACING.sm,
    },
    summaryTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
    summaryText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 22,
    },
    contentCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
    },
    contentLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: SPACING.lg,
    },
    emptyContent: {
      color: colors.textMuted,
      fontSize: 14,
      fontStyle: "italic",
    },
    visibilityCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    centerState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.lg,
    },
    pressed: { opacity: 0.85 },
  });
