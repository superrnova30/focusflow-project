import React, { useState, useCallback, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import VisibilityPicker, { VisibilityBadge } from "../components/VisibilityPicker";
import ConfirmDialog from "../components/ConfirmDialog";
import StudyDeckButton from "../components/StudyDeckButton";
import { useTheme } from "../context/ThemeContext";
import { deckAccent, DECK_COLOR_IDS } from "../lib/deckColors";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";
import { startDeckQuiz } from "../lib/publicStudy";

function StatPill({ icon, label, value, color, soft, colors, styles }) {
  return (
    <View style={[styles.statPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statPillIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={13} color={color} />
      </View>
      <View style={styles.statPillCopy}>
        <Text style={[styles.statPillValue, { color }]}>{value}</Text>
        <Text style={styles.statPillLabel}>{label}</Text>
      </View>
    </View>
  );
}

export default function FlashcardCollectionScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isLarge = width >= 1024;
  const compact = width < 390;
  const cardColumns = isLarge ? 3 : isWide ? 2 : 1;
  const styles = useMemo(
    () => createStyles(colors, isWide, isLarge, compact, cardColumns),
    [colors, isWide, isLarge, compact, cardColumns]
  );

  const initialCollection = route.params?.collection;
  const readOnlyParam = route.params?.readOnly;
  const collectionId = initialCollection?.id;
  const [collection, setCollection] = useState(initialCollection || null);
  const [isOwner, setIsOwner] = useState(!readOnlyParam);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [showDeleteDeck, setShowDeleteDeck] = useState(false);
  const [deletingDeck, setDeletingDeck] = useState(false);
  const [showEditDeck, setShowEditDeck] = useState(false);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("violet");
  const [savingEdit, setSavingEdit] = useState(false);
  const [quizBusy, setQuizBusy] = useState(false);
  const readOnly = readOnlyParam || !isOwner;

  const accent = deckAccent(collection?.color, colors);
  const hasCards = cards.length > 0;

  const fetchCollection = useCallback(async (silent = false) => {
    if (!collectionId) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await client.get(`/flashcards/collections/${collectionId}`);
      setCollection(data.collection);
      setIsOwner(Boolean(data.isOwner));
      setCards(data.collection.flashcards || []);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message || "Could not load collection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [collectionId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: collection?.name || "Deck",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: readOnly ? "Profile" : "Collections",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, collection?.name, colors.text, colors.bg, readOnly]);

  const updateVisibility = async (nextPublic) => {
    if (!collection || readOnly) return;
    setSavingVisibility(true);
    try {
      const { data } = await client.patch(`/flashcards/collections/${collection.id}`, { isPublic: nextPublic });
      setCollection(data.collection);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message || "Could not update visibility.");
    } finally {
      setSavingVisibility(false);
    }
  };

  const openEditDeck = () => {
    if (!collection) return;
    setEditName(collection.name);
    setEditColor(collection.color || "violet");
    setShowEditDeck(true);
  };

  const submitEditDeck = async () => {
    const name = editName.trim();
    if (!name || !collection) return;
    setSavingEdit(true);
    try {
      const { data } = await client.patch(`/flashcards/collections/${collection.id}`, {
        name,
        color: editColor,
      });
      setCollection(data.collection);
      setShowEditDeck(false);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message || "Could not update deck.");
    } finally {
      setSavingEdit(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchCollection(true);
    }, [fetchCollection])
  );

  const deleteCard = (card) => {
    Alert.alert("Delete card?", "This will permanently remove this flashcard.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await client.delete(`/flashcards/${card.id}`);
            await fetchCollection(true);
          } catch (e) {
            Alert.alert("Error", e.message || "Could not delete card.");
          }
        },
      },
    ]);
  };

  const confirmDeleteDeck = async () => {
    if (!collectionId) return;
    setDeletingDeck(true);
    try {
      await client.delete(`/flashcards/collections/${collectionId}`);
      setShowDeleteDeck(false);
      navigation.navigate("Flashcards");
    } catch (e) {
      Alert.alert("Error", e.message || "Could not delete collection.");
    } finally {
      setDeletingDeck(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchCollection(true);
  };

  const goStudy = () => {
    navigation.navigate("FlashcardStudyModes", {
      collection: { ...collection, flashcards: cards, cardCount: cards.length },
      collectionId,
    });
  };

  const goQuiz = () => {
    startDeckQuiz(navigation, { ...collection, flashcards: cards, cardCount: cards.length, _count: { flashcards: cards.length } }, {
      onStart: () => setQuizBusy(true),
      onFinish: () => setQuizBusy(false),
    });
  };

  const renderCard = ({ item, index }) => (
    <View style={styles.cardWrap}>
      <Pressable
        onPress={() => !readOnly && navigation.navigate("FlashcardEdit", { card: item, collectionId })}
        disabled={readOnly}
        style={({ pressed }) => [
          styles.flashcard,
          { backgroundColor: colors.surface, borderColor: hasCards ? accent.color + "33" : colors.border },
          !readOnly && pressed && styles.pressed,
        ]}
      >
        <View style={[styles.cardAccent, { backgroundColor: accent.color }]} />
        <View style={styles.cardInner}>
          <View style={styles.cardTop}>
            <View style={[styles.indexBadge, { backgroundColor: accent.soft }]}>
              <Text style={[styles.indexText, { color: accent.color }]}>{index + 1}</Text>
            </View>
            {!readOnly ? (
              <View style={styles.cardTopActions}>
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    navigation.navigate("FlashcardEdit", { card: item, collectionId });
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.cardIconBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="pencil-outline" size={15} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    deleteCard(item);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.cardIconBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.tomato} />
                </Pressable>
              </View>
            ) : (
              <VisibilityBadge isPublic colors={colors} />
            )}
          </View>

          <View style={[styles.qBlock, { borderColor: colors.violet + "44", backgroundColor: colors.bg }]}>
            <Text style={[styles.blockLabel, { color: colors.violet }]}>Front</Text>
            <Text style={styles.frontText} numberOfLines={4}>
              {item.front}
            </Text>
          </View>

          <View style={[styles.aBlock, { borderColor: colors.mint + "44", backgroundColor: colors.bg }]}>
            <Text style={[styles.blockLabel, { color: colors.mint }]}>Back</Text>
            <Text style={styles.backText} numberOfLines={4}>
              {item.back}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );

  const listHeader = (
    <View style={styles.page}>
      <View style={[styles.heroPanel, { backgroundColor: accent.soft + "66", borderColor: accent.color + "44" }]}>
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: colors.surface, borderColor: accent.color + "44" }]}>
            <Ionicons name={accent.icon} size={22} color={accent.color} />
          </View>
          {!readOnly ? (
            <Pressable onPress={openEditDeck} hitSlop={10} style={({ pressed }) => [styles.editDeckBtn, pressed && styles.pressed]}>
              <Ionicons name="pencil-outline" size={16} color={accent.color} />
              <Text style={[styles.editDeckText, { color: accent.color }]}>Edit deck</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.heroTitle} numberOfLines={2}>
          {collection?.name || "Deck"}
        </Text>
        <Text style={styles.heroSubtitle}>
          {readOnly
            ? `${cards.length} ${cards.length === 1 ? "card" : "cards"} shared publicly`
            : hasCards
              ? `${cards.length} ${cards.length === 1 ? "card" : "cards"} ready to study`
              : "Add cards to start studying this deck"}
        </Text>

        <View style={styles.heroBadges}>
          <VisibilityBadge isPublic={collection?.isPublic} colors={colors} />
          <View style={[styles.readyPill, { backgroundColor: hasCards ? colors.mintSoft : colors.border + "55" }]}>
            <Ionicons
              name={hasCards ? "checkmark-circle" : "ellipse-outline"}
              size={12}
              color={hasCards ? colors.mint : colors.textMuted}
            />
            <Text style={[styles.readyPillText, { color: hasCards ? colors.mint : colors.textMuted }]}>
              {hasCards ? "Ready" : "Empty"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatPill
          icon="layers-outline"
          label="Cards"
          value={cards.length}
          color={accent.color}
          soft={accent.soft}
          colors={colors}
          styles={styles}
        />
        <StatPill
          icon="school-outline"
          label="Modes"
          value="3"
          color={colors.violet}
          soft={colors.violetSoft}
          colors={colors}
          styles={styles}
        />
      </View>

      <StudyDeckButton
        onPress={goStudy}
        disabled={!hasCards}
        accentColor={accent.color}
        colors={colors}
        style={styles.studyDeckCta}
      />
      <Pressable
        onPress={goQuiz}
        disabled={!hasCards || quizBusy}
        style={({ pressed }) => [
          styles.quizCta,
          { borderColor: colors.violet, backgroundColor: colors.violetSoft },
          (!hasCards || quizBusy) && styles.btnDisabled,
          pressed && hasCards && styles.pressed,
        ]}
      >
        {quizBusy ? (
          <ActivityIndicator color={colors.violet} size="small" />
        ) : (
          <Ionicons name="help-circle-outline" size={18} color={colors.violet} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.quizCtaTitle, { color: colors.violet }]}>Take quiz</Text>
          <Text style={styles.quizCtaHint}>
            {readOnly ? "Quiz yourself on this shared deck" : "Quick multiple-choice from these cards"}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={colors.violet} />
      </Pressable>

      {!readOnly ? (
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, backgroundColor: colors.surface },
              pressed && styles.pressed,
            ]}
            onPress={() => navigation.navigate("FlashcardEdit", { collectionId })}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Add card</Text>
          </Pressable>
        </View>
      ) : null}

      {!readOnly ? (
        <>
          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.panelLabel}>Visibility</Text>
            {savingVisibility ? (
              <ActivityIndicator color={colors.violet} style={{ marginVertical: SPACING.sm }} />
            ) : (
              <VisibilityPicker value={Boolean(collection?.isPublic)} onChange={updateVisibility} colors={colors} minimal />
            )}
          </View>

          <View style={styles.quickRow}>
            <Pressable
              style={({ pressed }) => [
                styles.quickTile,
                { backgroundColor: colors.surface, borderColor: colors.violet },
                pressed && styles.pressed,
              ]}
              onPress={() => navigation.navigate("MagicImport", { collectionId, collectionName: collection?.name })}
            >
              <View style={[styles.quickIcon, { backgroundColor: colors.violetSoft }]}>
                <Ionicons name="sparkles" size={18} color={colors.violet} />
              </View>
              <View style={styles.quickCopy}>
                <Text style={styles.quickTitle}>Magic Import</Text>
                <Text style={styles.quickDesc} numberOfLines={2}>
                  Generate cards from a topic, notes, or file
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.violet} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.quickTile,
                { backgroundColor: colors.surface, borderColor: colors.mint },
                pressed && styles.pressed,
              ]}
              onPress={() => navigation.navigate("FlashcardEdit", { collectionId })}
            >
              <View style={[styles.quickIcon, { backgroundColor: colors.mintSoft }]}>
                <Ionicons name="create-outline" size={18} color={colors.mint} />
              </View>
              <View style={styles.quickCopy}>
                <Text style={styles.quickTitle}>Write your own</Text>
                <Text style={styles.quickDesc} numberOfLines={2}>
                  Craft a custom question and answer
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mint} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
            onPress={() => setShowDeleteDeck(true)}
          >
            <Ionicons name="trash-outline" size={16} color={colors.tomato} />
            <Text style={[styles.deleteLinkText, { color: colors.tomato }]}>Delete deck</Text>
          </Pressable>
        </>
      ) : null}

      <View style={styles.cardsSectionHeader}>
        <Text style={styles.sectionLabel}>Flashcards</Text>
        <Text style={styles.sectionCount}>{cards.length}</Text>
      </View>
    </View>
  );

  const emptyComponent = (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: accent.soft }]}>
        <Ionicons name="document-text-outline" size={32} color={accent.color} />
      </View>
      <Text style={styles.emptyTitle}>No cards yet</Text>
      <Text style={styles.emptyText}>
        {readOnly
          ? "This public deck does not have flashcards yet."
          : "Add a card manually or use Magic Import to fill this deck."}
      </Text>
      {!readOnly ? (
        <View style={[styles.emptyActions, isWide && styles.emptyActionsWide]}>
          <Pressable
            onPress={() => navigation.navigate("MagicImport", { collectionId, collectionName: collection?.name })}
            style={({ pressed }) => [styles.emptyPrimaryBtn, { backgroundColor: colors.violet, opacity: pressed ? 0.88 : 1 }]}
          >
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.emptyPrimaryText}>Magic Import</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("FlashcardEdit", { collectionId })}
            style={({ pressed }) => [
              styles.emptySecondaryBtn,
              { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.text} />
            <Text style={[styles.emptySecondaryText, { color: colors.text }]}>Add card</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (loading && cards.length === 0) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <View style={[styles.loadingOrb, { backgroundColor: accent.soft }]}>
            <ActivityIndicator color={accent.color} size="large" />
          </View>
          <Text style={styles.centerTitle}>Loading deck</Text>
          <Text style={styles.centerText}>Fetching your flashcards…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Modal visible={showEditDeck} transparent animationType="slide" onRequestClose={() => setShowEditDeck(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowEditDeck(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit deck</Text>
            <View
              style={[
                styles.modalPreview,
                { backgroundColor: deckAccent(editColor, colors).soft, borderColor: deckAccent(editColor, colors).color },
              ]}
            >
              <Ionicons name={deckAccent(editColor, colors).icon} size={18} color={deckAccent(editColor, colors).color} />
              <Text style={styles.modalPreviewText} numberOfLines={1}>
                {editName.trim() || collection?.name}
              </Text>
            </View>
            <Text style={styles.modalLabel}>Deck name</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="Deck name"
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
              <Pressable onPress={() => setShowEditDeck(false)} style={[styles.modalBtn, { borderColor: colors.border }]}>
                <Text style={[styles.modalBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitEditDeck}
                disabled={savingEdit || !editName.trim()}
                style={[styles.modalBtn, { backgroundColor: accent.color, opacity: savingEdit || !editName.trim() ? 0.6 : 1 }]}
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
        visible={showDeleteDeck}
        title="Delete deck?"
        message={collection ? `Delete "${collection.name}" and all ${cards.length} card${cards.length === 1 ? "" : "s"}? This cannot be undone.` : ""}
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        loading={deletingDeck}
        onConfirm={confirmDeleteDeck}
        onCancel={() => !deletingDeck && setShowDeleteDeck(false)}
      />

      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        renderItem={renderCard}
        numColumns={cardColumns}
        key={`deck-cards-${cardColumns}`}
        columnWrapperStyle={cardColumns > 1 ? styles.columnWrap : undefined}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent.color} colors={[accent.color]} />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
      />
    </Screen>
  );
}

const createStyles = (colors, isWide, isLarge, compact, cardColumns) =>
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
    heroPanel: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.sm,
    },
    heroIcon: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    editDeckBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
    },
    editDeckText: {
      fontSize: 12,
      fontWeight: "800",
    },
    heroTitle: {
      color: colors.text,
      fontSize: compact ? 20 : 22,
      fontWeight: "900",
      letterSpacing: -0.3,
      marginBottom: 4,
    },
    heroSubtitle: {
      color: colors.textMuted,
      fontSize: compact ? 12.5 : 13,
      lineHeight: 18,
      fontWeight: "500",
    },
    heroBadges: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginTop: SPACING.sm,
    },
    readyPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    readyPillText: {
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    statsRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: SPACING.md,
    },
    statPill: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingVertical: 8,
      paddingHorizontal: 10,
      minHeight: 44,
    },
    statPillIcon: {
      width: 28,
      height: 28,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    statPillCopy: { flex: 1, minWidth: 0 },
    statPillValue: { fontSize: 15, fontWeight: "900", lineHeight: 18 },
    statPillLabel: {
      color: colors.textMuted,
      fontSize: 9.5,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    studyDeckCta: {
      marginBottom: SPACING.sm,
    },
    quizCta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 54,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: SPACING.sm,
    },
    quizCtaTitle: {
      fontSize: 14,
      fontWeight: "900",
    },
    quizCtaHint: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
      marginTop: 1,
    },
    actionRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: SPACING.sm,
    },
    secondaryBtn: {
      flex: 1,
      height: 38,
      borderRadius: RADIUS.md,
      borderWidth: 1.5,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    secondaryBtnText: {
      fontWeight: "800",
      fontSize: 13,
    },
    btnDisabled: {
      opacity: 0.45,
    },
    panel: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: SPACING.sm,
    },
    panelLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    quickRow: {
      flexDirection: isWide ? "row" : "column",
      gap: 8,
      marginBottom: SPACING.md,
    },
    quickTile: {
      flex: isWide ? 1 : undefined,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      gap: SPACING.sm,
      minHeight: 72,
    },
    quickIcon: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    quickCopy: {
      flex: 1,
      minWidth: 0,
    },
    quickTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "800",
    },
    quickDesc: {
      color: colors.textMuted,
      fontSize: 11.5,
      lineHeight: 16,
      marginTop: 2,
    },
    deleteLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    deleteLinkText: {
      fontSize: 13,
      fontWeight: "700",
    },
    cardsSectionHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: SPACING.sm,
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
    cardWrap: {
      flex: cardColumns > 1 ? 1 : undefined,
      maxWidth: cardColumns === 3 ? "32%" : cardColumns === 2 ? "48.5%" : "100%",
      marginBottom: SPACING.md,
      minWidth: cardColumns > 1 ? 220 : undefined,
    },
    flashcard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      overflow: "hidden",
      flexDirection: "row",
      ...(Platform.OS === "web" ? { boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" } : null),
    },
    cardAccent: {
      width: 4,
      alignSelf: "stretch",
    },
    cardInner: {
      flex: 1,
      padding: SPACING.md,
      minWidth: 0,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.sm,
    },
    indexBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: RADIUS.pill,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    indexText: {
      fontSize: 12,
      fontWeight: "900",
    },
    cardTopActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    cardIconBtn: {
      width: 32,
      height: 32,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    qBlock: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
      marginBottom: 8,
    },
    aBlock: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
    },
    blockLabel: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    frontText: {
      color: colors.text,
      fontSize: compact ? 14 : 15,
      fontWeight: "700",
      lineHeight: 21,
    },
    backText: {
      color: colors.textMuted,
      fontSize: compact ? 13 : 14,
      lineHeight: 20,
    },
    emptyState: {
      alignItems: "center",
      paddingVertical: SPACING.xl,
      paddingHorizontal: SPACING.lg,
      maxWidth: 400,
      alignSelf: "center",
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.md,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "900",
      marginBottom: 6,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
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
      height: 46,
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
      height: 46,
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
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: SPACING.sm,
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
      color: colors.text,
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
    pressed: {
      opacity: 0.82,
    },
  });
