import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Pressable,
} from "react-native";
import { Screen } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import RichTextEditor from "../components/RichTextEditor";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function NoteEditScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { note } = route.params || {};
  const isEditing = Boolean(note);

  const [title, setTitle] = useState(note?.title || "");
  const [blocks, setBlocks] = useState(
    note?.contentJson?.length ? note.contentJson : [{ type: "text", text: "", marks: [] }]
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert("Missing title", "Give your note a title.");
      return;
    }
    const validBlocks = blocks.filter((b) => {
      if (b.type === "checklist") return b.text && b.text.trim();
      return b.text && b.text.trim();
    });
    if (validBlocks.length === 0) {
      Alert.alert("Empty note", "Write something in your note first.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await client.patch(`/notes/${note.id}`, { title: trimmedTitle, contentJson: validBlocks });
      } else {
        await client.post("/notes", { title: trimmedTitle, contentJson: validBlocks, source: "manual" });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert("Delete note?", "This will permanently remove this note.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await client.delete(`/notes/${note.id}`);
            navigation.goBack();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
          <Text style={styles.header}>{isEditing ? "Edit Note" : "Write a Note"}</Text>
          <Text style={styles.subtitle}>Create freeform notes with headings, lists, and more.</Text>

          <Text style={styles.label}>TITLE</Text>
          <Input value={title} onChangeText={setTitle} placeholder="e.g. Biology Chapter 4 Notes" />

          <Text style={styles.label}>CONTENT</Text>
          <RichTextEditor value={blocks} onChange={setBlocks} placeholder="Start writing your note…" />

          <View style={{ marginTop: 16 }}>
            <Button title={isEditing ? "Save changes" : "Save note"} onPress={save} loading={saving} />
          </View>

          {isEditing && (
            <Pressable onPress={remove} style={{ marginTop: 12, alignItems: "center" }}>
              <Text style={{ color: colors.tomato, fontWeight: "700", fontSize: 14 }}>Delete note</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 4 },
    subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 20 },
    label: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 8 },
  });
