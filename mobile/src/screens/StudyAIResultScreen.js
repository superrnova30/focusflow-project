import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";

export default function StudyAIResultScreen({ route }) {
  const { pack, topic } = route.params || {};
  const { colors } = useTheme();
  const styles = useStyles(colors);

  if (!pack) {
    return (
      <Screen>
        <Text style={[styles.muted, { padding: 16 }]}>No study pack available.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>Study Pack: {topic || "Topic"}</Text>

        {pack.summary && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.sectionLabel}>Summary</Text>
            <Text style={styles.body}>{pack.summary}</Text>
          </Card>
        )}

        {Array.isArray(pack.keyConcepts) && pack.keyConcepts.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.sectionLabel}>Key Concepts</Text>
            {pack.keyConcepts.map((k, i) => (
              <Text key={`kc-${i}`} style={styles.body}>• {k}</Text>
            ))}
          </Card>
        )}

        {Array.isArray(pack.learningObjectives) && pack.learningObjectives.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.sectionLabel}>Learning Objectives</Text>
            {pack.learningObjectives.map((l, i) => (
              <Text key={`lo-${i}`} style={styles.body}>• {l}</Text>
            ))}
          </Card>
        )}

        {Array.isArray(pack.importantTerms) && pack.importantTerms.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.sectionLabel}>Important Terms</Text>
            {pack.importantTerms.map((t, i) => (
              <Text key={`term-${i}`} style={styles.body}>• {t.term}: {t.definition}</Text>
            ))}
          </Card>
        )}

        {Array.isArray(pack.studyTips) && pack.studyTips.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.sectionLabel}>Study Tips</Text>
            {pack.studyTips.map((s, i) => <Text key={`tip-${i}`} style={styles.body}>• {s}</Text>)}
          </Card>
        )}

        {Array.isArray(pack.flashcards) && pack.flashcards.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.sectionLabel}>Flashcards</Text>
            {pack.flashcards.map((c, i) => (
              <View key={`fc-${i}`} style={{ marginBottom: 8 }}>
                <Text style={[styles.body, { fontWeight: '700' }]}>{i + 1}. {c.front}</Text>
                <Text style={styles.body}>{c.back}</Text>
              </View>
            ))}
          </Card>
        )}

      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 12 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 },
    body: { color: colors.text, fontSize: 13, marginBottom: 6 },
    muted: { color: colors.textMuted, fontSize: 13 },
  });
