import React, { useState, useCallback, useMemo, useLayoutEffect } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { deckAccent } from "../lib/deckColors";
import client from "../api/client";
import { handleLimitError } from "../lib/upgradePrompt";
import { RADIUS, SPACING } from "../theme/theme";

const SOURCES = [
  { key: "topic", icon: "bulb-outline", label: "Topic", desc: "From a subject" },
  { key: "notes", icon: "document-text-outline", label: "Paste", desc: "From raw text" },
  { key: "studyPack", icon: "library-outline", label: "Study pack", desc: "Existing material" },
  { key: "file", icon: "cloud-upload-outline", label: "Upload", desc: "PDF, DOCX, PPTX" },
];

async function readDocumentBase64(asset) {
  if (asset.base64) return asset.base64;

  const response = await fetch(asset.uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function MagicImportScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const presetCollectionId = route.params?.collectionId;
  const presetCollectionName = route.params?.collectionName;

  const [source, setSource] = useState("topic");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [materials, setMaterials] = useState([]);
  const [materialId, setMaterialId] = useState(null);
  const [collections, setCollections] = useState([]);
  const [collectionId, setCollectionId] = useState(presetCollectionId || null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingNew, setCreatingNew] = useState(!presetCollectionId);
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [fileType, setFileType] = useState("pdf");
  const [generating, setGenerating] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Magic Import",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Collections",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [matRes, collRes] = await Promise.all([
            client.get("/materials"),
            client.get("/flashcards/collections"),
          ]);
          setMaterials(matRes.data.materials || []);
          setCollections(collRes.data.collections || []);
        } catch (e) {
          Alert.alert("Error", e.message || "Could not load data.");
        }
      })();
    }, [])
  );

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

  const targetName =
    newCollectionName.trim() ||
    (collectionId ? collections.find((c) => c.id === collectionId)?.name : null) ||
    presetCollectionName;

  const showImportSuccess = (data) => {
    const count = data.flashcards?.length || data.savedCount || 0;
    const deckName = data.collection?.name || targetName || "Your deck";
    const message = `${count} flashcard${count === 1 ? "" : "s"} generated and saved to "${deckName}".`;

    setImportResult({ ...data, deckName, count, message });

    Alert.alert("Import successful", message, [
      {
        text: "View deck",
        onPress: () => {
          if (data.collection) {
            navigation.navigate("FlashcardCollection", { collection: data.collection });
          } else {
            navigation.navigate("Flashcards");
          }
        },
      },
      {
        text: "All collections",
        onPress: () => navigation.navigate("Flashcards"),
      },
    ]);
  };

  const runImport = async () => {
    const trimmedTopic = topic.trim();
    const trimmedNotes = notes.trim();

    if (source === "topic" && !trimmedTopic) {
      Alert.alert("Missing topic", "Enter a topic to generate flashcards from.");
      return;
    }
    if (source === "notes" && !trimmedNotes) {
      Alert.alert("Missing notes", "Paste some notes to generate flashcards from.");
      return;
    }
    if (source === "studyPack" && !materialId) {
      Alert.alert("Missing study pack", "Pick a study pack to generate flashcards from.");
      return;
    }
    if (source === "file" && !fileBase64) {
      Alert.alert("Missing file", "Upload a PDF, DOCX, or PPTX first.");
      return;
    }
    if (!collectionId && !newCollectionName.trim()) {
      Alert.alert("Choose a deck", "Select an existing collection or name a new one.");
      return;
    }

    setGenerating(true);
    setImportResult(null);
    try {
      let payload = {
        collectionId: collectionId || undefined,
        collectionName: !collectionId && newCollectionName.trim() ? newCollectionName.trim() : undefined,
      };

      if (source === "file") {
        const upRes = await client.post("/materials/extract-text", {
          fileName,
          fileType,
          base64Content: fileBase64,
          rawText: "",
        });
        payload.topic = upRes.data.title || fileName.replace(/\.[^.]+$/, "");
        payload.notes = upRes.data.rawText?.trim() || undefined;
        if (!payload.notes && !payload.topic) {
          Alert.alert("Could not read file", "No text could be extracted. Try pasted notes instead.");
          return;
        }
      } else if (source === "studyPack") {
        payload.materialId = materialId;
      } else {
        payload.topic = source === "topic" ? trimmedTopic : undefined;
        payload.notes = source === "notes" ? trimmedNotes : undefined;
      }

      const { data } = await client.post("/flashcards/magic-import", payload, { timeout: 120000 });
      const count = data.flashcards?.length || 0;
      if (count === 0) {
        Alert.alert("No cards", "The AI didn't return any flashcards. Please try again.");
        return;
      }

      showImportSuccess(data);
    } catch (e) {
      if (!handleLimitError(navigation, e)) {
        Alert.alert("Import failed", e.message || "Could not generate flashcards.");
      }
    } finally {
      setGenerating(false);
    }
  };

  const resetFlow = () => {
    setImportResult(null);
    setTopic("");
    setNotes("");
    setFileName("");
    setFileBase64("");
    setMaterialId(null);
    if (!presetCollectionId) {
      setCollectionId(null);
      setNewCollectionName("");
      setCreatingNew(true);
    }
  };

  const previewCards = importResult?.flashcards?.slice(0, 4) || [];

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.page}>
            {!importResult ? (
              <>
                <View style={styles.hero}>
                  <View style={styles.heroRow}>
                    <View style={[styles.heroIcon, { backgroundColor: colors.violetSoft }]}>
                      <Ionicons name="sparkles" size={18} color={colors.violet} />
                    </View>
                    <Text style={styles.subtitle} numberOfLines={isWide ? 2 : 3}>
                      Turn a topic, notes, study pack, or document into flashcards with AI.
                    </Text>
                  </View>
                  <View style={styles.stepRow}>
                    <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.stepNum, { color: colors.violet }]}>1</Text>
                      <Text style={styles.stepText}>Source</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                    <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.stepNum, { color: colors.mint }]}>2</Text>
                      <Text style={styles.stepText}>Deck</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                    <View style={[styles.stepPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.stepNum, { color: colors.amber }]}>3</Text>
                      <Text style={styles.stepText}>Generate</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.panelLabel}>Source</Text>
                  <View style={[styles.sourceGrid, isWide && styles.sourceGridWide]}>
                    {SOURCES.map((item) => {
                      const active = source === item.key;
                      return (
                        <Pressable
                          key={item.key}
                          onPress={() => setSource(item.key)}
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
                          <Ionicons name={item.icon} size={18} color={active ? colors.violet : colors.textMuted} />
                          <Text style={[styles.sourceTitle, { color: active ? colors.text : colors.textMuted }]}>
                            {item.label}
                          </Text>
                          <Text style={styles.sourceDesc}>{item.desc}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.panelLabel}>
                    {source === "topic"
                      ? "Topic"
                      : source === "notes"
                        ? "Your notes"
                        : source === "studyPack"
                          ? "Study pack"
                          : "Document"}
                  </Text>

                  {source === "topic" ? (
                    <TextInput
                      value={topic}
                      onChangeText={setTopic}
                      placeholder="e.g. Photosynthesis, WW2 causes…"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                    />
                  ) : null}

                  {source === "notes" ? (
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Paste lecture notes or study text here…"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      textAlignVertical="top"
                      style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                    />
                  ) : null}

                  {source === "studyPack" ? (
                    materials.length === 0 ? (
                      <Text style={styles.hintText}>No study packs yet. Generate one from the Study tab first.</Text>
                    ) : (
                      <View style={styles.materialList}>
                        {materials.map((m) => {
                          const active = materialId === m.id;
                          return (
                            <Pressable
                              key={m.id}
                              onPress={() => setMaterialId(m.id)}
                              style={({ pressed }) => [
                                styles.materialRow,
                                {
                                  borderColor: active ? colors.violet : colors.border,
                                  backgroundColor: active ? colors.violetSoft : colors.bg,
                                },
                                pressed && styles.pressed,
                              ]}
                            >
                              <View style={[styles.materialIcon, { backgroundColor: active ? colors.surface : colors.surface }]}>
                                <Ionicons name="library-outline" size={16} color={active ? colors.violet : colors.textMuted} />
                              </View>
                              <View style={styles.materialCopy}>
                                <Text style={[styles.materialTitle, { color: colors.text }]} numberOfLines={1}>
                                  {m.title}
                                </Text>
                                <Text style={styles.materialMeta}>
                                  {m.flashcards?.length || 0} cards · {m.quizzes?.length || 0} quiz
                                </Text>
                              </View>
                              {active ? <Ionicons name="checkmark-circle" size={18} color={colors.violet} /> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    )
                  ) : null}

                  {source === "file" ? (
                    <Pressable
                      onPress={pickFile}
                      style={({ pressed }) => [
                        styles.filePicker,
                        { borderColor: colors.violet, backgroundColor: colors.violetSoft },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name={fileName ? "checkmark-circle" : "document-attach-outline"} size={20} color={colors.violet} />
                      <View style={styles.fileCopy}>
                        <Text style={[styles.fileTitle, { color: colors.text }]}>
                          {fileName || "Choose PDF, DOCX, or PPTX"}
                        </Text>
                        <Text style={styles.fileHint}>Max 10 MB · AI extracts key concepts</Text>
                      </View>
                    </Pressable>
                  ) : null}
                </View>

                <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.panelLabel}>Save to deck</Text>
                  {presetCollectionName ? (
                    <View style={[styles.presetBanner, { backgroundColor: colors.mintSoft, borderColor: colors.mint }]}>
                      <Ionicons name="folder-open" size={16} color={colors.mint} />
                      <Text style={[styles.presetText, { color: colors.text }]} numberOfLines={1}>
                        Adding to "{presetCollectionName}"
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.chipRow}>
                    <Pressable
                      onPress={() => {
                        setCreatingNew(true);
                        setCollectionId(null);
                        setNewCollectionName("");
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
                    {collections.map((c) => {
                      const accent = deckAccent(c.color, colors);
                      const active = collectionId === c.id;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => {
                            setCreatingNew(false);
                            setCollectionId(c.id);
                            setNewCollectionName("");
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
                            {c.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {creatingNew && !presetCollectionId ? (
                    <TextInput
                      value={newCollectionName}
                      onChangeText={setNewCollectionName}
                      placeholder="New deck name (e.g. Biology Ch. 4)"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, styles.textInput, styles.deckInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                    />
                  ) : null}
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
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Generate flashcards</Text>
                    </>
                  )}
                </Pressable>

                {generating ? (
                  <View style={styles.loadingBox}>
                    <Text style={styles.loadingText}>AI is extracting key concepts…</Text>
                    <Text style={styles.loadingSub}>This may take up to a minute.</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View style={[styles.successBanner, { backgroundColor: colors.mintSoft, borderColor: colors.mint }]}>
                  <View style={[styles.successIcon, { backgroundColor: colors.surface }]}>
                    <Ionicons name="checkmark-circle" size={26} color={colors.mint} />
                  </View>
                  <View style={styles.successCopy}>
                    <Text style={[styles.successTitle, { color: colors.text }]}>Import successful!</Text>
                    <Text style={styles.successMessage}>{importResult.message}</Text>
                  </View>
                </View>

                <View style={[styles.previewHeader, { backgroundColor: colors.violetSoft, borderColor: colors.violet }]}>
                  <View style={[styles.previewBadge, { backgroundColor: colors.surface }]}>
                    <Ionicons name="layers-outline" size={14} color={colors.violet} />
                    <Text style={[styles.previewBadgeText, { color: colors.violet }]}>
                      {importResult.count} cards saved
                    </Text>
                  </View>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {importResult.deckName}
                  </Text>
                </View>

                {previewCards.length > 0 ? (
                  <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={styles.panelLabel}>Preview</Text>
                    {previewCards.map((card, index) => (
                      <View key={index} style={[styles.cardPreview, { borderColor: colors.border, backgroundColor: colors.bg }]}>
                        <Text style={[styles.cardFront, { color: colors.text }]} numberOfLines={2}>
                          {card.front}
                        </Text>
                        <Text style={styles.cardBack} numberOfLines={2}>
                          {card.back}
                        </Text>
                      </View>
                    ))}
                    {importResult.count > previewCards.length ? (
                      <Text style={styles.moreCards}>+{importResult.count - previewCards.length} more cards</Text>
                    ) : null}
                  </View>
                ) : null}

                <View style={[styles.actions, isWide && styles.actionsWide]}>
                  <Pressable
                    onPress={() => {
                      if (importResult.collection) {
                        navigation.navigate("FlashcardCollection", { collection: importResult.collection });
                      } else {
                        navigation.navigate("Flashcards");
                      }
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
                    onPress={() => navigation.navigate("Flashcards")}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="albums-outline" size={16} color={colors.text} />
                    <Text style={[styles.secondaryBtnText, { color: colors.text }]}>All collections</Text>
                  </Pressable>
                </View>

                <Pressable onPress={resetFlow} style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}>
                  <Text style={[styles.linkBtnText, { color: colors.violet }]}>Import again</Text>
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
    flex: { flex: 1 },
    scroll: { paddingBottom: SPACING.xl * 2 },
    page: {
      width: "100%",
      maxWidth: isWide ? 720 : 520,
      alignSelf: "center",
      paddingTop: SPACING.sm,
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
    sourceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    sourceGridWide: {
      flexWrap: "nowrap",
    },
    sourceTile: {
      width: compact ? "48%" : "47.5%",
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingVertical: 10,
      paddingHorizontal: 10,
      alignItems: "flex-start",
      gap: 4,
      minHeight: 72,
    },
    sourceTileWide: {
      flex: 1,
      width: undefined,
    },
    sourceTitle: {
      fontSize: 13,
      fontWeight: "800",
    },
    sourceDesc: {
      color: colors.textMuted,
      fontSize: 10.5,
      lineHeight: 14,
    },
    input: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      fontSize: 14,
    },
    textInput: { height: 44 },
    textArea: {
      minHeight: compact ? 120 : 140,
      paddingTop: 12,
      paddingBottom: 12,
      lineHeight: 20,
    },
    deckInput: { marginTop: SPACING.sm },
    hintText: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 18,
    },
    materialList: { gap: 8 },
    materialRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
    },
    materialIcon: {
      width: 32,
      height: 32,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    materialCopy: { flex: 1, minWidth: 0 },
    materialTitle: { fontSize: 13, fontWeight: "800" },
    materialMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    filePicker: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
    },
    fileCopy: { flex: 1, minWidth: 0 },
    fileTitle: { fontSize: 14, fontWeight: "800", marginBottom: 2 },
    fileHint: { color: colors.textMuted, fontSize: 11.5 },
    presetBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: SPACING.sm,
    },
    presetText: { flex: 1, fontSize: 12.5, fontWeight: "700" },
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
      maxWidth: 140,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: RADIUS.lg,
      marginBottom: SPACING.sm,
    },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    secondaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 44,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      paddingHorizontal: SPACING.lg,
    },
    secondaryBtnText: { fontWeight: "800", fontSize: 13 },
    loadingBox: { alignItems: "center", marginTop: SPACING.sm, gap: 4 },
    loadingText: { color: colors.text, fontSize: 13, fontWeight: "700" },
    loadingSub: { color: colors.textMuted, fontSize: 11.5 },
    successBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: SPACING.sm,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    successIcon: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
    },
    successCopy: { flex: 1, minWidth: 0 },
    successTitle: { fontSize: 16, fontWeight: "900", marginBottom: 4 },
    successMessage: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
    previewHeader: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    previewBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: RADIUS.pill,
      marginBottom: SPACING.sm,
    },
    previewBadgeText: { fontSize: 10.5, fontWeight: "800", textTransform: "uppercase" },
    previewTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: -0.2,
    },
    cardPreview: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
      marginBottom: 8,
    },
    cardFront: { fontSize: 13, fontWeight: "800", marginBottom: 4 },
    cardBack: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
    moreCards: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 4,
    },
    actions: { gap: SPACING.sm, marginBottom: SPACING.sm },
    actionsWide: { flexDirection: "row", alignItems: "center" },
    linkBtn: { alignItems: "center", paddingVertical: SPACING.sm },
    linkBtnText: { fontSize: 13, fontWeight: "700" },
    pressed: { opacity: 0.85 },
  });
