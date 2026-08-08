import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";

export default function MaterialDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { material } = route.params;
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const flashcards = material.flashcards || [];
  const current = flashcards[cardIndex];
  const firstQuiz = material.quizzes?.[0];

  const flip = () => setFlipped((f) => !f);
  const next = () => {
    setFlipped(false);
    setCardIndex((i) => (i + 1) % flashcards.length);
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>{material.title}</Text>

{material.aiSummary ? (
          <Card style={{ marginBottom: 14 }}>
            <Text style={styles.sectionLabel}>LESSON SUMMARY</Text>
            <Text style={styles.summary}>{material.aiSummary}</Text>
            {Array.isArray(material.aiLearningObjectives) && material.aiLearningObjectives.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>LEARNING OBJECTIVES</Text>
                {material.aiLearningObjectives.map((obj, i) => (
                  <Text key={i} style={styles.concept}>• {obj}</Text>
                ))}
              </>
            )}
            {Array.isArray(material.aiKeyConcepts) && material.aiKeyConcepts.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>KEY CONCEPTS</Text>
                {material.aiKeyConcepts.filter((item) => !String(item).startsWith("TIP:")).map((c, i) => (
                  <Text key={i} style={styles.concept}>• {c}</Text>
                ))}
              </>
            )}
            {Array.isArray(material.aiImportantTerms) && material.aiImportantTerms.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>IMPORTANT TERMS & DEFINITIONS</Text>
                {material.aiImportantTerms.map((t, i) => (
                  <View key={i} style={{ marginBottom: 6 }}>
                    <Text style={styles.term}>{t.term}</Text>
                    <Text style={styles.concept}>{t.definition}</Text>
                  </View>
                ))}
              </>
            )}
            {Array.isArray(material.studyTips) && material.studyTips.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>STUDY TIPS</Text>
                {material.studyTips.map((tip, i) => (
                  <Text key={i} style={styles.concept}>• {tip}</Text>
                ))}
              </>
            )}
          </Card>
        ) : null}

        {material.quizzes?.length ? (
          <Card style={{ marginBottom: 14 }}>
            <Text style={styles.sectionLabel}>PRACTICE QUESTIONS</Text>
            {material.quizzes[0].questions?.map((question, index) => (
              <View key={question.id || index} style={{ marginBottom: 10 }}>
                <Text style={styles.questionText}>{index + 1}. {question.question}</Text>
                {question.options?.length ? (
                  question.options.map((option, optionIndex) => (
                    <Text key={`${question.id || index}-${optionIndex}`} style={styles.optionText}>• {option}</Text>
                  ))
                ) : null}
                <Text style={styles.answerText}>Answer: {question.answer}</Text>
              </View>
            ))}
            {firstQuiz && (
              <Pressable
                onPress={() => navigation.navigate("Quiz", { quizId: firstQuiz.id, title: firstQuiz.title || material.title })}
                style={[styles.quizBtn, { backgroundColor: colors.tomato }]}
              >
                <Text style={styles.quizBtnText}>Take this quiz →</Text>
              </Pressable>
            )}
          </Card>
        ) : null}

        <Text style={styles.sectionLabel}>FLASHCARDS ({flashcards.length})</Text>
        {flashcards.length === 0 ? (
          <Text style={styles.mutedText}>No flashcards in this material.</Text>
        ) : (
          <>
            <Pressable onPress={flip}>
              <Card style={styles.flashcard}>
                <Text style={styles.cardLabel}>{flipped ? "BACK" : "FRONT"}</Text>
                <Text style={styles.cardText}>{flipped ? current.back : current.front}</Text>
                <Text style={styles.tapHint}>Tap to flip</Text>
              </Card>
            </Pressable>
            <View style={styles.cardControls}>
              <Pressable
                onPress={() => { setFlipped(false); setCardIndex((i) => (i - 1 + flashcards.length) % flashcards.length); }}
                style={styles.navBtn}
              >
                <Text style={styles.navText}>Prev</Text>
              </Pressable>
              <Text style={styles.counter}>{cardIndex + 1} / {flashcards.length}</Text>
              <Pressable onPress={next} style={styles.navBtn}>
                <Text style={styles.navText}>Next</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 14 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8 },
    mutedText: { color: colors.textMuted, fontSize: 13 },
summary: { color: colors.text, fontSize: 13.5, lineHeight: 20 },
    concept: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
    term: { color: colors.text, fontSize: 13.5, fontWeight: "700", marginTop: 4 },
    questionText: { color: colors.text, fontSize: 13.5, fontWeight: "600", marginBottom: 4 },
    optionText: { color: colors.textMuted, fontSize: 12.5, marginTop: 2 },
    answerText: { color: colors.tomato, fontSize: 12.5, marginTop: 4, fontWeight: "700" },
    quizBtn: {
      marginTop: 14, borderRadius: 12, paddingVertical: 13, alignItems: "center",
    },
    quizBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    flashcard: { minHeight: 220, justifyContent: "center", alignItems: "center", marginBottom: 12 },
    cardLabel: { color: colors.tomato, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 12 },
    cardText: { color: colors.text, fontSize: 18, fontWeight: "600", textAlign: "center", lineHeight: 26 },
    tapHint: { color: colors.textMuted, fontSize: 11, marginTop: 16 },
    cardControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    navBtn: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      paddingVertical: 8, paddingHorizontal: 18, borderRadius: 10,
    },
    navText: { color: colors.tomato, fontWeight: "700", fontSize: 13 },
    counter: { color: colors.textMuted, fontSize: 13 },
  });
