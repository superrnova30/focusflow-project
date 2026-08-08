import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

const SOURCES = [
  { key: "topic", emoji: "💡", label: "Type a topic" },
  { key: "notes", emoji: "📝", label: "Paste notes" },
  { key: "file", emoji: "📄", label: "Upload PDF / DOCX / PPTX" },
];

export default function NoteImportScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);

  const [source, setSource] = useState("topic");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedNote, setGeneratedNote] = useState(null);
  const [saving, setSaving] = useState(false);
const [pdfName, setPdfName] = useState("");
  const [pdfBase64, setPdfBase64] = useState("");
  const [pdfType, setPdfType] = useState("pdf");

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
      Alert.alert("Missing topic", "Type a topic to generate notes from.");
      return;
    }
    if (source === "notes" && !notes.trim()) {
      Alert.alert("Missing notes", "Paste some notes to generate from.");
      return;
    }
if (source === "file" && !pdfBase64) {
      Alert.alert("Missing file", "Upload a PDF, DOCX, or PPTX to generate notes from.");
      return;
    }

    setGenerating(true);
    setGeneratedNote(null);
    try {
      let payload = {};

      if (source === "file") {
        // Upload document to materials endpoint first to extract text
        const upRes = await client.post("/materials/upload-document", {
          fileName: pdfName,
          fileType: pdfType,
          base64Content: pdfBase64,
          rawText: "",
        });
        payload = { topic: upRes.data.material.title, notes: upRes.data.material.rawText || "" };
      } else {
        payload = {
          topic: source === "topic" ? topic.trim() : undefined,
          notes: source === "notes" ? notes.trim() : undefined,
        };
      }

      const { data } = await client.post("/notes/magic-import", payload, { timeout: 120000 });
      setGeneratedNote(data.note);
    } catch (e) {
      Alert.alert("Import failed", e.message);
    } finally {
      setGenerating(false);
    }
  };

  const saveNote = async () => {
    if (!generatedNote) return;
    setSaving(true);
    try {
      await client.post("/notes", generatedNote);
      Alert.alert("Saved!", "Your AI-generated study notes have been saved.", [
        { text: "View", onPress: () => navigation.navigate("NoteView", { note: { ...generatedNote, id: "new" } }) },
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
      setGeneratedNote(null);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>Magic Import 🪄</Text>
        <Text style={styles.subtitle}>
          Generate well-structured study notes with AI. Choose a source below.
        </Text>

        {!generatedNote && (
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
                  <Text style={styles.mutedText}>The AI will extract the content and generate structured study notes.</Text>
                </>
              )}
            </Card>

            <View style={{ marginTop: 16 }}>
              <Button title={generating ? "Generating…" : "✨ Generate notes"} onPress={runImport} loading={generating} />
            </View>
            {generating && (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.violet} />
                <Text style={styles.loadingText}>AI is creating your structured study notes…</Text>
              </View>
            )}
          </>
        )}

        {generatedNote && !generating && (
          <View>
            <Card style={{ marginBottom: 16 }}>
              <Text style={styles.previewHeader}>Preview: {generatedNote.title}</Text>
              <Text style={styles.previewSource}>✨ AI-generated study notes</Text>
              <View style={styles.previewDivider} />

              {generatedNote.contentJson.map((block, index) => {
                if (block.type === "heading") {
                  return (
                    <Text key={index} style={[styles.previewHeading, { fontSize: block.level === 2 ? 18 : 16 }]}>
                      {block.text}
                    </Text>
                  );
                }
                if (block.type === "bullet" || block.type === "numbered") {
                  return (
                    <View key={index} style={styles.previewRow}>
                      <Text style={[styles.previewBullet, { color: colors.violet }]}>•</Text>
                      <Text style={styles.previewText}>{block.text}</Text>
                    </View>
                  );
                }
                if (block.type === "checklist") {
                  return (
                    <View key={index} style={styles.previewRow}>
                      <Text style={[styles.previewBullet, { color: colors.mint }]}>{block.checked ? "☑" : "☐"}</Text>
                      <Text style={[styles.previewText, block.checked && { textDecorationLine: "line-through" }]}>
                        {block.text}
                      </Text>
                    </View>
                  );
                }
                return <Text key={index} style={styles.previewText}>{block.text}</Text>;
              })}
            </Card>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title="Save notes" onPress={saveNote} loading={saving} />
              </View>
              <Pressable
                onPress={() => setGeneratedNote(null)}
                style={[styles.discardBtn, { borderColor: colors.border }]}
              >
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
    previewHeader: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 4 },
    previewSource: { color: colors.violet, fontSize: 12.5, fontWeight: "700", marginBottom: 8 },
    previewDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
    previewHeading: { color: colors.text, fontWeight: "700", marginTop: 12, marginBottom: 6 },
    previewRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
    previewBullet: { width: 20, fontSize: 15, fontWeight: "700", textAlign: "right", marginRight: 6 },
    previewText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, flex: 1, marginBottom: 4 },
    discardBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
    discardText: { fontWeight: "700", fontSize: 14 },
  });
