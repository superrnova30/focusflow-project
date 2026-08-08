import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function FlashcardCollectionsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const [collections, setCollections] = useState([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null); // collection id being renamed
  const [renameValue, setRenameValue] = useState("");

  const fetchCollections = useCallback(async () => {
    try {
      const { data } = await client.get("/flashcards/collections");
      setCollections(data.collections || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCollections();
    }, [fetchCollections])
  );

  const createCollection = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const { data } = await client.post("/flashcards/collections", { name });
      setNewName("");
      await fetchCollections();
      navigation.navigate("FlashcardCollection", { collection: data.collection });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setCreating(false);
    }
  };

  const renameCollection = (collection) => {
    setRenaming(collection.id);
    setRenameValue(collection.name);
  };

  const submitRename = async (collectionId) => {
    const name = renameValue.trim();
    if (!name) {
      setRenaming(null);
      return;
    }
    try {
      await client.patch(`/flashcards/collections/${collectionId}`, { name });
      setRenaming(null);
      setRenameValue("");
      await fetchCollections();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const deleteCollection = (collection) => {
    Alert.alert("Delete collection?", `Delete "${collection.name}" and all its cards?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await client.delete(`/flashcards/collections/${collection.id}`);
            await fetchCollections();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const renderCollection = ({ item }) => {
    const isRenaming = renaming === item.id;
    return (
      <Card style={{ marginBottom: 10 }}>
        <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate("FlashcardCollection", { collection: item })}>
          <View style={styles.cardRow}>
            <View style={styles.cardIconWrap}>
              <Text style={styles.cardIcon}>🃏</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.collectionName}>{item.name}</Text>
              <Text style={styles.collectionMeta}>{item._count?.flashcards || 0} cards</Text>
            </View>
            <Text style={styles.openText}>Open →</Text>
          </View>
        </Pressable>

        {isRenaming && (
          <View style={styles.renameRow}>
            <Input
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Collection name"
              autoFocus
              style={{ flex: 1, marginBottom: 0 }}
            />
            <Pressable onPress={() => submitRename(item.id)} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
            <Pressable onPress={() => setRenaming(null)} style={styles.saveBtn}>
              <Text style={[styles.saveBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.cardActions}>
          <Pressable onPress={() => renameCollection(item)} style={{ marginRight: 16 }}>
            <Text style={styles.actionText}>Rename</Text>
          </Pressable>
          <Pressable onPress={() => deleteCollection(item)}>
            <Text style={[styles.actionText, { color: colors.tomato }]}>Delete</Text>
          </Pressable>
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      <FlatList
        data={collections}
        keyExtractor={(c) => c.id}
        renderItem={renderCollection}
        ListHeaderComponent={
          <>
            <Text style={styles.header}>Flashcard Collections</Text>
            <Text style={styles.subtitle}>
              Organize your cards into collections, write your own, or use Magic Import to generate them with AI.
            </Text>

            <Card style={{ marginBottom: 16 }}>
              <Text style={styles.sectionLabel}>NEW COLLECTION</Text>
              <View style={styles.createRow}>
                <Input value={newName} onChangeText={setNewName} placeholder="e.g. Biology Chapter 3" style={{ flex: 1 }} />
                <Button title="Create" onPress={createCollection} loading={creating} />
              </View>
            </Card>

            <View style={styles.quickRow}>
              <Pressable style={styles.quickBtn} onPress={() => navigation.navigate("MagicImport")}>
                <Text style={styles.quickBtnEmoji}>🪄</Text>
                <Text style={styles.quickBtnText}>Magic Import</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => navigation.navigate("FlashcardEdit", {})}>
                <Text style={styles.quickBtnEmoji}>✍️</Text>
                <Text style={styles.quickBtnText}>Write Your Own</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>YOUR COLLECTIONS ({collections.length})</Text>
            {collections.length === 0 && (
              <Text style={styles.mutedText}>No collections yet. Create one above or use Magic Import to get started!</Text>
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
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8 },
    createRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    quickRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
    quickBtn: {
      flex: 1, backgroundColor: colors.violetSoft, borderWidth: 1, borderColor: colors.violet,
      borderRadius: 14, paddingVertical: 16, alignItems: "center",
    },
    quickBtnEmoji: { fontSize: 22, marginBottom: 6 },
    quickBtnText: { color: colors.violet, fontWeight: "700", fontSize: 13 },
    cardRow: { flexDirection: "row", alignItems: "center" },
    cardIconWrap: {
      width: 44, height: 44, borderRadius: 12, backgroundColor: colors.mintSoft,
      alignItems: "center", justifyContent: "center", marginRight: 12,
    },
    cardIcon: { fontSize: 22 },
    collectionName: { color: colors.text, fontSize: 15, fontWeight: "700" },
    collectionMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    openText: { color: colors.tomato, fontSize: 12, fontWeight: "700" },
    cardActions: { flexDirection: "row", marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
    actionText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
    renameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
    saveBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
    saveBtnText: { color: colors.tomato, fontWeight: "700", fontSize: 13 },
    mutedText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 8 },
  });

