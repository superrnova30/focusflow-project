import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable } from "react-native";
import { Screen } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function FlashcardEditScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { card, collectionId } = route.params || {};
  const isEditing = Boolean(card);

  const [front, setFront] = useState(card?.front || "");
  const [back, setBack] = useState(card?.back || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!front.trim() || !back.trim()) {
      Alert.alert("Incomplete", "Please fill in both the front and back of the card.");
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        await client.patch(`/flashcards/${card.id}`, { front: front.trim(), back: back.trim() });
      } else {
        await client.post("/flashcards", { front: front.trim(), back: back.trim(), collectionId: collectionId || undefined });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert("Delete card?", "This will permanently remove this flashcard.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await client.delete(`/flashcards/${card.id}`);
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
          <Text style={styles.header}>{isEditing ? "Edit Flashcard" : "Write Your Own Flashcard"}</Text>
          <Text style={styles.subtitle}>
            Front is the question or term, back is the answer or definition.
          </Text>

          <Text style={styles.label}>FRONT (QUESTION / TERM)</Text>
          <Input
            value={front}
            onChangeText={setFront}
            placeholder="e.g. What is photosynthesis?"
            multiline
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />

          <Text style={styles.label}>BACK (ANSWER / DEFINITION)</Text>
          <Input
            value={back}
            onChangeText={setBack}
            placeholder="e.g. The process by which plants convert sunlight into chemical energy."
            multiline
            style={{ minHeight: 100, textAlignVertical: "top" }}
          />

          <Button title={isEditing ? "Save changes" : "Add flashcard"} onPress={save} loading={saving} />

          {isEditing && (
            <Pressable onPress={remove} style={{ marginTop: 12, alignItems: "center" }}>
              <Text style={{ color: colors.tomato, fontWeight: "700", fontSize: 14 }}>Delete card</Text>
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

