import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function QuizTakeScreen({ route }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { quizId, title } = route.params;
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    client
      .get(`/quizzes/${quizId}/take`)
      .then(({ data }) => {
        setQuiz(data.quiz);
        const blank = {};
        data.quiz.questions.forEach((q) => (blank[q.id] = ""));
        setAnswers(blank);
      })
      .catch((e) => Alert.alert("Error", e.message))
      .finally(() => setLoading(false));
  }, [quizId]);

  const setAnswer = (qid, value) => setAnswers((a) => ({ ...a, [qid]: value }));

  const submit = async () => {
    const unanswered = quiz.questions.filter((q) => !String(answers[q.id] || "").trim());
    if (unanswered.length > 0) {
      Alert.alert("Incomplete", `You still have ${unanswered.length} unanswered question(s).`);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await client.post(`/quizzes/${quizId}/attempt`, { answers });
      setResult(data);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading quiz…</Text>
      </Screen>
    );
  }

  if (result) {
    const pct = Math.round((result.score / result.total) * 100);
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.header}>Results</Text>
          <View style={styles.resultRing}>
            <Text style={styles.resultScore}>{result.score}/{result.total}</Text>
            <Text style={styles.resultPct}>{pct}%</Text>
          </View>
          <Text style={styles.resultNote}>
            {pct >= 70 ? "Great job!" : pct >= 40 ? "Keep practicing!" : "Review the material and try again."}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>{title || quiz?.title}</Text>
        <Text style={styles.subtitle}>{quiz?.questions?.length || 0} questions</Text>

        {quiz?.questions?.map((q, idx) => (
          <Card key={q.id} style={{ marginBottom: 12 }}>
            <Text style={styles.qNumber}>Q{idx + 1}</Text>
            <Text style={styles.question}>{q.question}</Text>

            {q.type === "mcq" && Array.isArray(q.options) ? (
              <View style={styles.optionsWrap}>
                {q.options.map((opt, oi) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <Pressable
                      key={oi}
                      onPress={() => setAnswer(q.id, opt)}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <Text style={[styles.optionText, selected && { color: "#fff" }]}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : q.type === "true_false" ? (
              <View style={styles.optionsWrap}>
                {["True", "False"].map((opt) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setAnswer(q.id, opt)}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <Text style={[styles.optionText, selected && { color: "#fff" }]}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Input value={answers[q.id]} onChangeText={(t) => setAnswer(q.id, t)} placeholder="Type your answer…" />
            )}
          </Card>
        ))}

        <Button title="Submit answers" onPress={submit} loading={submitting} />
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 20, fontWeight: "700" },
    subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 2, marginBottom: 16 },
    muted: { color: colors.textMuted, fontSize: 13 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    qNumber: { color: colors.tomato, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
    question: { color: colors.text, fontSize: 14.5, fontWeight: "600", lineHeight: 21, marginBottom: 12 },
    option: {
      backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
      borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8,
    },
    optionSelected: { backgroundColor: colors.tomato, borderColor: colors.tomato },
    optionText: { color: colors.text, fontSize: 13 },
    resultRing: {
      width: 160, height: 160, borderRadius: 80, borderWidth: 8, borderColor: colors.tomato,
      alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, marginVertical: 20,
    },
    resultScore: { color: colors.text, fontSize: 30, fontWeight: "700" },
    resultPct: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
    resultNote: { color: colors.textMuted, fontSize: 14 },
  });
