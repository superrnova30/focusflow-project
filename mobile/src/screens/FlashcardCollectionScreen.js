import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function FlashcardCollectionScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const initialCollection = route.params?.collection;
  const collectionId = initialCollection?.id;
  const [collection, setCollection] = useState(initialCollection || null);
  const [cards, setCards] = useState([]);

  const fetchCollection = useCallback(async () => {
    if (!collectionId) return;
    try {
      const { data } = await client.get(`/flashcards/collections/${collectionId}`);
      setCollection(data.collection);
      setCards(data.collection.flashcards || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, [collectionId]);

  useFocusEffect(
    useCallback(() => {
      fetchCollection();
    }, [fetchCollection])
  );

  const deleteCard = (card) => {
    Alert.alert("Delete card?", "This will permanently remove this flashcard.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await client.delete(`/flashcards/${card.id}`);
            await fetchCollection();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const renderCard = ({ item, index }) => (
    <Card style={{ marginBottom: 8 }}>
      <Pressable
        onPress={() => navigation.navigate("FlashcardEdit", { card: item, collectionId })}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        <Text style={styles.cardIndex}>#{index + 1}</Text>
        <Text style={styles.frontText}>{item.front}</Text>
        <View style={styles.divider} />
        <Text style={styles.backText}>{item.back}</Text>
      </Pressable>
      <View style={styles.cardActions}>
        <Pressable onPress={() => navigation.navigate("FlashcardEdit", { card: item, collectionId })} style={{ marginRight: 16 }}>
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable onPress={() => deleteCard(item)}>
          <Text style={[styles.actionText, { color: colors.tomato }]}>Delete</Text>
        </Pressable>
      </View>
    </Card>
  );

  return (
    <Screen>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        renderItem={renderCard}
        ListHeaderComponent={
          <>
            <Text style={styles.header}>{collection?.name || "Collection"}</Text>
            <Text style={styles.subtitle}>{cards.length} cards · Write your own or generate more with AI.</Text>

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.violet, borderColor: colors.violet }]}
                onPress={() => navigation.navigate("FlashcardStudy", { cards })}
              >
                <Text style={styles.actionBtnText}>Study Cards</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { borderColor: colors.border }]}
                onPress={() => navigation.navigate("FlashcardEdit", { collectionId })}
              >
                <Text style={[styles.actionBtnText, { color: colors.text }]}>+ Add Card</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.magicRow}
              onPress={() => navigation.navigate("MagicImport", { collectionId, collectionName: collection?.name })}
            >
              <Text style={styles.magicEmoji}>🪄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.magicTitle}>Magic Import</Text>
                <Text style={styles.magicSubtitle}>Auto-generate cards from a topic, notes, PDF, or study pack.</Text>
              </View>
              <Text style={styles.magicArrow}>→</Text>
            </Pressable>

            <Text style={styles.sectionLabel}>CARDS ({cards.length})</Text>
            {cards.length === 0 && (
              <Text style={styles.mutedText}>No cards yet. Tap "+ Add Card" to write your own or use Magic Import.</Text>
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
    subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 16 },
    actionRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    actionBtn: {
      flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center",
    },
    actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    magicRow: {
      flexDirection: "row", alignItems: "center", backgroundColor: colors.mintSoft, borderWidth: 1, borderColor: colors.mint,
      borderRadius: 14, padding: 14, marginBottom: 8,
    },
    magicEmoji: { fontSize: 24, marginRight: 12 },
    magicTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
    magicSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 },
    magicArrow: { color: colors.mint, fontSize: 18, fontWeight: "700" },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8 },
    mutedText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 8 },
    cardIndex: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
    frontText: { color: colors.text, fontSize: 15, fontWeight: "700", lineHeight: 21 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
    backText: { color: colors.textMuted, fontSize: 13.5, lineHeight: 19 },
    cardActions: { flexDirection: "row", marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
    actionText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  });

