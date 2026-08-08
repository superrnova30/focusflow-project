import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

const SOURCES = [
  { key: "topic", emoji: "💡", label: "Typed topic" },
  { key: "notes", emoji: "📝", label: "Pasted notes" },
  { key: "studyPack", emoji: "📚", label: "AI study pack" },
  { key: "pdf", emoji: "📄", label: "PDF document" },
];

export default function MagicImportScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
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
  const [pdfName, setPdfName] = useState("");
  const [pdfBase64, setPdfBase64] = useState("");
  const [generating, setGenerating] = useState(false);

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
          Alert.alert("Error", e.message);
        }
      })();
    }, [])
  );

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
      });
      if (result.type === "cancel") return;
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const size = asset.size || 0;
      if (size > 5 * 1024 * 1024) {
        Alert.alert("Too large", "PDFs larger than 5 MB are not supported.");
        return;
      }

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      setPdfName(asset.name || "uploaded.pdf");
      setPdfBase64(base64);
    } catch (e) {
      Alert.alert("Error", "Unable to read the PDF file.");
    }
  };

  const runImport = async () => {
    const trimmedTopic = topic.trim();
    const trimmedNotes = notes.trim();

    if (source === "topic" && !trimmedTopic) {
      Alert.alert("Missing topic", "Type a topic to generate flashcards from.");
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
    if (source === "pdf" && !pdfBase64) {
      Alert.alert("Missing PDF", "Upload a PDF to generate flashcards from.");
      return;
    }

    setGenerating(true);
    try {
      const payload = {
        topic: source === "topic" ? trimmedTopic : undefined,
        notes: source === "notes" ? trimmedNotes : undefined,
        materialId: source === "studyPack" ? materialId : undefined,
        collectionName:
          newCollectionName.trim() ||
          (collectionId ? collections.find((c) => c.id === collectionId)?.name : undefined),
      };

      // For PDFs: upload to the existing study-pack endpoint first, then
      // pull its AI-generated flashcards.
      if (source === "pdf") {
        const upRes = await client.post("/materials/upload-pdf", {
          fileName: pdfName,
          fileType: "pdf",
          base64Content: pdfBase64,
          rawText: "",
        });
        payload.materialId = upRes.data.material.id;
        payload.topic = undefined;
        payload.notes = undefined;
      }

      const { data } = await client.post("/flashcards/magic-import", payload, { timeout: 120000 });

      const targetCollectionName =
        data.collection?.name ||
        newCollectionName.trim() ||
        (collectionId ? collections.find((c) => c.id === collectionId)?.name : "Your cards");

      Alert.alert(
        "Magic Import complete ✨",
        `${data.flashcards.length} flashcards generated${data.collection ? ` into "${targetCollectionName}"` : ""}.`,
        [
          { text: "OK" },
          {
            text: "View collection",
            onPress: () => {
              if (data.collection) {
                navigation.navigate("FlashcardCollection", { collection: { id: data.collection.id, name: data.collection.name } });
              } else {
                navigation.navigate("Flashcards");
              }
            },
          },
        ]
      );

      setTopic("");
      setNotes("");
      setPdfName("");
      setPdfBase64("");
      setNewCollectionName("");
    } catch (e) {
      Alert.alert("Magic Import failed", e.message);
    } finally {
      setGenerating(false);
    }
  };

  const targetCollectionName =
    newCollectionName.trim() ||
    (collectionId ? collections.find((c) => c.id === collectionId)?.name : null) ||
    presetCollectionName;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>Magic Import 🪄</Text>
        <Text style={styles.subtitle}>
          Automatically generate high-quality flashcards from any learning content.
        </Text>

        {/* Source selector */}
        <Text style={styles.label}>WHAT WOULD YOU LIKE TO CONVERT?</Text>
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

        {/* Source content */}
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

          {source === "studyPack" && (
            <>
              <Text style={styles.label}>SELECT A STUDY PACK</Text>
              {materials.length === 0 ? (
                <Text style={styles.mutedText}>No study packs yet. Generate one from the Study tab first.</Text>
              ) : (
                materials.map((m) => {
                  const active = materialId === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setMaterialId(m.id)}
                      style={[styles.materialRow, active && { borderColor: colors.violet, backgroundColor: colors.violetSoft }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.materialTitle}>{m.title}</Text>
                        <Text style={styles.materialMeta}>
                          {m.flashcards?.length || 0} cards · {m.quizzes?.length || 0} quiz
                        </Text>
                      </View>
                      {active && <Text style={[styles.materialMeta, { color: colors.violet, fontWeight: "700" }]}>✓</Text>}
                    </Pressable>
                  );
                })
              )}
            </>
          )}

          {source === "pdf" && (
            <>
              <Text style={styles.label}>UPLOAD A PDF</Text>
              <Pressable onPress={pickPdf} style={[styles.pdfButton, { borderColor: colors.violet }]}>
                <Text style={styles.pdfButtonText}>{pdfName ? `✓ ${pdfName}` : "Choose PDF file…"}</Text>
              </Pressable>
              <Text style={styles.mutedText}>The AI will extract the content and turn the most important ideas into cards.</Text>
            </>
          )}
        </Card>

        {/* Target collection */}
        <Text style={[styles.label, { marginTop: 16 }]}>SAVE TO</Text>
        <View style={styles.collectionWrap}>
          <Pressable
            onPress={() => {
              setNewCollectionName("");
              setCollectionId(null);
            }}
            style={[styles.collectionChip, !targetCollectionName && { borderColor: colors.violet, backgroundColor: colors.violetSoft }]}
          >
            <Text style={[styles.collectionChipText, !targetCollectionName && { color: colors.violet }]}>✨ New collection</Text>
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
            placeholder="New collection name (e.g. Chemistry Ch. 4)"
            style={{ marginTop: 10 }}
          />
        )}

        <View style={{ marginTop: 12 }}>
          <Button title={generating ? "Generating…" : "✨ Generate flashcards"} onPress={runImport} loading={generating} />
        </View>
        {generating && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.violet} />
            <Text style={styles.loadingText}>AI is extracting the most important concepts…</Text>
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
    materialRow: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12,
      marginBottom: 8, flexDirection: "row", alignItems: "center",
    },
    materialTitle: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
    materialMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
    pdfButton: {
      borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center",
      backgroundColor: colors.surface,
    },
    pdfButtonText: { color: colors.violet, fontWeight: "700", fontSize: 14 },
    collectionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    collectionChip: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
      backgroundColor: colors.surface,
    },
    collectionChipText: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
    loadingBox: { alignItems: "center", marginTop: 16 },
    loadingText: { color: colors.textMuted, fontSize: 12.5, marginTop: 8, textAlign: "center" },
  });

