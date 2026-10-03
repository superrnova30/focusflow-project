import React, { useState, useEffect, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Pressable,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { deckAccent, DECK_COLOR_IDS } from "../lib/deckColors";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

export default function FlashcardEditScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const { card, collectionId: presetCollectionId } = route.params || {};
  const isEditing = Boolean(card);

  const [front, setFront] = useState(card?.front || "");
  const [back, setBack] = useState(card?.back || "");
  const [saving, setSaving] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState(presetCollectionId || null);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckColor, setNewDeckColor] = useState("mint");
  const [creatingNew, setCreatingNew] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: isEditing ? "Edit card" : "Write your own",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: presetCollectionId ? "Deck" : "Collections",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, isEditing, presetCollectionId, colors.text, colors.bg]);

  useEffect(() => {
    if (isEditing) return;
    setLoadingDecks(true);
    client
      .get("/flashcards/collections")
      .then(({ data }) => {
        const list = data.collections || [];
        setCollections(list);
        if (presetCollectionId) {
          setSelectedCollectionId(presetCollectionId);
          setCreatingNew(false);
        } else if (list.length === 0) {
          setCreatingNew(true);
        } else if (!selectedCollectionId) {
          setSelectedCollectionId(list[0].id);
          setCreatingNew(false);
        }
      })
      .catch((e) => Alert.alert("Error", e.message))
      .finally(() => setLoadingDecks(false));
  }, [isEditing, presetCollectionId]);

  const selectedCollection = useMemo(
    () => collections.find((c) => c.id === selectedCollectionId) || null,
    [collections, selectedCollectionId]
  );

  const previewAccent = useMemo(() => {
    if (presetCollectionId && selectedCollection) return deckAccent(selectedCollection.color, colors);
    if (creatingNew) return deckAccent(newDeckColor, colors);
    if (selectedCollection) return deckAccent(selectedCollection.color, colors);
    return deckAccent("mint", colors);
  }, [presetCollectionId, selectedCollection, creatingNew, newDeckColor, colors]);

  const canSave = front.trim().length > 0 && back.trim().length > 0;

  const resolveTargetCollectionId = async () => {
    if (presetCollectionId) return presetCollectionId;
    if (creatingNew) {
      const name = newDeckName.trim();
      if (!name) {
        Alert.alert("Deck name required", "Enter a name for your new deck.");
        return null;
      }
      const { data } = await client.post("/flashcards/collections", { name, color: newDeckColor });
      return data.collection.id;
    }
    if (selectedCollectionId) return selectedCollectionId;
    Alert.alert("Choose a deck", "Select a deck or create a new one for this card.");
    return null;
  };

  const save = async () => {
    if (!canSave) {
      Alert.alert("Incomplete", "Please fill in both the front and back of the card.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await client.patch(`/flashcards/${card.id}`, { front: front.trim(), back: back.trim() });
        navigation.goBack();
        return;
      }

      const targetCollectionId = await resolveTargetCollectionId();
      if (!targetCollectionId) return;

      await client.post("/flashcards", {
        front: front.trim(),
        back: back.trim(),
        collectionId: targetCollectionId,
      });

      const deckName =
        creatingNew && newDeckName.trim()
          ? newDeckName.trim()
          : selectedCollection?.name || "Your deck";
      const deckColor =
        creatingNew ? newDeckColor : selectedCollection?.color || "violet";

      const info = { collectionId: targetCollectionId, name: deckName, color: deckColor };
      setSuccessInfo(info);

      Alert.alert("Card saved", `Your flashcard was added to "${deckName}".`, [
        {
          text: "View deck",
          onPress: () => {
            setSuccessInfo(null);
            navigation.navigate("FlashcardCollection", {
              collection: { id: info.collectionId, name: info.name, color: info.color },
            });
          },
        },
        { text: "Add another", onPress: () => handleAddAnother(info) },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddAnother = (info = successInfo) => {
    setFront("");
    setBack("");
    setSuccessInfo(null);
    if (creatingNew && info) {
      setCreatingNew(false);
      setNewDeckName("");
      client.get("/flashcards/collections").then(({ data }) => {
        const list = data.collections || [];
        setCollections(list);
        if (info?.collectionId) setSelectedCollectionId(info.collectionId);
      });
    }
  };

  const confirmRemove = async () => {
    setDeleting(true);
    try {
      await client.delete(`/flashcards/${card.id}`);
      setShowDeleteConfirm(false);
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loadingDecks) {
    return (
      <Screen>
        <View style={styles.center}>
          <View style={[styles.loadingIcon, { backgroundColor: colors.mintSoft }]}>
            <ActivityIndicator color={colors.mint} size="large" />
          </View>
          <Text style={styles.loadingTitle}>Loading decks</Text>
          <Text style={styles.muted}>Getting your collections ready…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.page}>
            {successInfo ? (
              <>
                <View style={[styles.successBanner, { backgroundColor: colors.mintSoft, borderColor: colors.mint }]}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.mint} />
                  <View style={styles.successCopy}>
                    <Text style={[styles.successTitle, { color: colors.text }]}>Card saved!</Text>
                    <Text style={styles.successMessage}>Added to "{successInfo.name}"</Text>
                  </View>
                </View>

                <View style={[styles.previewPanel, { backgroundColor: previewAccent.soft, borderColor: previewAccent.color }]}>
                  <View style={styles.previewHeader}>
                    <Ionicons name="layers-outline" size={14} color={previewAccent.color} />
                    <Text style={[styles.previewLabel, { color: previewAccent.color }]}>Saved card</Text>
                  </View>
                  <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={styles.previewFront} numberOfLines={3}>{front.trim()}</Text>
                    <View style={[styles.previewDivider, { backgroundColor: colors.border }]} />
                    <Text style={styles.previewBack} numberOfLines={4}>{back.trim()}</Text>
                  </View>
                </View>

                <View style={[styles.actions, isWide && styles.actionsWide]}>
                  <Pressable
                    onPress={() => {
                      navigation.navigate("FlashcardCollection", {
                        collection: {
                          id: successInfo.collectionId,
                          name: successInfo.name,
                          color: successInfo.color,
                        },
                      });
                      setSuccessInfo(null);
                    }}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: colors.mint, flex: isWide ? 1 : undefined },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="folder-open-outline" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>View deck</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleAddAnother()}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      { borderColor: colors.border, backgroundColor: colors.surface, flex: isWide ? 1 : undefined },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={colors.text} />
                    <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Add another</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
            <View style={styles.hero}>
              <View style={styles.heroRow}>
                <View style={[styles.heroIcon, { backgroundColor: colors.mintSoft }]}>
                  <Ionicons name={isEditing ? "create" : "create-outline"} size={18} color={colors.mint} />
                </View>
                <Text style={styles.subtitle} numberOfLines={isWide ? 2 : 3}>
                  {isEditing
                    ? "Update the question or answer on this card."
                    : "Pick a deck, write a clear question and answer, then save."}
                </Text>
              </View>
              {!isEditing ? (
                <View style={styles.stepRow}>
                  <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.stepNum, { color: colors.mint }]}>1</Text>
                    <Text style={styles.stepText}>Deck</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                  <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.stepNum, { color: colors.violet }]}>2</Text>
                    <Text style={styles.stepText}>Card</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                  <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.stepNum, { color: colors.amber }]}>3</Text>
                    <Text style={styles.stepText}>Save</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {!isEditing && !presetCollectionId ? (
              <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={styles.panelLabel}>Save to deck</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => {
                      setCreatingNew(true);
                      setSelectedCollectionId(null);
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: creatingNew ? colors.violet : colors.border,
                        backgroundColor: creatingNew ? colors.violetSoft : colors.bg,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="add-circle-outline" size={14} color={creatingNew ? colors.violet : colors.textMuted} />
                    <Text style={[styles.chipText, { color: creatingNew ? colors.violet : colors.textMuted }]}>New deck</Text>
                  </Pressable>
                  {collections.map((item) => {
                    const accent = deckAccent(item.color, colors);
                    const active = !creatingNew && selectedCollectionId === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          setCreatingNew(false);
                          setSelectedCollectionId(item.id);
                          setNewDeckName("");
                        }}
                        style={({ pressed }) => [
                          styles.chip,
                          {
                            borderColor: active ? accent.color : colors.border,
                            backgroundColor: active ? accent.soft : colors.bg,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.chipDot, { backgroundColor: accent.color }]} />
                        <Text style={[styles.chipText, { color: active ? accent.color : colors.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.chipMeta}>{item._count?.flashcards || 0}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {creatingNew ? (
                  <View style={styles.newDeckBlock}>
                    <TextInput
                      value={newDeckName}
                      onChangeText={setNewDeckName}
                      placeholder="Deck name, e.g. Biology Ch. 3"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.deckNameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                    />
                    <Text style={styles.colorLabel}>Color</Text>
                    <View style={styles.colorRow}>
                      {DECK_COLOR_IDS.map((id) => {
                        const swatch = deckAccent(id, colors);
                        const selected = newDeckColor === id;
                        return (
                          <Pressable
                            key={id}
                            onPress={() => setNewDeckColor(id)}
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
                  </View>
                ) : null}
              </View>
            ) : null}

            {!isEditing && presetCollectionId && selectedCollection ? (
              <View style={[styles.targetDeck, { backgroundColor: previewAccent.soft, borderColor: previewAccent.color }]}>
                <Ionicons name={previewAccent.icon} size={16} color={previewAccent.color} />
                <Text style={[styles.targetDeckText, { color: colors.text }]} numberOfLines={1}>
                  Saving to <Text style={styles.targetDeckName}>{selectedCollection.name}</Text>
                </Text>
              </View>
            ) : null}

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.panelLabel}>Flashcard</Text>

              <View style={[styles.fieldsRow, isWide && styles.fieldsRowWide]}>
                <View style={[styles.fieldCard, { borderColor: colors.violet, backgroundColor: colors.bg }]}>
                  <View style={styles.fieldHeader}>
                    <View style={[styles.fieldBadge, { backgroundColor: colors.violetSoft }]}>
                      <Text style={[styles.fieldBadgeText, { color: colors.violet }]}>Front</Text>
                    </View>
                    <Text style={styles.fieldHint}>Question</Text>
                  </View>
                  <TextInput
                    value={front}
                    onChangeText={setFront}
                    placeholder="e.g. What is photosynthesis?"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                    style={[styles.fieldInput, { color: colors.text }]}
                  />
                </View>

                {!isWide ? (
                  <View style={styles.connector}>
                    <View style={[styles.connectorLine, { backgroundColor: colors.border }]} />
                    <View style={[styles.connectorIcon, { backgroundColor: colors.mintSoft, borderColor: colors.mint }]}>
                      <Ionicons name="swap-vertical" size={14} color={colors.mint} />
                    </View>
                    <View style={[styles.connectorLine, { backgroundColor: colors.border }]} />
                  </View>
                ) : null}

                <View style={[styles.fieldCard, { borderColor: colors.mint, backgroundColor: colors.bg }]}>
                  <View style={styles.fieldHeader}>
                    <View style={[styles.fieldBadge, { backgroundColor: colors.mintSoft }]}>
                      <Text style={[styles.fieldBadgeText, { color: colors.mint }]}>Back</Text>
                    </View>
                    <Text style={styles.fieldHint}>Answer</Text>
                  </View>
                  <TextInput
                    value={back}
                    onChangeText={setBack}
                    placeholder="e.g. Plants convert sunlight into energy."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                    style={[styles.fieldInput, styles.fieldInputBack, { color: colors.text }]}
                  />
                </View>
              </View>
            </View>

            {(front.trim() || back.trim()) ? (
              <View style={[styles.previewPanel, { backgroundColor: previewAccent.soft, borderColor: previewAccent.color }]}>
                <View style={styles.previewHeader}>
                  <Ionicons name="eye-outline" size={14} color={previewAccent.color} />
                  <Text style={[styles.previewLabel, { color: previewAccent.color }]}>Live preview</Text>
                </View>
                <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.previewFront} numberOfLines={3}>
                    {front.trim() || "Front"}
                  </Text>
                  <View style={[styles.previewDivider, { backgroundColor: colors.border }]} />
                  <Text style={styles.previewBack} numberOfLines={4}>
                    {back.trim() || "Back"}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.actions, isWide && styles.actionsWide]}>
              <Pressable
                onPress={save}
                disabled={saving || !canSave}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.mint,
                    flex: isWide ? 1 : undefined,
                    opacity: saving || !canSave ? 0.55 : pressed ? 0.88 : 1,
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name={isEditing ? "checkmark-circle" : "add-circle"} size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{isEditing ? "Save changes" : "Add flashcard"}</Text>
                  </>
                )}
              </Pressable>

              {isEditing ? (
                <Pressable
                  onPress={() => setShowDeleteConfirm(true)}
                  style={({ pressed }) => [
                    styles.dangerBtn,
                    { borderColor: colors.tomato },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.tomato} />
                  <Text style={[styles.dangerBtnText, { color: colors.tomato }]}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Delete card?"
        message="This will permanently remove this flashcard."
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        loading={deleting}
        onConfirm={confirmRemove}
        onCancel={() => !deleting && setShowDeleteConfirm(false)}
      />
    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: { paddingBottom: SPACING.xl * 2 },
    page: {
      width: "100%",
      maxWidth: isWide ? 720 : 520,
      alignSelf: "center",
      paddingTop: SPACING.sm,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.lg,
      gap: SPACING.sm,
    },
    loadingIcon: {
      width: 64,
      height: 64,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    loadingTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
    },
    muted: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: "center",
    },
    hero: { marginBottom: SPACING.md },
    heroRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      marginBottom: SPACING.sm,
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
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    stepPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    stepNum: { fontSize: 11, fontWeight: "900" },
    stepText: { color: colors.text, fontSize: 11, fontWeight: "700" },
    panel: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    panelLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: SPACING.sm,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
      maxWidth: "100%",
    },
    chipDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      flexShrink: 0,
    },
    chipText: {
      fontSize: 12,
      fontWeight: "700",
      maxWidth: 120,
    },
    chipMeta: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "700",
    },
    newDeckBlock: {
      marginTop: SPACING.sm,
      gap: 8,
    },
    deckNameInput: {
      height: 44,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      fontSize: 14,
    },
    colorLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    colorRow: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    colorSwatch: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.md,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    colorSwatchSelected: {
      transform: [{ scale: 1.05 }],
    },
    colorDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    targetDeck: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: SPACING.md,
    },
    targetDeckText: {
      flex: 1,
      fontSize: 12.5,
      fontWeight: "600",
    },
    targetDeckName: {
      fontWeight: "800",
    },
    fieldsRow: {
      gap: 0,
    },
    fieldsRowWide: {
      flexDirection: "row",
      gap: SPACING.md,
      alignItems: "stretch",
    },
    fieldCard: {
      flex: isWide ? 1 : undefined,
      borderWidth: 1.5,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
    },
    fieldHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.sm,
      gap: 6,
    },
    fieldBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.pill,
    },
    fieldBadgeText: {
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    fieldHint: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
    },
    fieldInput: {
      fontSize: compact ? 14 : 15,
      lineHeight: 21,
      minHeight: compact ? 72 : 80,
      paddingVertical: 2,
      ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
    },
    fieldInputBack: {
      minHeight: compact ? 80 : 88,
    },
    connector: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 8,
      gap: 8,
    },
    connectorLine: {
      flex: 1,
      height: 1,
    },
    connectorIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    previewPanel: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    previewHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: SPACING.sm,
    },
    previewLabel: {
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    previewCard: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
    },
    previewFront: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "800",
      lineHeight: 21,
    },
    previewDivider: {
      height: 1,
      marginVertical: SPACING.sm,
    },
    previewBack: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    successBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    successCopy: { flex: 1, minWidth: 0 },
    successTitle: {
      fontSize: 15,
      fontWeight: "900",
      marginBottom: 2,
    },
    successMessage: {
      color: colors.textMuted,
      fontSize: 12.5,
    },
    actions: {
      gap: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    actionsWide: {
      flexDirection: "row",
      alignItems: "center",
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: RADIUS.lg,
      ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "800",
    },
    secondaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 44,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      paddingHorizontal: SPACING.lg,
      flex: isWide ? 1 : undefined,
    },
    secondaryBtnText: {
      fontWeight: "800",
      fontSize: 13,
    },
    dangerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 44,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      paddingHorizontal: SPACING.lg,
      ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
    },
    dangerBtnText: {
      fontSize: 13,
      fontWeight: "800",
    },
    pressed: { opacity: 0.85 },
  });
