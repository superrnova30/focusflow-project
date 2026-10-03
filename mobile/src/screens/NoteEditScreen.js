import React, { useState, useMemo, useLayoutEffect } from "react";
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
import RichTextEditor from "../components/RichTextEditor";
import { useTheme } from "../context/ThemeContext";
import VisibilityPicker from "../components/VisibilityPicker";
import ConfirmDialog from "../components/ConfirmDialog";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

function defaultBlocks() {
  return [
    { type: "heading", level: 2, text: "" },
    { type: "text", text: "", marks: [] },
  ];
}

function normalizeBlocks(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return defaultBlocks();
  return raw.map((block) => {
    if (!block || typeof block !== "object") return { type: "text", text: "", marks: [] };
    const text = block.text != null ? String(block.text) : "";
    if (block.type === "heading") {
      return { type: "heading", level: block.level || 2, text };
    }
    if (block.type === "bullet" || block.type === "numbered") {
      return { type: block.type, text };
    }
    if (block.type === "checklist") {
      return { type: "checklist", checked: Boolean(block.checked), text };
    }
    return { type: "text", text, marks: Array.isArray(block.marks) ? block.marks : [] };
  });
}

export default function NoteEditScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const { note, draftNote } = route.params || {};
  const initial = note || draftNote;
  const isEditing = Boolean(note?.id);
  const fromImport = Boolean(draftNote && !note?.id);

  const [title, setTitle] = useState(initial?.title || "");
  const [blocks, setBlocks] = useState(() => normalizeBlocks(initial?.contentJson));
  const [isPublic, setIsPublic] = useState(Boolean(initial?.isPublic));
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savedNote, setSavedNote] = useState(null);

  const aiMeta = fromImport || note?.source === "ai" ? {
    aiSummary: initial?.aiSummary,
    aiKeyConcepts: initial?.aiKeyConcepts,
    aiImportantTerms: initial?.aiImportantTerms,
    aiStudyTips: initial?.aiStudyTips,
    aiLearningObjectives: initial?.aiLearningObjectives,
  } : {};

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: isEditing ? "Edit note" : fromImport ? "Review & save" : "Write your own",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Notes",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, isEditing, fromImport, colors.text, colors.bg]);

  const validBlocks = useMemo(
    () =>
      blocks.filter((b) => {
        if (b.type === "checklist") return b.text && b.text.trim();
        return b.text && b.text.trim();
      }),
    [blocks]
  );

  const canSave = title.trim().length > 0 && validBlocks.length > 0;

  const save = async () => {
    if (!canSave) {
      Alert.alert("Incomplete", "Add a title and at least one content block.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await client.patch(`/notes/${note.id}`, { title: title.trim(), contentJson: validBlocks, isPublic });
        navigation.goBack();
        return;
      }

      const payload = {
        title: title.trim(),
        contentJson: validBlocks,
        source: fromImport || note?.source === "ai" ? "ai" : "manual",
        isPublic,
        ...aiMeta,
      };
      const { data } = await client.post("/notes", payload);
      setSavedNote(data.note);
    } catch (e) {
      Alert.alert("Error", e.message || "Could not save note.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    setDeleting(true);
    try {
      await client.delete(`/notes/${note.id}`);
      setShowDeleteConfirm(false);
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e.message || "Could not delete note.");
    } finally {
      setDeleting(false);
    }
  };

  const addOutline = () => {
    setBlocks([
      { type: "heading", level: 2, text: "Key ideas" },
      { type: "bullet", text: "" },
      { type: "heading", level: 2, text: "Summary" },
      { type: "text", text: "", marks: [] },
    ]);
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.page}>
            <View style={styles.hero}>
              <View style={[styles.heroIcon, { backgroundColor: fromImport ? colors.violetSoft : colors.amberSoft }]}>
                <Ionicons
                  name={isEditing ? "pencil" : fromImport ? "sparkles" : "create-outline"}
                  size={24}
                  color={fromImport ? colors.violet : colors.amber}
                />
              </View>
              <Text style={styles.title}>
                {isEditing ? "Edit your note" : fromImport ? "Review imported note" : "Write your own"}
              </Text>
              <Text style={styles.subtitle}>
                {isEditing
                  ? "Update the title, content, or visibility of this note."
                  : fromImport
                    ? "Tweak the AI-generated content before saving it to your library."
                    : "Use headings, lists, and checklists to organize your study material."}
              </Text>
              {!isEditing ? (
                <View style={styles.stepRow}>
                  <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.stepNum, { color: colors.amber }]}>1</Text>
                    <Text style={styles.stepText}>Title</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                  <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.stepNum, { color: colors.violet }]}>2</Text>
                    <Text style={styles.stepText}>Content</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                  <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.stepNum, { color: colors.mint }]}>3</Text>
                    <Text style={styles.stepText}>Save</Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.panelLabel}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Biology Chapter 4 Notes"
                placeholderTextColor={colors.textMuted}
                style={[styles.titleInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
              />
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.contentHeader}>
                <Text style={styles.panelLabel}>Content</Text>
                {!fromImport && validBlocks.length <= 2 ? (
                  <Pressable onPress={addOutline} style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}>
                    <Ionicons name="list-outline" size={14} color={colors.amber} />
                    <Text style={[styles.outlineBtnText, { color: colors.amber }]}>Use outline</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.editorHint}>
                Tap + on any block to add headings, bullets, numbered lists, or checklists.
              </Text>
              <RichTextEditor value={blocks} onChange={setBlocks} placeholder="Start writing your note…" />
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.panelLabel}>Visibility</Text>
              <VisibilityPicker value={isPublic} onChange={setIsPublic} colors={colors} compact />
            </View>

            <View style={[styles.actions, isWide && styles.actionsWide]}>
              <Pressable
                onPress={save}
                disabled={saving || !canSave}
                style={({ pressed }) => [
                  styles.saveBtn,
                  {
                    backgroundColor: fromImport ? colors.violet : colors.amber,
                    opacity: saving || !canSave ? 0.55 : pressed ? 0.88 : 1,
                    flex: isWide ? 1 : undefined,
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.saveBtnText}>{isEditing ? "Save changes" : "Save note"}</Text>
                  </>
                )}
              </Pressable>
            </View>

            {isEditing ? (
              <Pressable
                onPress={() => setShowDeleteConfirm(true)}
                style={({ pressed }) => [styles.deleteBtn, { borderColor: colors.tomato, backgroundColor: colors.tomatoSoft }, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={16} color={colors.tomato} />
                <Text style={[styles.deleteBtnText, { color: colors.tomato }]}>Delete note</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Delete note?"
        message={note ? `Delete "${note.title}"? This cannot be undone.` : "This will permanently remove this note."}
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        loading={deleting}
        onConfirm={confirmRemove}
        onCancel={() => !deleting && setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        visible={Boolean(savedNote)}
        title="Note saved"
        message={savedNote ? `"${savedNote.title}" was added to your notes.` : ""}
        confirmText="View note"
        cancelText="Write another"
        onConfirm={() => {
          const saved = savedNote;
          setSavedNote(null);
          navigation.navigate("NoteView", { note: saved });
        }}
        onCancel={() => {
          setSavedNote(null);
          setTitle("");
          setBlocks(defaultBlocks());
          setIsPublic(false);
        }}
      />
    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: {
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xl * 2,
    },
    page: {
      width: "100%",
      maxWidth: isWide ? 720 : 520,
      alignSelf: "center",
    },
    hero: { marginBottom: SPACING.lg },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: RADIUS.lg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.md,
    },
    title: {
      color: colors.text,
      fontSize: compact ? 24 : 26,
      fontWeight: "900",
      letterSpacing: -0.3,
      marginBottom: 6,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 20,
      marginBottom: SPACING.md,
    },
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    stepPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    stepNum: { fontSize: 12, fontWeight: "900" },
    stepText: { color: colors.text, fontSize: 12, fontWeight: "700" },
    panel: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    panelLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    contentHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.sm,
    },
    outlineBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    outlineBtnText: { fontSize: 12, fontWeight: "800" },
    editorHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: SPACING.md,
    },
    titleInput: {
      height: 48,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      fontSize: 16,
      fontWeight: "700",
      marginTop: SPACING.sm,
    },
    actions: { marginBottom: SPACING.sm },
    actionsWide: { flexDirection: "row" },
    saveBtn: {
      height: 52,
      borderRadius: RADIUS.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
    deleteBtn: {
      height: 48,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    deleteBtnText: { fontWeight: "800", fontSize: 14 },
    pressed: { opacity: 0.82 },
  });
