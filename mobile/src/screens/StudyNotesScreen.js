import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function StudyNotesScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const [notes, setNotes] = useState([]);

  const fetchNotes = useCallback(async () => {
    try {
      const { data } = await client.get("/notes");
      setNotes(data.notes || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
    }, [fetchNotes])
  );

  const deleteNote = (note) => {
    Alert.alert("Delete note?", `Delete "${note.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await client.delete(`/notes/${note.id}`);
            await fetchNotes();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const renderNote = ({ item }) => {
    const blockCount = Array.isArray(item.contentJson) ? item.contentJson.length : 0;
    return (
      <Card style={{ marginBottom: 10 }}>
        <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate("NoteView", { note: item })}>
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: item.source === "ai" ? colors.violetSoft : colors.amberSoft }]}>
              <Text style={styles.iconEmoji}>{item.source === "ai" ? "✨" : "📝"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.noteTitle}>{item.title}</Text>
              <Text style={styles.noteMeta}>
                {item.source === "ai" ? "AI generated" : "Manual"} · {blockCount} blocks
              </Text>
            </View>
            <Text style={styles.openText}>Open →</Text>
          </View>
        </Pressable>
        <View style={styles.cardActions}>
          <Pressable onPress={() => navigation.navigate("NoteEdit", { note: item })} style={{ marginRight: 16 }}>
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => deleteNote(item)}>
            <Text style={[styles.actionText, { color: colors.tomato }]}>Delete</Text>
          </Pressable>
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={renderNote}
        ListHeaderComponent={
          <>
            <Text style={styles.header}>My Notes</Text>
            <Text style={styles.subtitle}>
              Capture ideas, lecture content, and study guides — write your own or generate with AI.
            </Text>

            <View style={styles.quickRow}>
              <Pressable style={styles.quickBtn} onPress={() => navigation.navigate("NoteImport")}>
                <Text style={styles.quickBtnEmoji}>🪄</Text>
                <Text style={styles.quickBtnText}>Magic Import</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => navigation.navigate("NoteEdit", {})}>
                <Text style={styles.quickBtnEmoji}>✍️</Text>
                <Text style={styles.quickBtnText}>Write Your Own</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>YOUR NOTES ({notes.length})</Text>
            {notes.length === 0 && (
              <Text style={styles.mutedText}>
                No notes yet. Use Magic Import to generate a study guide from any topic, or write your own.
              </Text>
            )}
          </>
        }
      />
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700", marginTop: 12, marginBottom: 4 },
    subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
    quickRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
    quickBtn: {
      flex: 1, backgroundColor: colors.violetSoft, borderWidth: 1, borderColor: colors.violet,
      borderRadius: 14, paddingVertical: 16, alignItems: "center",
    },
    quickBtnEmoji: { fontSize: 22, marginBottom: 6 },
    quickBtnText: { color: colors.violet, fontWeight: "700", fontSize: 13 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8 },
    mutedText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 8 },
    cardRow: { flexDirection: "row", alignItems: "center" },
    iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12 },
    iconEmoji: { fontSize: 22 },
    noteTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
    noteMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    openText: { color: colors.tomato, fontSize: 12, fontWeight: "700" },
    cardActions: { flexDirection: "row", marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
    actionText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  });
