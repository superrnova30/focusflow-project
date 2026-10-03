import React, { useState, useCallback, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { resolveCollectionId } from "../lib/collectionStudy";
import { RADIUS, SPACING } from "../theme/theme";

const PRACTICE_TARGET = 247;

export default function FlashcardPracticeTestScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const collectionId = resolveCollectionId(route.params);
  const collection = route.params?.collection;

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [progress, setProgress] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [batchDone, setBatchDone] = useState(false);

  const loadQuestions = useCallback(async () => {
    if (!collectionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.get(`/flashcards/collections/${collectionId}/study/practice/questions`, {
        params: { count: 10 },
      });
      let qs = data.questions || [];
      if (!qs.length) {
        const { data: collectionData } = await client.get(`/flashcards/collections/${collectionId}`);
        const cards = collectionData.collection?.flashcards || [];
        if (cards.length) {
          Alert.alert("Practice unavailable", "Could not build practice questions. Try again after reloading the deck.");
        }
      }
      setQuestions(qs);
      setProgress(data.progress);
      setUnlocked(Boolean(data.unlocked));
      setQIndex(0);
      setSelected(null);
      setRevealed(false);
      setSessionCorrect(0);
      setBatchDone(false);
      setJustUnlocked(false);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Practice Test",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Modes",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg]);

  useFocusEffect(
    useCallback(() => {
      loadQuestions();
    }, [loadQuestions])
  );

  const current = questions[qIndex];
  const answered = progress?.practiceAnswered || 0;
  const pct = Math.min(100, Math.round((answered / PRACTICE_TARGET) * 100));

  const submitAnswer = async (option) => {
    if (revealed || submitting || !current) return;
    setSelected(option);
    setRevealed(true);
    const isCorrect = option === current.answer;
    if (isCorrect) setSessionCorrect((c) => c + 1);

    setSubmitting(true);
    try {
      const { data } = await client.post(`/flashcards/collections/${collectionId}/study/practice/answer`, {
        correct: isCorrect,
      });
      setProgress(data.progress);
      setUnlocked(Boolean(data.progress?.practiceUnlocked));
      if (data.justUnlocked) setJustUnlocked(true);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const nextQuestion = () => {
    if (qIndex + 1 >= questions.length) {
      setBatchDone(true);
      return;
    }
    setQIndex((i) => i + 1);
    setSelected(null);
    setRevealed(false);
  };

  if (loading && !questions.length) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} size="large" />
          <Text style={styles.muted}>Loading practice questions…</Text>
        </View>
      </Screen>
    );
  }

  if (batchDone) {
    return (
      <Screen>
        <View style={styles.center}>
          {justUnlocked ? (
            <View style={[styles.resultIcon, { backgroundColor: colors.amberSoft }]}>
              <Ionicons name="ribbon" size={44} color={colors.amber} />
            </View>
          ) : (
            <View style={[styles.resultIcon, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name="checkmark-done" size={44} color={colors.violet} />
            </View>
          )}
          <Text style={styles.resultTitle}>{justUnlocked ? "Practice Test unlocked!" : "Batch complete"}</Text>
          <Text style={styles.resultScore}>
            {sessionCorrect}/{questions.length} correct this round
          </Text>
          <Text style={styles.muted}>
            {unlocked
              ? `You've answered ${answered} questions total. Keep practicing ${collection?.name || "this deck"}.`
              : `${answered}/${PRACTICE_TARGET} questions answered toward unlock.`}
          </Text>
          <Pressable
            onPress={loadQuestions}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.amber }, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>Continue practicing</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border }, pressed && styles.pressed]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Back to study modes</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>No questions available. Add more cards to this deck.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>
              {unlocked ? "Practice Test unlocked" : "Unlock progress"}
            </Text>
            <Text style={[styles.progressCount, { color: colors.amber }]}>
              {answered}/{PRACTICE_TARGET}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.amber }]} />
          </View>
        </View>

        <Text style={styles.qMeta}>
          Question {qIndex + 1} of {questions.length}
        </Text>
        <Text style={styles.question}>{current.question}</Text>

        <View style={styles.options}>
          {current.options.map((opt, i) => {
            let bg = colors.surface;
            let border = colors.border;
            let textColor = colors.text;
            if (revealed) {
              if (opt === current.answer) {
                bg = colors.mintSoft;
                border = colors.mint;
                textColor = colors.text;
              } else if (opt === selected) {
                bg = colors.tomatoSoft;
                border = colors.tomato;
              }
            } else if (opt === selected) {
              border = colors.amber;
            }
            return (
              <Pressable
                key={`${current.id}-${i}`}
                onPress={() => submitAnswer(opt)}
                disabled={revealed || submitting}
                style={({ pressed }) => [
                  styles.option,
                  { backgroundColor: bg, borderColor: border, opacity: revealed || submitting ? 1 : pressed ? 0.9 : 1 },
                ]}
              >
                <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        {revealed ? (
          <Pressable
            onPress={nextQuestion}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.amber }, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>
              {qIndex + 1 >= questions.length ? "Finish batch" : "Next question"}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    scroll: {
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xl * 2,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    muted: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },
    progressCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    progressHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    progressLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    progressCount: {
      fontSize: 13,
      fontWeight: "800",
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 4,
    },
    qMeta: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 8,
    },
    question: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      lineHeight: 28,
      marginBottom: SPACING.lg,
    },
    options: {
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    option: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
    },
    optionText: {
      fontSize: 15,
      lineHeight: 21,
    },
    primaryBtn: {
      height: 48,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 15,
    },
    secondaryBtn: {
      height: 44,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    secondaryBtnText: {
      fontWeight: "700",
      fontSize: 14,
    },
    resultIcon: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    resultTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "900",
      textAlign: "center",
    },
    resultScore: {
      color: colors.amber,
      fontSize: 18,
      fontWeight: "800",
    },
    pressed: {
      opacity: 0.85,
    },
  });
