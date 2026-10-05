import React, { useState, useMemo, useLayoutEffect, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import VisibilityPicker from "../components/VisibilityPicker";
import NoteContentPreview from "../components/NoteContentPreview";
import client from "../api/client";
import { handleLimitError } from "../lib/upgradePrompt";
import { RADIUS, SPACING } from "../theme/theme";

function normalizeImportedNote(note) {
  if (!note) return null;
  let contentJson = note.contentJson;
  if (typeof contentJson === "string") {
    try {
      contentJson = JSON.parse(contentJson);
    } catch {
      contentJson = [];
    }
  }
  return {
    ...note,
    contentJson: Array.isArray(contentJson) ? contentJson : [],
  };
}

async function readDocumentBase64(asset) {
  if (asset.base64) return asset.base64;

  if (Platform.OS === "web" && typeof FileReader !== "undefined") {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const response = await fetch(asset.uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const SOURCES = [
  { key: "topic", icon: "bulb-outline", label: "Topic", desc: "Generate from a subject" },
  { key: "notes", icon: "document-text-outline", label: "Paste notes", desc: "Turn raw text into a guide" },
  { key: "file", icon: "cloud-upload-outline", label: "Upload file", desc: "PDF, DOCX, or PPTX" },
];

export default function NoteImportScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const [source, setSource] = useState("topic");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [progressHint, setProgressHint] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [importedNote, setImportedNote] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const elapsedTimer = useRef(null);

  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [fileType, setFileType] = useState("pdf");

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Magic Import",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Notes",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg]);

  useEffect(() => {
    if (!generating) {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
      return undefined;
    }
    setElapsedSec(0);
    elapsedTimer.current = setInterval(() => {
      setElapsedSec((sec) => sec + 1);
    }, 1000);
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
  }, [generating]);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ],
        copyToCacheDirectory: true,
        base64: true,
      });
      if (result.canceled || result.type === "cancel") return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      if ((asset.size || 0) > 10 * 1024 * 1024) {
        Alert.alert("File too large", "Please choose a file under 10 MB.");
        return;
      }

      const ext = (asset.name || "").split(".").pop().toLowerCase();
      const typeMap = { pdf: "pdf", docx: "docx", pptx: "pptx" };
      const nextType = typeMap[ext] || "pdf";

      const base64 = await readDocumentBase64(asset);

      setFileName(asset.name || `uploaded.${nextType}`);
      setFileBase64(base64);
      setFileType(nextType);
    } catch {
      Alert.alert("Error", "Could not read that file. Try again.");
    }
  };

  const runImport = async () => {
    if (source === "topic" && !topic.trim()) {
      Alert.alert("Missing topic", "Enter a topic to generate notes from.");
      return;
    }
    if (source === "notes" && !notes.trim()) {
      Alert.alert("Missing notes", "Paste some notes to generate from.");
      return;
    }
    if (source === "file" && !fileBase64) {
      Alert.alert("Missing file", "Upload a PDF, DOCX, or PPTX first.");
      return;
    }

    setGenerating(true);
    setImportedNote(null);
    setProgressStep(source === "file" ? "Reading your document" : "Preparing your source");
    setProgressHint(source === "file" ? "Extracting text and starting the note generator." : "Sending your topic to FocusFlow AI.");
    try {
      let payload = { isPublic };
      if (source === "file") {
        payload = {
          ...payload,
          topic: fileName.replace(/\.[^.]+$/, "") || "Imported document",
          fileName,
          fileType,
          base64Content: fileBase64,
        };
      } else {
        payload = {
          ...payload,
          topic: source === "topic" ? topic.trim() : undefined,
          notes: source === "notes" ? notes.trim() : undefined,
        };
      }

      setProgressStep("Generating study notes");
      setProgressHint("AI is structuring a concise study guide. This is usually quick.");
      const { data } = await client.post("/notes/magic-import", payload, { timeout: 75000 });
      setProgressStep("Saving to Your Notes");
      setProgressHint("Almost done — adding the note to your library.");
      if (!data.saved || !data.note?.id) {
        Alert.alert("Import incomplete", "Notes were generated but could not be saved. Please try again.");
        return;
      }

      const savedNote = normalizeImportedNote(data.note);
      const successMessage =
        data.message || `"${savedNote.title}" has been generated and added to Your Notes.`;

      setImportedNote(savedNote);
      setImportMessage(successMessage);

      Alert.alert(
        "Notes generated successfully",
        successMessage,
        [
          {
            text: "View note",
            onPress: () => navigation.navigate("NoteView", { note: savedNote }),
          },
          {
            text: "Go to Your Notes",
            onPress: () =>
              navigation.navigate("Notes", {
                highlightNoteId: savedNote.id,
                importedNoteTitle: savedNote.title,
              }),
          },
        ]
      );
    } catch (e) {
      if (!handleLimitError(navigation, e)) {
        Alert.alert("Import failed", e.message || "Could not import notes.");
      }
    } finally {
      setGenerating(false);
    }
  };

  const goToYourNotes = () => {
    if (!importedNote) return;
    navigation.navigate("Notes", {
      highlightNoteId: importedNote.id,
      importedNoteTitle: importedNote.title,
    });
  };

  const editImportedNote = () => {
    if (!importedNote) return;
    navigation.navigate("NoteEdit", { note: importedNote });
  };

  const resetFlow = () => {
    setImportedNote(null);
    setImportMessage("");
    setTopic("");
    setNotes("");
    setFileName("");
    setFileBase64("");
    setIsPublic(false);
  };

  const blockCount = importedNote?.contentJson?.length || 0;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.page}>
            <View style={styles.hero}>
              <View style={[styles.heroIcon, { backgroundColor: colors.violetSoft }]}>
                <Ionicons name="sparkles" size={26} color={colors.violet} />
              </View>
              <Text style={styles.title}>Magic Import</Text>
              <Text style={styles.subtitle}>
                Turn a topic, pasted notes, or uploaded document into structured study notes with AI.
              </Text>
              {!importedNote ? (
                <View style={styles.stepRow}>
                  <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.stepNum, { color: colors.violet }]}>1</Text>
                    <Text style={styles.stepText}>Choose source</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                  <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.stepNum, { color: colors.mint }]}>2</Text>
                    <Text style={styles.stepText}>Import</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {!importedNote ? (
              <>
                <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.panelLabel}>Source</Text>
                  <View style={[styles.sourceGrid, isWide && styles.sourceGridWide]}>
                    {SOURCES.map((item) => {
                      const active = source === item.key;
                      return (
                        <Pressable
                          key={item.key}
                          onPress={() => !generating && setSource(item.key)}
                          disabled={generating}
                          style={({ pressed }) => [
                            styles.sourceTile,
                            isWide && styles.sourceTileWide,
                            {
                              borderColor: active ? colors.violet : colors.border,
                              backgroundColor: active ? colors.violetSoft : colors.bg,
                            },
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={[styles.sourceIcon, { backgroundColor: active ? colors.surface : colors.surface }]}>
                            <Ionicons name={item.icon} size={20} color={active ? colors.violet : colors.textMuted} />
                          </View>
                          <Text style={[styles.sourceTitle, { color: active ? colors.text : colors.textMuted }]}>{item.label}</Text>
                          <Text style={styles.sourceDesc}>{item.desc}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.panelLabel}>
                    {source === "topic" ? "Topic" : source === "notes" ? "Your notes" : "Document"}
                  </Text>

                  {source === "topic" ? (
                    <TextInput
                      value={topic}
                      onChangeText={setTopic}
                      editable={!generating}
                      placeholder="e.g. Photosynthesis, WW2 causes, Calculus limits…"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                    />
                  ) : null}

                  {source === "notes" ? (
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      editable={!generating}
                      placeholder="Paste lecture notes, textbook excerpts, or study text here…"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      textAlignVertical="top"
                      style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                    />
                  ) : null}

                  {source === "file" ? (
                    <>
                      <Pressable
                        onPress={pickFile}
                        disabled={generating}
                        style={({ pressed }) => [
                          styles.filePicker,
                          { borderColor: colors.violet, backgroundColor: colors.violetSoft },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name={fileName ? "checkmark-circle" : "document-attach-outline"} size={22} color={colors.violet} />
                        <View style={styles.fileCopy}>
                          <Text style={[styles.fileTitle, { color: colors.text }]}>
                            {fileName || "Choose PDF, DOCX, or PPTX"}
                          </Text>
                          <Text style={styles.fileHint}>Max 10 MB · AI extracts text and builds your guide</Text>
                        </View>
                      </Pressable>
                    </>
                  ) : null}
                </View>

                <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.panelLabel}>Visibility</Text>
                  <VisibilityPicker value={isPublic} onChange={setIsPublic} colors={colors} compact />
                </View>

                <Pressable
                  onPress={runImport}
                  disabled={generating}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: colors.violet, opacity: generating ? 0.65 : pressed ? 0.88 : 1 },
                  ]}
                >
                  {generating ? (
                    <>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.primaryBtnText}>Importing…</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={20} color="#fff" />
                      <Text style={styles.primaryBtnText}>Import notes</Text>
                    </>
                  )}
                </Pressable>

                {generating ? (
                  <View style={[styles.progressCard, { backgroundColor: colors.violetSoft, borderColor: colors.violet }]}>
                    <View style={styles.progressHeader}>
                      <ActivityIndicator color={colors.violet} />
                      <Text style={[styles.progressTitle, { color: colors.text }]}>{progressStep || "Importing notes"}</Text>
                    </View>
                    <Text style={styles.progressHint}>{progressHint}</Text>
                    <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: colors.violet,
                            width: `${Math.min(92, 18 + elapsedSec * 12)}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressMeta}>
                      {elapsedSec < 2 ? "Starting…" : `Working… ${elapsedSec}s`}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View style={[styles.successBanner, { backgroundColor: colors.mintSoft, borderColor: colors.mint }]}>
                  <View style={[styles.successIcon, { backgroundColor: colors.surface }]}>
                    <Ionicons name="checkmark-circle" size={28} color={colors.mint} />
                  </View>
                  <View style={styles.successCopy}>
                    <Text style={[styles.successTitle, { color: colors.text }]}>Notes generated successfully!</Text>
                    <Text style={styles.successMessage}>{importMessage}</Text>
                    <Text style={styles.successMeta} numberOfLines={2}>
                      "{importedNote.title}" is now in Your Notes.
                    </Text>
                  </View>
                </View>

                <View style={[styles.previewHeader, { backgroundColor: colors.violetSoft, borderColor: colors.violet }]}>
                  <View style={[styles.previewBadge, { backgroundColor: colors.surface }]}>
                    <Ionicons name="sparkles" size={16} color={colors.violet} />
                    <Text style={[styles.previewBadgeText, { color: colors.violet }]}>Imported note</Text>
                  </View>
                  <Text style={styles.previewTitle} numberOfLines={2}>{importedNote.title}</Text>
                  <Text style={styles.previewMeta}>{blockCount} content blocks · Saved automatically</Text>
                </View>

                <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <NoteContentPreview blocks={importedNote.contentJson || []} />
                </View>

                <View style={[styles.actions, isWide && styles.actionsWide]}>
                  <Pressable
                    onPress={goToYourNotes}
                    style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.mint, flex: isWide ? 1 : undefined }, pressed && styles.pressed]}
                  >
                    <Ionicons name="journal-outline" size={20} color="#fff" />
                    <Text style={styles.primaryBtnText}>Go to Your Notes</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => navigation.navigate("NoteView", { note: importedNote })}
                    style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}
                  >
                    <Ionicons name="eye-outline" size={18} color={colors.text} />
                    <Text style={[styles.secondaryBtnText, { color: colors.text }]}>View note</Text>
                  </Pressable>
                </View>

                <Pressable onPress={editImportedNote} style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}>
                  <Text style={[styles.linkBtnText, { color: colors.violet }]}>Edit imported note</Text>
                </Pressable>

                <Pressable onPress={resetFlow} style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}>
                  <Text style={[styles.linkBtnText, { color: colors.textMuted }]}>Import another</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    scroll: { paddingBottom: SPACING.xl * 2 },
    page: {
      width: "100%",
      maxWidth: isWide ? 720 : 520,
      alignSelf: "center",
      paddingTop: SPACING.md,
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
      marginBottom: SPACING.md,
    },
    sourceGrid: { gap: SPACING.sm },
    sourceGridWide: { flexDirection: "row", flexWrap: "wrap" },
    sourceTile: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      minHeight: 96,
    },
    sourceTileWide: {
      width: "32%",
      flexGrow: 1,
    },
    sourceIcon: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    sourceTitle: { fontSize: 14, fontWeight: "800", marginBottom: 4 },
    sourceDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
    input: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      fontSize: 15,
    },
    textInput: { height: 48 },
    textArea: {
      minHeight: compact ? 140 : 180,
      paddingTop: 14,
      paddingBottom: 14,
      lineHeight: 22,
    },
    filePicker: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
    },
    fileCopy: { flex: 1, minWidth: 0 },
    fileTitle: { fontSize: 15, fontWeight: "800", marginBottom: 4 },
    fileHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 52,
      borderRadius: RADIUS.lg,
      marginBottom: SPACING.sm,
    },
    primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    secondaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      paddingHorizontal: SPACING.lg,
    },
    secondaryBtnText: { fontWeight: "800", fontSize: 14 },
    actions: { gap: SPACING.sm, marginBottom: SPACING.sm },
    actionsWide: { flexDirection: "row", alignItems: "center" },
    linkBtn: { alignItems: "center", paddingVertical: SPACING.sm },
    linkBtnText: { fontSize: 13, fontWeight: "700" },
    loadingBox: { alignItems: "center", marginTop: SPACING.md, gap: 4 },
    loadingText: { color: colors.text, fontSize: 14, fontWeight: "700" },
    loadingSub: { color: colors.textMuted, fontSize: 12 },
    progressCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginTop: SPACING.md,
    },
    progressHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
    },
    progressTitle: { flex: 1, fontSize: 15, fontWeight: "900" },
    progressHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 8,
    },
    progressFill: { height: "100%", borderRadius: 4 },
    progressMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    previewHeader: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    previewBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: RADIUS.pill,
      marginBottom: SPACING.sm,
    },
    previewBadgeText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    previewTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.3,
      marginBottom: 4,
    },
    previewMeta: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600" },
    successBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: SPACING.md,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    successIcon: {
      width: 48,
      height: 48,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
    },
    successCopy: { flex: 1, minWidth: 0 },
    successTitle: {
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 4,
    },
    successMessage: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 4,
    },
    successMeta: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    pressed: { opacity: 0.85 },
  });
