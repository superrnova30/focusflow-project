import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

const SOURCES = [
  { key: "topic", emoji: "💡", label: "Type a topic" },
  { key: "notes", emoji: "📝", label: "Paste notes" },
  { key: "file", emoji: "📄", label: "Upload PDF / DOCX / PPTX" },
];

export default function CardImportScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);

  const [source, setSource] = useState("topic");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedCards, setGeneratedCards] = useState([]);
  const [collections, setCollections] = useState([]);
  const [collectionId, setCollectionId] = useState(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfName, setPdfName] = useState("");
  const [pdfBase64, setPdfBase64] = useState("");
  const [pdfType, setPdfType] = useState("pdf");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const { data } = await client.get("/flashcards/collections");
          setCollections(data.collections || []);
        } catch (e) {
          // non-fatal
        }
      })();
    }, [])
  );

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
        copyToCacheDirectory: true,
      });
      if (result.type === "cancel") return;
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const size = asset.size || 0;
      if (size > 10 * 1024 * 1024) {
        Alert.alert("Too large", "Files larger than 10 MB are not supported.");
        return;
      }

      // Infer the file type from the extension.
      const ext = (asset.name || "").split(".").pop().toLowerCase();
      const typeMap = { pdf: "pdf", docx: "docx", pptx: "pptx" };
      const fileType = typeMap[ext] || "pdf";

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      setPdfName(asset.name || `uploaded.${fileType}`);
      setPdfBase64(base64);
      setPdfType(fileType);
    } catch (e) {
      Alert.alert("Error", "Unable to read the file.");
    }
  };

  const runImport = async () => {
    if (source === "topic" && !topic.trim()) {
      Alert.alert("Missing topic", "Type a topic to generate flashcards from.");
      return;
    }
if (source === "notes" && !notes.trim()) {
      Alert.alert("Missing notes", "Paste some notes to generate flashcards from.");
      return;
    }
    if (source === "file" && !pdfBase64) {
      Alert.alert("Missing file", "Upload a PDF, DOCX, or PPTX to generate flashcards from.");
      return;
    }

    setGenerating(true);
    setGeneratedCards([]);
    try {
      let payload = {};

      if (source === "file") {
        const upRes = await client.post("/materials/upload-document", {
          fileName: pdfName,
          fileType: pdfType,
          base64Content: pdfBase64,
          rawText: "",
        });
        payload = {
          topic: upRes.data.material.title,
          notes: upRes.data.material.rawText || "",
        };
      } else {
        payload = {
          topic: source === "topic" ? topic.trim() : undefined,
          notes: source === "notes" ? notes.trim() : undefined,
        };
      }

      const { data } = await client.post("/flashcards/magic-import", payload, { timeout: 120000 });
      const cards = (data.flashcards || []).filter((c) => c.front && c.back);
      if (cards.length === 0) {
        Alert.alert("No cards", "The AI didn't return any flashcards. Please try again.");
        return;
      }
      setGeneratedCards(cards);
    } catch (e) {
      Alert.alert("Import failed", e.message);
    } finally {
      setGenerating(false);
    }
  };

  const updateCard = (index, field, text) => {
    const next = [...generatedCards];
    next[index] = { ...next[index], [field]: text };
    setGeneratedCards(next);
  };

  const removeCard = (index) => {
    const next = [...generatedCards];
    next.splice(index, 1);
    setGeneratedCards(next);
  };

  const saveCards = async () => {
    const valid = generatedCards.filter((c) => c.front.trim() && c.back.trim());
    if (valid.length === 0) {
      Alert.alert("No cards", "Add at least one valid card to save.");
      return;
    }

    setSaving(true);
    try {
      const collectionName =
        newCollectionName.trim() ||
        (collectionId ? collections.find((c) => c.id === collectionId)?.name : null);

      // First save the flashcards directly via magic-import to persist into a
      // collection (reuse existing endpoint for creation).
      const { data } = await client.post("/flashcards/magic-import", {
        topic: valid[0].front,
        notes: valid.map((c) => `Q: ${c.front}\nA: ${c.back}`).join("\n"),
        collectionName: collectionName || undefined,
      });

      const targetName = data.collection?.name || collectionName || "Your cards";
      Alert.alert("Cards saved! 🎉", `${valid.length} flashcards saved into "${targetName}".`, [
        {
          text: "View",
          onPress: () => {
            if (data.collection) {
              navigation.navigate("FlashcardCollection", { collection: data.collection });
            } else {
              navigation.goBack();
            }
          },
        },
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const targetCollectionName =
    newCollectionName.trim() ||
    (collectionId ? collections.find((c) => c.id === collectionId)?.name : null);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>Magic Import 🪄</Text>
        <Text style={styles.subtitle}>
          Generate high-quality flashcards with AI, review them, then save to a deck.
        </Text>

        {generatedCards.length === 0 && (
          <>
            <Text style={styles.label}>SOURCE</Text>
            <View style={styles.sourceGrid}>
              {SOURCES.map((s) => {
                const active = source === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setSource(s.key)}
                    style={[styles.sourceBtn, active && { borderColor: colors.violet, backgroundColor: colors.violetSoft }]}
                  >
                    <Text style={styles.sourceEmoji}>{s.emoji}</Text>
                    <Text style={[styles.sourceLabel, active && { color: colors.violet }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Card style={{ marginTop: 12 }}>
              {source === "topic" && (
                <>
                  <Text style={styles.label}>TOPIC</Text>
                  <Input value={topic} onChangeText={setTopic} placeholder="e.g. Photosynthesis, WW2 causes, Calculus limits…" />
                </>
              )}

              {source === "notes" && (
                <>
                  <Text style={styles.label}>PASTE YOUR NOTES</Text>
                  <Input
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Paste your lecture notes or study text here…"
                    multiline
                    numberOfLines={8}
                    style={{ minHeight: 160, textAlignVertical: "top" }}
                  />
                </>
              )}

              {source === "file" && (
                <>
                  <Text style={styles.label}>UPLOAD A DOCUMENT</Text>
                  <Pressable onPress={pickFile} style={[styles.pdfButton, { borderColor: colors.violet }]}>
                    <Text style={styles.pdfButtonText}>{pdfName ? `✓ ${pdfName}` : "Choose PDF, DOCX, or PPTX…"}</Text>
                  </Pressable>
                  <Text style={styles.mutedText}>The AI will extract the content and turn the most important ideas into cards.</Text>
                </>
              )}
            </Card>

            <View style={{ marginTop: 16 }}>
              <Button title={generating ? "Generating…" : "✨ Generate flashcards"} onPress={runImport} loading={generating} />
            </View>
            {generating && (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.violet} />
                <Text style={styles.loadingText}>AI is extracting the most important concepts…</Text>
              </View>
            )}
          </>
        )}

        {generatedCards.length > 0 && (
          <View>
            <Text style={styles.label}>REVIEW YOUR CARDS ({generatedCards.length})</Text>
            {generatedCards.map((card, index) => (
              <Card key={index} style={{ marginBottom: 10 }}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardIndex, { color: colors.violet }]}>#{index + 1}</Text>
                  <Pressable onPress={() => removeCard(index)} hitSlop={8}>
                    <Text style={[styles.removeText, { color: colors.tomato }]}>Remove</Text>
                  </Pressable>
                </View>
                <Text style={styles.fieldLabel}>FRONT</Text>
                <Input value={card.front} onChangeText={(t) => updateCard(index, "front", t)} multiline style={{ minHeight: 60, textAlignVertical: "top" }} />
                <Text style={styles.fieldLabel}>BACK</Text>
                <Input value={card.back} onChangeText={(t) => updateCard(index, "back", t)} multiline style={{ minHeight: 60, textAlignVertical: "top" }} />
              </Card>
            ))}

            <Text style={styles.label}>SAVE TO DECK</Text>
            <View style={styles.collectionWrap}>
              <Pressable
                onPress={() => {
                  setNewCollectionName("");
                  setCollectionId(null);
                }}
                style={[styles.collectionChip, !targetCollectionName && { borderColor: colors.violet, backgroundColor: colors.violetSoft }]}
              >
                <Text style={[styles.collectionChipText, !targetCollectionName && { color: colors.violet }]}>✨ New deck</Text>
              </Pressable>
              {collections.map((c) => {
                const active = targetCollectionName === c.name;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCollectionId(c.id);
                      setNewCollectionName("");
                    }}
                    style={[styles.collectionChip, active && { borderColor: colors.mint, backgroundColor: colors.mintSoft }]}
                  >
                    <Text style={[styles.collectionChipText, active && { color: colors.mint }]}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            {!targetCollectionName && (
              <Input
                value={newCollectionName}
                onChangeText={setNewCollectionName}
                placeholder="New deck name (e.g. Chemistry Ch. 4)"
                style={{ marginTop: 10 }}
              />
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Button title={saving ? "Saving…" : "Save cards"} onPress={saveCards} loading={saving} />
              </View>
              <Pressable onPress={() => setGeneratedCards([])} style={[styles.discardBtn, { borderColor: colors.border }]}>
                <Text style={[styles.discardText, { color: colors.textMuted }]}>Discard</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 4 },
    subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
    label: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 10 },
    sourceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    sourceBtn: {
      width: "48%", borderWidth: 1, borderColor: colors.border, borderRadius: 14,
      paddingVertical: 14, alignItems: "center", backgroundColor: colors.surface,
    },
    sourceEmoji: { fontSize: 24, marginBottom: 6 },
    sourceLabel: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
    mutedText: { color: colors.textMuted, fontSize: 12.5, marginTop: 8, lineHeight: 18 },
    pdfButton: {
      borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center",
      backgroundColor: colors.surface,
    },
    pdfButtonText: { color: colors.violet, fontWeight: "700", fontSize: 14 },
    loadingBox: { alignItems: "center", marginTop: 16 },
    loadingText: { color: colors.textMuted, fontSize: 12.5, marginTop: 8, textAlign: "center" },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    cardIndex: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
    removeText: { fontSize: 12.5, fontWeight: "700" },
    fieldLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
    collectionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    collectionChip: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
      backgroundColor: colors.surface,
    },
    collectionChipText: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
    discardBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
    discardText: { fontWeight: "700", fontSize: 14 },
  });
