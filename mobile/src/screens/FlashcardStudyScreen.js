import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";

export default function FlashcardStudyScreen({ route }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const cards = route.params?.cards || [];
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);

  const current = cards[index];

  const flip = () => setFlipped((f) => !f);

  const go = (dir) => {
    if (dir === "prev") {
      setFlipped(false);
      setIndex((i) => (i - 1 + cards.length) % cards.length);
    } else {
      if (!flipped) {
        setFlipped(true);
        return;
      }
      if (dir === "known") setKnownCount((k) => k + 1);
      setFlipped(false);
      setIndex((i) => (i + 1) % cards.length);
    }
  };

  if (cards.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🃏</Text>
          <Text style={styles.emptyTitle}>No cards to study</Text>
          <Text style={styles.emptyText}>Add some flashcards to this collection first.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Text style={styles.counter}>
            {index + 1} / {cards.length}
          </Text>
          <Text style={styles.known}>Known: {knownCount}</Text>
        </View>

        <Pressable onPress={flip} style={{ flex: 1, justifyContent: "center" }}>
          <Card style={styles.flashcard}>
            <Text style={styles.cardLabel}>{flipped ? "BACK" : "FRONT"}</Text>
            <Text style={styles.cardText}>{flipped ? current.back : current.front}</Text>
            <Text style={styles.tapHint}>Tap to flip</Text>
          </Card>
        </Pressable>

        <View style={styles.controls}>
          <Pressable onPress={() => go("prev")} style={[styles.navBtn, { borderColor: colors.border }]}>
            <Text style={[styles.navText, { color: colors.text }]}>Prev</Text>
          </Pressable>

          {flipped ? (
            <>
              <Pressable onPress={() => go("known")} style={[styles.navBtn, { backgroundColor: colors.mint, borderColor: colors.mint, flex: 1 }]}>
                <Text style={[styles.navText, { color: "#fff" }]}>Got it ✓</Text>
              </Pressable>
              <Pressable onPress={() => go("next")} style={[styles.navBtn, { backgroundColor: colors.tomato, borderColor: colors.tomato, flex: 1 }]}>
                <Text style={[styles.navText, { color: "#fff" }]}>Next</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => go("next")} style={[styles.navBtn, { backgroundColor: colors.tomato, borderColor: colors.tomato, flex: 1 }]}>
              <Text style={[styles.navText, { color: "#fff" }]}>Flip card</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, paddingTop: 16, paddingBottom: 24 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 6 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    counter: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
    known: { color: colors.mint, fontSize: 13, fontWeight: "700" },
    flashcard: { minHeight: 320, justifyContent: "center", alignItems: "center" },
    cardLabel: { color: colors.tomato, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 16 },
    cardText: { color: colors.text, fontSize: 20, fontWeight: "600", textAlign: "center", lineHeight: 28 },
    tapHint: { color: colors.textMuted, fontSize: 11, marginTop: 20 },
    controls: { flexDirection: "row", gap: 10, marginTop: 20 },
    navBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
    navText: { fontWeight: "700", fontSize: 14 },
  });

