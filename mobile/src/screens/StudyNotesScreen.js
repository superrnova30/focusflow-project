import React, { useState, useCallback, useLayoutEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { VisibilityBadge } from "../components/VisibilityPicker";
import ConfirmDialog from "../components/ConfirmDialog";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

const FILTERS = [
  { key: "all", label: "All", icon: "layers-outline" },
  { key: "ai", label: "AI", icon: "sparkles-outline" },
  { key: "manual", label: "Manual", icon: "create-outline" },
];

function notePreview(note) {
  const blocks = Array.isArray(note.contentJson) ? note.contentJson : [];
  for (const block of blocks) {
    const text = String(block?.text || "").replace(/\*\*/g, "").trim();
    if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  }
  return "No preview available";
}

function formatUpdatedAt(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Recently";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatCard({ icon, label, value, color, soft, colors, styles }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statIconWrap, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <View style={styles.statCopy}>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

function QuickAction({ icon, title, desc, color, soft, onPress, styles, colors, showDesc }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickTile,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.quickIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={styles.quickCopy}>
        <Text style={[styles.quickTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {showDesc ? (
          <Text style={styles.quickDesc} numberOfLines={2}>
            {desc}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

export default function StudyNotesScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isLarge = width >= 1024;
  const compact = width < 390;
  const columns = isLarge ? 3 : isWide ? 2 : 1;
  const styles = useMemo(
    () => createStyles(colors, isWide, isLarge, compact, columns),
    [colors, isWide, isLarge, compact, columns]
  );

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [importBanner, setImportBanner] = useState(null);
  const [highlightNoteId, setHighlightNoteId] = useState(null);

  const fetchNotes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await client.get("/notes");
      setNotes(data.notes || []);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message || "Could not load notes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Your Notes",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Back",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg]);

  useFocusEffect(
    useCallback(() => {
      fetchNotes(true);
      const importedTitle = route.params?.importedNoteTitle;
      const highlightId = route.params?.highlightNoteId;
      if (importedTitle) {
        setImportBanner(importedTitle);
        setHighlightNoteId(highlightId || null);
        setFilter("all");
        setSearch("");
        navigation.setParams({ importedNoteTitle: undefined, highlightNoteId: undefined });
      }
    }, [fetchNotes, navigation, route.params?.importedNoteTitle, route.params?.highlightNoteId])
  );

  const aiCount = useMemo(() => notes.filter((n) => n.source === "ai").length, [notes]);
  const manualCount = useMemo(() => notes.filter((n) => n.source !== "ai").length, [notes]);

  const filterCounts = useMemo(
    () => ({ all: notes.length, ai: aiCount, manual: manualCount }),
    [notes.length, aiCount, manualCount]
  );

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((note) => {
      if (filter === "ai" && note.source !== "ai") return false;
      if (filter === "manual" && note.source === "ai") return false;
      if (!q) return true;
      const preview = notePreview(note).toLowerCase();
      return note.title.toLowerCase().includes(q) || preview.includes(q);
    });
  }, [notes, search, filter]);

  const deleteNote = (note) => setDeleting(note);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await client.delete(`/notes/${deleting.id}`);
      setDeleting(null);
      await fetchNotes(true);
    } catch (e) {
      Alert.alert("Error", e.message || "Could not delete note.");
    } finally {
      setDeletingBusy(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotes(true);
  };

  const renderNote = ({ item }) => {
    const isAi = item.source === "ai";
    const blockCount = Array.isArray(item.contentJson) ? item.contentJson.length : 0;
    const accentColor = isAi ? colors.violet : colors.amber;
    const accentSoft = isAi ? colors.violetSoft : colors.amberSoft;
    const isHighlighted = highlightNoteId === item.id;

    return (
      <View style={styles.noteWrap}>
        <Pressable
          onPress={() => {
            if (isHighlighted) setHighlightNoteId(null);
            navigation.navigate("NoteView", { note: item });
          }}
          style={({ pressed }) => [
            styles.noteCard,
            {
              backgroundColor: colors.surface,
              borderColor: isHighlighted ? colors.mint : colors.border,
            },
            isHighlighted && styles.noteCardHighlighted,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.noteAccent, { backgroundColor: accentColor }]} />

          <View style={styles.noteInner}>
            {isHighlighted ? (
              <View style={[styles.newBadge, { backgroundColor: colors.mintSoft }]}>
                <Ionicons name="checkmark-circle" size={13} color={colors.mint} />
                <Text style={[styles.newBadgeText, { color: colors.mint }]}>Just added</Text>
              </View>
            ) : null}

            <View style={styles.noteHeader}>
              <View style={styles.noteHeaderLeft}>
                <View style={[styles.noteIcon, { backgroundColor: accentSoft }]}>
                  <Ionicons name={isAi ? "sparkles" : "document-text-outline"} size={18} color={accentColor} />
                </View>
                <View style={[styles.sourcePill, { backgroundColor: accentSoft }]}>
                  <Text style={[styles.sourcePillText, { color: accentColor }]}>{isAi ? "AI guide" : "Manual"}</Text>
                </View>
              </View>
              <View style={styles.noteActions}>
                <VisibilityBadge isPublic={item.isPublic} colors={colors} />
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    navigation.navigate("NoteEdit", { note: item });
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
                >
                  <Ionicons name="pencil-outline" size={17} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    deleteNote(item);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.tomato} />
                </Pressable>
              </View>
            </View>

            <Text style={styles.noteTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.notePreview} numberOfLines={compact ? 2 : 3}>
              {notePreview(item)}
            </Text>

            <View style={styles.noteFooter}>
              <View style={styles.noteMetaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="layers-outline" size={13} color={colors.textMuted} />
                  <Text style={styles.metaText}>
                    {blockCount} {blockCount === 1 ? "block" : "blocks"}
                  </Text>
                </View>
                <View style={[styles.metaDot, { backgroundColor: colors.border }]} />
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                  <Text style={styles.metaText}>{formatUpdatedAt(item.updatedAt || item.createdAt)}</Text>
                </View>
              </View>
              <View style={styles.readRow}>
                <Text style={[styles.readText, { color: accentColor }]}>Open</Text>
                <Ionicons name="arrow-forward" size={14} color={accentColor} />
              </View>
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const listHeader = (
    <View style={styles.page}>
      {importBanner ? (
        <Pressable
          onPress={() => setImportBanner(null)}
          style={[styles.importBanner, { backgroundColor: colors.mintSoft, borderColor: colors.mint }]}
        >
          <View style={[styles.importBannerIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="checkmark-circle" size={24} color={colors.mint} />
          </View>
          <View style={styles.importBannerCopy}>
            <Text style={[styles.importBannerTitle, { color: colors.text }]}>Notes generated successfully</Text>
            <Text style={styles.importBannerText} numberOfLines={2}>
              "{importBanner}" has been added to Your Notes.
            </Text>
          </View>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <View style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={[styles.heroIcon, { backgroundColor: colors.amberSoft }]}>
            <Ionicons name="journal-outline" size={18} color={colors.amber} />
          </View>
          <Text style={styles.subtitle} numberOfLines={isWide ? 2 : 3}>
            Build study guides with AI or write your own notes.
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          icon="documents-outline"
          label="Total"
          value={notes.length}
          color={colors.tomato}
          soft={colors.tomatoSoft}
          colors={colors}
          styles={styles}
        />
        <StatCard
          icon="sparkles-outline"
          label="AI"
          value={aiCount}
          color={colors.violet}
          soft={colors.violetSoft}
          colors={colors}
          styles={styles}
        />
        <StatCard
          icon="create-outline"
          label="Manual"
          value={manualCount}
          color={colors.amber}
          soft={colors.amberSoft}
          colors={colors}
          styles={styles}
        />
      </View>

      <View style={styles.quickRow}>
        <QuickAction
          icon="sparkles"
          title="Magic Import"
          desc="Topic, paste, or file → structured guide"
          color={colors.violet}
          soft={colors.violetSoft}
          onPress={() => navigation.navigate("NoteImport")}
          styles={styles}
          colors={colors}
          showDesc={isWide}
        />
        <QuickAction
          icon="create-outline"
          title="Write your own"
          desc="Headings, lists, and checklists"
          color={colors.amber}
          soft={colors.amberSoft}
          onPress={() => navigation.navigate("NoteEdit", {})}
          styles={styles}
          colors={colors}
          showDesc={isWide}
        />
      </View>

      <View style={[styles.toolbar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.searchWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by title or content…"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((item) => {
            const active = filter === item.key;
            const count = filterCounts[item.key];
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={[
                  styles.filterChip,
                  {
                    borderColor: active ? colors.tomato : colors.border,
                    backgroundColor: active ? colors.tomatoSoft : colors.bg,
                  },
                ]}
              >
                <Ionicons name={item.icon} size={13} color={active ? colors.tomato : colors.textMuted} />
                <Text style={[styles.filterChipText, { color: active ? colors.tomato : colors.textMuted }]}>
                  {item.label}
                </Text>
                <View
                  style={[
                    styles.filterCount,
                    { backgroundColor: active ? colors.tomato : colors.border },
                  ]}
                >
                  <Text style={[styles.filterCountText, { color: active ? "#fff" : colors.textMuted }]}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Your notes</Text>
        <Text style={styles.sectionCount}>
          {filteredNotes.length}
          {filteredNotes.length !== notes.length ? ` of ${notes.length}` : ""}
        </Text>
      </View>
    </View>
  );

  const emptyComponent = (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.amberSoft }]}>
        <Ionicons name="document-text-outline" size={36} color={colors.amber} />
      </View>
      <Text style={styles.emptyTitle}>
        {search.trim() || filter !== "all" ? "No matching notes" : "Start your first note"}
      </Text>
      <Text style={styles.emptyText}>
        {search.trim() || filter !== "all"
          ? "Try a different search term or switch the filter above."
          : "Generate a structured study guide with Magic Import, or write notes from scratch."}
      </Text>
      {!search.trim() && filter === "all" ? (
        <View style={[styles.emptyActions, isWide && styles.emptyActionsWide]}>
          <Pressable
            onPress={() => navigation.navigate("NoteImport")}
            style={({ pressed }) => [
              styles.emptyPrimaryBtn,
              { backgroundColor: colors.violet, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.emptyPrimaryText}>Magic Import</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("NoteEdit", {})}
            style={({ pressed }) => [
              styles.emptySecondaryBtn,
              { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Ionicons name="create-outline" size={18} color={colors.text} />
            <Text style={[styles.emptySecondaryText, { color: colors.text }]}>Write your own</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (loading && notes.length === 0) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <View style={[styles.loadingOrb, { backgroundColor: colors.violetSoft }]}>
            <ActivityIndicator color={colors.violet} size="large" />
          </View>
          <Text style={styles.centerTitle}>Loading your notes</Text>
          <Text style={styles.centerText}>Fetching your study library…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ConfirmDialog
        visible={Boolean(deleting)}
        title="Delete note?"
        message={deleting ? `Delete "${deleting.title}"? This cannot be undone.` : ""}
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        loading={deletingBusy}
        onConfirm={confirmDelete}
        onCancel={() => !deletingBusy && setDeleting(null)}
      />
      <FlatList
        data={filteredNotes}
        keyExtractor={(n) => n.id}
        renderItem={renderNote}
        numColumns={columns}
        key={`notes-${columns}`}
        columnWrapperStyle={columns > 1 ? styles.columnWrap : undefined}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.violet} colors={[colors.violet]} />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
      />
    </Screen>
  );
}

const createStyles = (colors, isWide, isLarge, compact, columns) =>
  StyleSheet.create({
    listContent: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.xl * 2,
    },
    page: {
      width: "100%",
      maxWidth: isLarge ? 1120 : isWide ? 960 : 520,
      alignSelf: "center",
      paddingTop: SPACING.sm,
    },
    importBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    importBannerIcon: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
    },
    importBannerCopy: { flex: 1, minWidth: 0 },
    importBannerTitle: {
      fontSize: 14,
      fontWeight: "900",
      marginBottom: 2,
    },
    importBannerText: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 17,
    },
    hero: {
      marginBottom: SPACING.md,
    },
    heroRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    heroIcon: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    subtitle: {
      flex: 1,
      color: colors.textMuted,
      fontSize: compact ? 12.5 : 13,
      lineHeight: compact ? 17 : 18,
      fontWeight: "500",
    },
    statsRow: {
      flexDirection: "row",
      gap: 6,
      marginBottom: SPACING.md,
    },
    statCard: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingVertical: 8,
      paddingHorizontal: 10,
      minHeight: 40,
    },
    statIconWrap: {
      width: 26,
      height: 26,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    statCopy: {
      flex: 1,
      minWidth: 0,
    },
    statValue: {
      fontSize: compact ? 15 : 16,
      fontWeight: "900",
      letterSpacing: -0.3,
      lineHeight: 18,
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: 9.5,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.3,
      marginTop: 1,
    },
    quickRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: SPACING.md,
    },
    quickTile: {
      flex: 1,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingVertical: 10,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
    },
    quickIcon: {
      width: 32,
      height: 32,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    quickCopy: {
      flex: 1,
      minWidth: 0,
    },
    quickTitle: {
      fontSize: compact ? 12.5 : 13,
      fontWeight: "800",
    },
    quickDesc: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 14,
      marginTop: 2,
    },
    toolbar: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
      marginBottom: SPACING.md,
      gap: 10,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      height: 40,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      paddingVertical: Platform.OS === "web" ? 6 : 0,
    },
    filterRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      flexWrap: "wrap",
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: "800",
    },
    filterCount: {
      minWidth: 18,
      height: 18,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 5,
      alignItems: "center",
      justifyContent: "center",
    },
    filterCountText: {
      fontSize: 9.5,
      fontWeight: "800",
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    sectionLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    sectionCount: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    columnWrap: {
      gap: SPACING.sm,
      justifyContent: "space-between",
    },
    noteWrap: {
      flex: columns > 1 ? 1 : undefined,
      maxWidth: columns === 3 ? "32.5%" : columns === 2 ? "49.5%" : "100%",
      marginBottom: SPACING.sm,
    },
    noteCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      overflow: "hidden",
      flexDirection: "row",
      ...(Platform.OS === "web"
        ? { boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }
        : null),
    },
    noteCardHighlighted: {
      borderWidth: 2,
    },
    noteAccent: {
      width: 4,
      alignSelf: "stretch",
    },
    noteInner: {
      flex: 1,
      padding: SPACING.lg,
      minWidth: 0,
    },
    newBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: RADIUS.pill,
      marginBottom: SPACING.sm,
    },
    newBadgeText: {
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    noteHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    noteHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      minWidth: 0,
      flexWrap: "wrap",
    },
    noteActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      flexShrink: 0,
    },
    iconAction: {
      width: 34,
      height: 34,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
    },
    noteIcon: {
      width: 34,
      height: 34,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    sourcePill: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: RADIUS.pill,
    },
    sourcePillText: {
      fontSize: 10.5,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    noteTitle: {
      color: colors.text,
      fontSize: compact ? 15 : 16,
      fontWeight: "800",
      lineHeight: compact ? 20 : 22,
      marginBottom: 6,
    },
    notePreview: {
      color: colors.textMuted,
      fontSize: compact ? 12.5 : 13,
      lineHeight: compact ? 18 : 19,
      marginBottom: SPACING.md,
    },
    noteFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: SPACING.sm,
      flexWrap: "wrap",
    },
    noteMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    metaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    metaDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    metaText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
    },
    readRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      flexShrink: 0,
    },
    readText: {
      fontSize: 12,
      fontWeight: "800",
    },
    emptyState: {
      alignItems: "center",
      paddingVertical: SPACING.xl * 2,
      paddingHorizontal: SPACING.lg,
      maxWidth: 400,
      alignSelf: "center",
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.lg,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 8,
      textAlign: "center",
      letterSpacing: -0.2,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 20,
      textAlign: "center",
      marginBottom: SPACING.lg,
    },
    emptyActions: {
      width: "100%",
      gap: SPACING.sm,
    },
    emptyActionsWide: {
      flexDirection: "row",
      maxWidth: 420,
    },
    emptyPrimaryBtn: {
      flex: 1,
      height: 48,
      borderRadius: RADIUS.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    emptyPrimaryText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 14,
    },
    emptySecondaryBtn: {
      flex: 1,
      height: 48,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    emptySecondaryText: {
      fontWeight: "800",
      fontSize: 14,
    },
    centerState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.sm,
      paddingHorizontal: SPACING.xl,
    },
    loadingOrb: {
      width: 72,
      height: 72,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    centerTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
    },
    centerText: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: "center",
    },
    pressed: { opacity: 0.82 },
  });
