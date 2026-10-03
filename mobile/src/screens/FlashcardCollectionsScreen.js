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
  Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { VisibilityBadge } from "../components/VisibilityPicker";
import ConfirmDialog from "../components/ConfirmDialog";
import StudyDeckButton from "../components/StudyDeckButton";
import { deckAccent, DECK_COLOR_IDS } from "../lib/deckColors";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

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

export default function FlashcardCollectionsScreen({ navigation }) {
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

  const [collections, setCollections] = useState([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("violet");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [sortBy, setSortBy] = useState("recent");
  const [studyingId, setStudyingId] = useState(null);

  const fetchCollections = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await client.get("/flashcards/collections");
      setCollections(data.collections || []);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message || "Could not load collections.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Collections",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Back",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg]);

  useFocusEffect(
    useCallback(() => {
      fetchCollections(true);
    }, [fetchCollections])
  );

  const filteredCollections = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? collections.filter((c) => c.name.toLowerCase().includes(q)) : [...collections];
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "cards") {
        return (b._count?.flashcards || 0) - (a._count?.flashcards || 0);
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    return list;
  }, [collections, search, sortBy]);

  const totalCards = useMemo(
    () => collections.reduce((sum, c) => sum + (c._count?.flashcards || 0), 0),
    [collections]
  );

  const createCollection = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const { data } = await client.post("/flashcards/collections", { name });
      setNewName("");
      await fetchCollections(true);
      navigation.navigate("FlashcardCollection", { collection: data.collection });
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message || "Could not create collection.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (item) => {
    setEditing(item);
    setEditName(item.name);
    setEditColor(item.color || "violet");
  };

  const submitEdit = async () => {
    const name = editName.trim();
    if (!name || !editing) return;
    setSavingEdit(true);
    try {
      await client.patch(`/flashcards/collections/${editing.id}`, { name, color: editColor });
      setEditing(null);
      await fetchCollections(true);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message || "Could not update collection.");
    } finally {
      setSavingEdit(false);
    }
  };

  const studyDeck = async (item) => {
    setStudyingId(item.id);
    try {
      const { data } = await client.get(`/flashcards/collections/${item.id}`);
      const loaded = data.collection;
      const cardCount = loaded?.flashcards?.length ?? item._count?.flashcards ?? 0;
      if (cardCount === 0) {
        Alert.alert("No cards yet", "Add flashcards to this deck before studying.");
        return;
      }
      navigation.navigate("FlashcardStudyModes", {
        collection: loaded,
        collectionId: item.id,
      });
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message || "Could not load this deck.");
    } finally {
      setStudyingId(null);
    }
  };

  const deleteCollection = (collection) => setDeleting(collection);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await client.delete(`/flashcards/collections/${deleting.id}`);
      setDeleting(null);
      await fetchCollections(true);
    } catch (e) {
      Alert.alert("Error", e.message || "Could not delete collection.");
    } finally {
      setDeletingBusy(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchCollections(true);
  };

  const renderCollection = ({ item }) => {
    const accent = deckAccent(item.color, colors);
    const cardCount = item._count?.flashcards || 0;
    const hasCards = cardCount > 0;
    const isStudying = studyingId === item.id;

    return (
      <View style={styles.collectionWrap}>
        <Pressable
          onPress={() => navigation.navigate("FlashcardCollection", { collection: item })}
          style={({ pressed }) => [
            styles.collectionCard,
            {
              backgroundColor: colors.surface,
              borderColor: hasCards ? accent.color + "33" : colors.border,
            },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.collectionAccent, { backgroundColor: accent.color }]} />

          <View style={[styles.collectionTint, { backgroundColor: accent.soft + "55" }]}>
            <View style={styles.collectionInner}>
              <View style={styles.collectionTop}>
                <View style={[styles.collectionIcon, { backgroundColor: colors.surface, borderColor: accent.color + "44" }]}>
                  <Ionicons name={accent.icon} size={20} color={accent.color} />
                </View>
                <View style={styles.collectionActions}>
                  <VisibilityBadge isPublic={item.isPublic} colors={colors} />
                  <Pressable
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      openEdit(item);
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.iconAction,
                      { backgroundColor: colors.surface },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      deleteCollection(item);
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.iconAction,
                      { backgroundColor: colors.surface },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.tomato} />
                  </Pressable>
                </View>
              </View>

              <Text style={styles.collectionName} numberOfLines={2}>
                {item.name}
              </Text>

              <View style={styles.deckMetaRow}>
                <View style={[styles.cardCountPill, { backgroundColor: colors.surface, borderColor: accent.color + "44" }]}>
                  <Ionicons name="layers-outline" size={13} color={accent.color} />
                  <Text style={[styles.cardCountPillText, { color: accent.color }]}>
                    {cardCount} {cardCount === 1 ? "card" : "cards"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: hasCards ? colors.mintSoft : colors.border + "66" },
                  ]}
                >
                  <Ionicons
                    name={hasCards ? "checkmark-circle" : "add-circle-outline"}
                    size={12}
                    color={hasCards ? colors.mint : colors.textMuted}
                  />
                  <Text style={[styles.statusPillText, { color: hasCards ? colors.mint : colors.textMuted }]}>
                    {hasCards ? "Ready" : "Empty"}
                  </Text>
                </View>
              </View>

              <View style={[styles.deckPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.previewLine, { backgroundColor: accent.color, opacity: 0.85, width: "42%" }]} />
                <View style={[styles.previewLine, { backgroundColor: colors.border, width: "68%" }]} />
                <View style={[styles.previewLine, { backgroundColor: colors.border, width: "54%" }]} />
              </View>

              <View style={[styles.collectionFooter, isWide && styles.collectionFooterWide]}>
                {hasCards ? (
                  <StudyDeckButton
                    compact
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      studyDeck(item);
                    }}
                    disabled={isStudying}
                    loading={isStudying}
                    accentColor={accent.color}
                    colors={colors}
                    style={isWide ? { flex: 1 } : undefined}
                  />
                ) : (
                  <Pressable
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      navigation.navigate("FlashcardEdit", { collectionId: item.id });
                    }}
                    style={({ pressed }) => [
                      styles.studyBtn,
                      styles.addCardsBtn,
                      { borderColor: accent.color, flex: isWide ? 1 : undefined },
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={accent.color} />
                    <Text style={[styles.studyBtnText, { color: accent.color }]}>Add cards</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    navigation.navigate("FlashcardCollection", { collection: item });
                  }}
                  style={({ pressed }) => [
                    styles.openBtn,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    isWide && { flex: 1 },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.openText, { color: colors.text }]}>Open</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const listHeader = (
    <View style={styles.page}>
      <View style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={[styles.heroIcon, { backgroundColor: colors.violetSoft }]}>
            <Ionicons name="albums-outline" size={18} color={colors.violet} />
          </View>
          <Text style={styles.subtitle} numberOfLines={isWide ? 2 : 3}>
            Organize decks by topic — generate with AI or write your own cards.
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          icon="folder-outline"
          label="Decks"
          value={collections.length}
          color={colors.violet}
          soft={colors.violetSoft}
          colors={colors}
          styles={styles}
        />
        <StatCard
          icon="layers-outline"
          label="Cards"
          value={totalCards}
          color={colors.mint}
          soft={colors.mintSoft}
          colors={colors}
          styles={styles}
        />
      </View>

      <View style={[styles.createCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={styles.createLabel}>New collection</Text>
        <View style={styles.createRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="e.g. Biology Chapter 3"
            placeholderTextColor={colors.textMuted}
            style={[styles.createInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
            returnKeyType="done"
            onSubmitEditing={createCollection}
          />
          <Pressable
            onPress={createCollection}
            disabled={creating || !newName.trim()}
            style={({ pressed }) => [
              styles.createBtn,
              { backgroundColor: colors.tomato, opacity: creating || !newName.trim() ? 0.55 : pressed ? 0.88 : 1 },
            ]}
          >
            {creating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.createBtnText}>Create</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.quickRow}>
        <QuickAction
          icon="sparkles"
          title="Magic Import"
          desc="Generate cards from topics, notes, or files"
          color={colors.violet}
          soft={colors.violetSoft}
          onPress={() => navigation.navigate("MagicImport")}
          styles={styles}
          colors={colors}
          showDesc={isWide}
        />
        <QuickAction
          icon="create-outline"
          title="Write your own"
          desc="Craft a custom Q&A card"
          color={colors.mint}
          soft={colors.mintSoft}
          onPress={() => navigation.navigate("FlashcardEdit", {})}
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
            placeholder="Search decks by name…"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.sortRow}>
          {[
            { id: "recent", label: "Recent", icon: "time-outline" },
            { id: "name", label: "A–Z", icon: "text-outline" },
            { id: "cards", label: "Most cards", icon: "layers-outline" },
          ].map((opt) => {
            const active = sortBy === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSortBy(opt.id)}
                style={({ pressed }) => [
                  styles.sortChip,
                  {
                    backgroundColor: active ? colors.violetSoft : colors.bg,
                    borderColor: active ? colors.violet : colors.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name={opt.icon} size={12} color={active ? colors.violet : colors.textMuted} />
                <Text style={[styles.sortChipText, { color: active ? colors.violet : colors.textMuted }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Your collections</Text>
        <Text style={styles.sectionCount}>
          {filteredCollections.length}
          {filteredCollections.length !== collections.length ? ` of ${collections.length}` : ""}
        </Text>
      </View>
    </View>
  );

  const emptyComponent = (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.violetSoft }]}>
        <Ionicons name="folder-open-outline" size={36} color={colors.violet} />
      </View>
      <Text style={styles.emptyTitle}>
        {search.trim() ? "No matching collections" : "Create your first deck"}
      </Text>
      <Text style={styles.emptyText}>
        {search.trim()
          ? "Try a different search term."
          : "Name a collection above, or use Magic Import to generate cards instantly."}
      </Text>
      {!search.trim() ? (
        <View style={[styles.emptyActions, isWide && styles.emptyActionsWide]}>
          <Pressable
            onPress={() => navigation.navigate("MagicImport")}
            style={({ pressed }) => [
              styles.emptyPrimaryBtn,
              { backgroundColor: colors.violet, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.emptyPrimaryText}>Magic Import</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("FlashcardEdit", {})}
            style={({ pressed }) => [
              styles.emptySecondaryBtn,
              { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Ionicons name="create-outline" size={18} color={colors.text} />
            <Text style={[styles.emptySecondaryText, { color: colors.text }]}>Write a card</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (loading && collections.length === 0) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <View style={[styles.loadingOrb, { backgroundColor: colors.violetSoft }]}>
            <ActivityIndicator color={colors.violet} size="large" />
          </View>
          <Text style={styles.centerTitle}>Loading collections</Text>
          <Text style={styles.centerText}>Fetching your flashcard decks…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Modal visible={Boolean(editing)} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditing(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit deck</Text>
            {editing ? (
              <View
                style={[
                  styles.modalPreview,
                  { backgroundColor: deckAccent(editColor, colors).soft, borderColor: deckAccent(editColor, colors).color },
                ]}
              >
                <Ionicons name={deckAccent(editColor, colors).icon} size={18} color={deckAccent(editColor, colors).color} />
                <Text style={[styles.modalPreviewText, { color: colors.text }]} numberOfLines={1}>
                  {editName.trim() || editing.name}
                </Text>
              </View>
            ) : null}
            <Text style={styles.modalLabel}>Deck name</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="Collection name"
              placeholderTextColor={colors.textMuted}
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
            />
            <Text style={styles.modalLabel}>Deck color</Text>
            <View style={styles.colorRow}>
              {DECK_COLOR_IDS.map((id) => {
                const swatch = deckAccent(id, colors);
                const selected = editColor === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setEditColor(id)}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: swatch.soft, borderColor: selected ? swatch.color : colors.border },
                      selected && styles.colorSwatchSelected,
                    ]}
                  >
                    <View style={[styles.colorDot, { backgroundColor: swatch.color }]} />
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditing(null)} style={[styles.modalBtn, { borderColor: colors.border }]}>
                <Text style={[styles.modalBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitEdit}
                disabled={savingEdit || !editName.trim()}
                style={[styles.modalBtn, { backgroundColor: colors.tomato, opacity: savingEdit || !editName.trim() ? 0.6 : 1 }]}
              >
                {savingEdit ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnTextPrimary}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={Boolean(deleting)}
        title="Delete collection?"
        message={deleting ? `Delete "${deleting.name}" and all its cards? This cannot be undone.` : ""}
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        loading={deletingBusy}
        onConfirm={confirmDelete}
        onCancel={() => !deletingBusy && setDeleting(null)}
      />

      <FlatList
        data={filteredCollections}
        keyExtractor={(c) => c.id}
        renderItem={renderCollection}
        numColumns={columns}
        key={`collections-${columns}`}
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
      gap: 8,
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
    createCard: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
      marginBottom: SPACING.md,
    },
    createLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    createRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    createInput: {
      flex: 1,
      height: 40,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      fontSize: 14,
    },
    createBtn: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: RADIUS.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      flexShrink: 0,
    },
    createBtnText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 13,
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
      borderRadius: RADIUS.lg,
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
      ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
    },
    sortRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    sortChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    sortChipText: {
      fontSize: 11,
      fontWeight: "700",
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
    },
    sectionCount: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    columnWrap: {
      gap: SPACING.md,
      justifyContent: "flex-start",
    },
    collectionWrap: {
      flex: columns > 1 ? 1 : undefined,
      maxWidth: columns === 3 ? "32%" : columns === 2 ? "48.5%" : "100%",
      marginBottom: SPACING.md,
      minWidth: columns > 1 ? 240 : undefined,
    },
    collectionCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      overflow: "hidden",
      flexDirection: "row",
      minHeight: compact ? 210 : 220,
      ...(Platform.OS === "web"
        ? { boxShadow: "0 2px 8px rgba(0,0,0,0.06)", cursor: "pointer" }
        : null),
    },
    collectionAccent: {
      width: 5,
      alignSelf: "stretch",
    },
    collectionTint: {
      flex: 1,
      minWidth: 0,
    },
    collectionInner: {
      flex: 1,
      padding: SPACING.md,
      minWidth: 0,
      justifyContent: "space-between",
    },
    collectionTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    collectionIcon: {
      width: 38,
      height: 38,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    collectionName: {
      color: colors.text,
      fontSize: compact ? 15 : 16,
      fontWeight: "900",
      lineHeight: compact ? 20 : 22,
      letterSpacing: -0.2,
      marginBottom: 8,
    },
    deckMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: SPACING.sm,
    },
    cardCountPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    cardCountPillText: {
      fontSize: 11,
      fontWeight: "800",
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    statusPillText: {
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    deckPreview: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
      gap: 6,
      marginBottom: SPACING.sm,
    },
    previewLine: {
      height: 6,
      borderRadius: 3,
    },
    collectionActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexShrink: 0,
    },
    iconAction: {
      width: 32,
      height: 32,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
    },
    collectionFooter: {
      flexDirection: "column",
      gap: 8,
    },
    collectionFooterWide: {
      flexDirection: "row",
      alignItems: "center",
    },
    studyBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: RADIUS.lg,
      width: "100%",
    },
    addCardsBtn: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
    },
    studyBtnText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 13,
    },
    openBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      height: 38,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      width: "100%",
      ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
    },
    openText: {
      fontSize: 13,
      fontWeight: "700",
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    modalCard: {
      borderWidth: 1,
      borderBottomWidth: 0,
      borderTopLeftRadius: RADIUS.lg,
      borderTopRightRadius: RADIUS.lg,
      padding: SPACING.lg,
      paddingBottom: SPACING.xl,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: SPACING.md,
    },
    modalPreview: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
      marginBottom: SPACING.md,
    },
    modalPreviewText: {
      flex: 1,
      fontSize: 14,
      fontWeight: "800",
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: SPACING.md,
    },
    modalLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 6,
    },
    modalInput: {
      height: 44,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      fontSize: 15,
      marginBottom: SPACING.md,
    },
    colorRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
      flexWrap: "wrap",
    },
    colorSwatch: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.md,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    colorSwatchSelected: {
      transform: [{ scale: 1.05 }],
    },
    colorDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    modalActions: {
      flexDirection: "row",
      gap: SPACING.sm,
      justifyContent: "flex-end",
    },
    modalBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      minWidth: 88,
      alignItems: "center",
    },
    modalBtnText: {
      fontWeight: "700",
      fontSize: 14,
    },
    modalBtnTextPrimary: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 14,
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
    pressed: {
      opacity: 0.82,
    },
  });
