import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { Input } from "../components/Inputs";
import HeartsBlockedPanel from "../components/HeartsBlockedPanel";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { startGoUnlimitedCheckout } from "../lib/upgradePrompt";
import {
  MAX_HEARTS,
  fetchHeartsState,
  isHeartsBlocked,
  spendCoinsForHearts,
} from "../lib/hearts";
import { RADIUS, SPACING } from "../theme/theme";
import { setCachedCoins } from "../lib/coins";

export default function QuizTakeScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const { quizId, title } = route.params || {};

  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("loading");
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState(null);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [coins, setCoins] = useState(0);
  const [xp, setXp] = useState(0);
  const [heartsRefillAt, setHeartsRefillAt] = useState(null);
  const [buying, setBuying] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(0);
  const [blockedAtStart, setBlockedAtStart] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(null);
  const [comboNote, setComboNote] = useState("");

  const applyState = (state = {}, extra = {}) => {
    setHearts(state.hearts ?? extra.hearts ?? 0);
    if (state.coins != null || extra.coins != null) {
      const nextCoins = state.coins ?? extra.coins ?? 0;
      setCoins(nextCoins);
      setCachedCoins(nextCoins);
    }
    if (state.xp != null) setXp(state.xp);
    setHeartsRefillAt(state.heartsRefillAt || extra.heartsRefillAt || null);
  };

  const loadQuiz = useCallback(async () => {
    setPhase("loading");
    try {
      const state = await fetchHeartsState(client);
      applyState(state);
      if (isHeartsBlocked(state)) {
        setBlockedAtStart(true);
        setPhase("blocked");
        return;
      }

      const { data } = await client.get(`/quizzes/${quizId}/take`);
      setQuiz(data.quiz);
      const blank = {};
      (data.quiz.questions || []).forEach((q) => {
        blank[q.id] = "";
      });
      setAnswers(blank);
      setIdx(0);
      setScore(0);
      setSelected(null);
      setRevealed(false);
      setResult(null);
      setBlockedAtStart(false);
      setPhase("question");
    } catch (e) {
      const payload = e?.response?.data || {};
      if (payload.code === "HEARTS_DEPLETED" || payload.heartsBlocked) {
        applyState(payload);
        setBlockedAtStart(true);
        setPhase("blocked");
        return;
      }
      Alert.alert("Error", payload.error || e.message || "Could not load this quiz.");
      setPhase("error");
    }
  }, [quizId]);

  useFocusEffect(
    useCallback(() => {
      loadQuiz();
    }, [loadQuiz])
  );

  const questions = quiz?.questions || [];
  const current = questions[idx];

  const finishQuiz = async (finalAnswers, nextHearts) => {
    setSubmitting(true);
    try {
      const { data } = await client.post(`/quizzes/${quizId}/attempt`, {
        answers: finalAnswers,
        heartsAlreadyApplied: true,
      });
      setResult(data);
      if (data.heartsBlocked || (nextHearts ?? hearts) <= 0) {
        applyState(data, { hearts: nextHearts ?? 0 });
        setPhase("blocked");
      } else {
        setPhase("complete");
      }
    } catch (e) {
      const payload = e?.response?.data || {};
      if (payload.code === "HEARTS_DEPLETED") {
        applyState(payload);
        setPhase("blocked");
      } else {
        Alert.alert("Error", payload.error || e.message || "Could not submit this quiz.");
        setPhase("complete");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const chooseAnswer = async (value) => {
    if (!current || revealed || submitting || phase !== "question") return;
    setSelected(value);
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
    setSubmitting(true);
    try {
      const { data } = await client.post(`/quizzes/${quizId}/check`, {
        questionId: current.id,
        answer: value,
      });
      setRevealed(true);
      setLastCorrect(Boolean(data.correct));
      setComboNote(data.comboHit ? `Combo! +${data.coinsEarned || 1} coin and +${data.xpAwarded || 0} XP` : "");
      applyState(data);
      if (data.correct) setScore((s) => s + 1);
      if (data.gameOver || data.heartsBlocked || (data.hearts ?? hearts) <= 0) {
        setHearts(0);
      }
    } catch (e) {
      const payload = e?.response?.data || {};
      if (payload.code === "HEARTS_DEPLETED" || payload.heartsBlocked) {
        applyState(payload, { hearts: 0 });
        setHearts(0);
        setPhase("blocked");
        return;
      }
      Alert.alert("Error", payload.error || e.message || "Could not check that answer.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitTyped = () => {
    if (!current) return;
    const value = String(answers[current.id] || "").trim();
    if (!value) {
      Alert.alert("Answer needed", "Type an answer before continuing.");
      return;
    }
    chooseAnswer(value);
  };

  const goNext = () => {
    if (idx + 1 < questions.length) {
      if (hearts <= 0) {
        setPhase("blocked");
        return;
      }
      setIdx((i) => i + 1);
      setSelected(null);
      setRevealed(false);
      setLastCorrect(null);
      setPhase("question");
      return;
    }
    finishQuiz(answers, hearts);
  };

  const buyHearts = async (quantity) => {
    if (buying) return;
    setBuying(quantity > 1 ? "hearts" : "heart");
    try {
      const data = await spendCoinsForHearts(client, quantity);
      applyState({ hearts: data.hearts, coins: data.coins, heartsRefillAt: null });
      Alert.alert(
        "Heart revived",
        quantity > 1 ? `You restored ${quantity} hearts.` : "You revived 1 heart. You can continue the quiz."
      );
      if (blockedAtStart || !quiz) {
        await loadQuiz();
      } else if (result) {
        setPhase("complete");
      } else if (revealed && idx + 1 < questions.length) {
        setIdx((i) => i + 1);
        setSelected(null);
        setRevealed(false);
        setLastCorrect(null);
        setPhase("question");
      } else if (revealed) {
        finishQuiz(answers, data.hearts);
      } else {
        setPhase("question");
      }
    } catch (e) {
      Alert.alert("Unable to revive", e.response?.data?.error || e.message || "Please try again.");
    } finally {
      setBuying(null);
    }
  };

  const restoreHeartsIfReady = async () => {
    try {
      const state = await fetchHeartsState(client);
      applyState(state);
      if (!isHeartsBlocked(state)) {
        if (blockedAtStart || !quiz) {
          await loadQuiz();
        } else if (result) {
          setPhase("complete");
        } else {
          setPhase("question");
        }
      }
    } catch {
      loadQuiz();
    }
  };

  if (phase === "loading") {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.tomato} size="large" />
          <Text style={styles.muted}>Loading quiz…</Text>
        </View>
      </Screen>
    );
  }

  if (phase === "blocked") {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.blockedScroll} showsVerticalScrollIndicator={false}>
          <HeartsBlockedPanel
            coins={coins}
            hearts={hearts}
            refillAt={heartsRefillAt}
            buying={buying}
            title="Quiz unavailable"
            message="You ran out of hearts after incorrect answers. Wait 24 hours for a full refill, or spend coins to revive hearts and continue."
            onRevive={() => buyHearts(1)}
            onRefillAll={(qty) => buyHearts(qty)}
            onCheckAgain={restoreHeartsIfReady}
            onBack={() => navigation.goBack()}
            onUpgrade={() => startGoUnlimitedCheckout(navigation)}
            continueLabel="Continue quiz"
            summary={
              score > 0 || result ? (
                <View style={[styles.scoreCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.scoreLine}>
                    Correct so far: {result?.score ?? score}/{result?.total ?? Math.max(idx + (revealed ? 1 : 0), 1)}
                  </Text>
                </View>
              ) : null
            }
          />
        </ScrollView>
      </Screen>
    );
  }

  if (phase === "complete" && result) {
    const pct = Math.round((result.score / result.total) * 100);
    return (
      <Screen>
        <View style={styles.center}>
          <View style={[styles.resultIcon, { backgroundColor: pct >= 70 ? colors.mintSoft : colors.tomatoSoft }]}>
            <Ionicons name={pct >= 70 ? "trophy" : "refresh"} size={36} color={pct >= 70 ? colors.mint : colors.tomato} />
          </View>
          <Text style={styles.header}>Results</Text>
          <Text style={styles.resultScore}>
            {result.score}/{result.total}
          </Text>
          <Text style={styles.resultPct}>{pct}%</Text>
          <Text style={styles.muted}>
            {pct >= 70 ? "Great job!" : pct >= 40 ? "Keep practicing!" : "Review the material and try again."}
          </Text>
          {hearts > 0 ? (
            <Pressable
              onPress={loadQuiz}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.tomato }, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>Retry quiz</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setPhase("blocked")}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.tomato }, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>Revive hearts to retry</Text>
            </Pressable>
          )}
          <Pressable onPress={() => navigation.goBack()} style={styles.linkBtn}>
            <Text style={styles.linkText}>Back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>This quiz has no questions yet.</Text>
        </View>
      </Screen>
    );
  }

  const optionList =
    current.type === "true_false"
      ? ["True", "False"]
      : current.type === "mcq" && Array.isArray(current.options)
        ? current.options
        : null;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.hud}>
          <View style={[styles.xpPill, { backgroundColor: colors.amberSoft }]}>
            <Ionicons name="flash" size={14} color={colors.amber} />
            <Text style={[styles.xpText, { color: colors.amber }]}>{xp}</Text>
          </View>
          <Pressable
            onPress={() => hearts <= 0 && setPhase("blocked")}
            accessibilityRole="button"
            accessibilityLabel={hearts <= 0 ? "Out of hearts. Open revive options." : `${hearts} hearts remaining`}
            style={[styles.heartPill, { backgroundColor: colors.tomatoSoft }]}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Ionicons
                key={i}
                name={i < hearts ? "heart" : "heart-outline"}
                size={18}
                color={i < hearts ? "#FF5A76" : colors.border}
              />
            ))}
          </Pressable>
          <Text style={styles.progressText}>
            Question {idx + 1} of {questions.length}
          </Text>
        </View>

        <Text style={styles.header}>{title || quiz?.title}</Text>
        <Text style={styles.question}>{current.question}</Text>

        {optionList ? (
          <View style={styles.optionsWrap}>
            {optionList.map((opt, oi) => {
              const isChosen = selected === opt;
              let bg = colors.surface;
              let border = colors.border;
              let textColor = colors.text;
              if (revealed && isChosen) {
                bg = colors.violetSoft;
                border = colors.violet;
                textColor = colors.violet;
              } else if (isChosen) {
                bg = colors.tomatoSoft;
                border = colors.tomato;
              }
              return (
                <Pressable
                  key={`${current.id}-${oi}`}
                  onPress={() => chooseAnswer(opt)}
                  disabled={revealed || submitting}
                  style={({ pressed }) => [
                    styles.option,
                    { backgroundColor: bg, borderColor: border },
                    pressed && !revealed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Input
            value={answers[current.id] || ""}
            onChangeText={(t) => setAnswers((a) => ({ ...a, [current.id]: t }))}
            placeholder="Type your answer…"
            editable={!revealed}
          />
        )}

        {revealed ? (
          <View style={[styles.feedback, { backgroundColor: colors.surface, borderColor: lastCorrect ? colors.mint : colors.tomato }]}>
            <Text style={[styles.feedbackText, { color: lastCorrect ? colors.mint : colors.tomato }]}>
              {lastCorrect
                ? (comboNote || "Correct!")
                : hearts <= 0
                  ? "Incorrect. That used your last heart. Revive hearts to keep going, or wait 24 hours for a refill."
                  : "Incorrect. You lost 1 heart."}
            </Text>
          </View>
        ) : null}

        {!optionList && !revealed ? (
          <Pressable
            onPress={submitTyped}
            disabled={submitting}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.tomato }, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>Check answer</Text>
          </Pressable>
        ) : null}

        {revealed ? (
          <Pressable
            onPress={goNext}
            disabled={submitting}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.tomato }, pressed && styles.pressed]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {hearts <= 0 ? "See hearts status" : idx + 1 < questions.length ? "Next question" : "See results"}
              </Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    page: {
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
      paddingTop: SPACING.md,
      paddingBottom: 40,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.lg, gap: 10 },
    blockedScroll: { flexGrow: 1, justifyContent: "center", paddingVertical: 24 },
    muted: { color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
    xpPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    xpText: { fontSize: 13, fontWeight: "800" },
    hud: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.md,
      gap: 12,
    },
    heartPill: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 10,
      gap: 3,
    },
    progressText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
    header: { color: colors.text, fontSize: compact ? 20 : 22, fontWeight: "800", marginBottom: 10 },
    question: { color: colors.text, fontSize: 16, fontWeight: "700", lineHeight: 24, marginBottom: 16 },
    optionsWrap: { gap: 10, marginBottom: 12 },
    option: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      paddingVertical: 13,
      paddingHorizontal: 14,
    },
    optionText: { fontSize: 14, fontWeight: "600" },
    feedback: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 12,
      marginBottom: 12,
    },
    feedbackText: { color: colors.textMuted, fontSize: 13, fontWeight: "600", lineHeight: 18 },
    primaryBtn: {
      minHeight: 50,
      borderRadius: RADIUS.lg,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
    },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    resultIcon: {
      width: 76,
      height: 76,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    resultScore: { color: colors.text, fontSize: 34, fontWeight: "900" },
    resultPct: { color: colors.textMuted, fontSize: 16, fontWeight: "700" },
    scoreCard: {
      width: "100%",
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 12,
      marginBottom: 12,
    },
    scoreLine: { color: colors.text, fontSize: 13, fontWeight: "700", textAlign: "center" },
    linkBtn: { paddingVertical: 10 },
    linkText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
    pressed: { opacity: 0.85 },
  });
