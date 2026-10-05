import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Alert,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import HeartsBlockedPanel from "../components/HeartsBlockedPanel";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { startGoUnlimitedCheckout } from "../lib/upgradePrompt";
import { MAX_HEARTS } from "../lib/hearts";
import { setCachedCoins } from "../lib/coins";

const XP_PER_CORRECT = 200;
const OPTION_LABELS = ["A", "B", "C", "D"];

export default function GamifiedQuizScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= 700;

  // Quiz data passed in from the Study page generator.
  const initialQuestions = route.params?.questions || [];
  const initialAnswerKey = route.params?.answerKey || [];
  const topic = route.params?.topic || "Quiz";

  // Reconstruct questions with their answers (the server strips answers and
  // sends a parallel answerKey array to keep the payload tamper-resistant).
  const sameAnswer = (a, b) =>
    String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

  const buildQuestions = (qs, key) =>
    (qs || []).map((q, i) => ({
      ...q,
      answer: (key && key[i] != null && String(key[i]).length ? key[i] : q.answer) || "",
    }));

  const [questions, setQuestions] = useState(() => buildQuestions(initialQuestions, initialAnswerKey));
  const [idx, setIdx] = useState(0);
  const [xp, setXp] = useState(route.params?.xp ?? 0);
  const [hearts, setHearts] = useState(route.params?.hearts ?? MAX_HEARTS);
  const [score, setScore] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [selected, setSelected] = useState(null); // "correct" | "wrong" | null
  const [chosenOption, setChosenOption] = useState(null);
  const [phase, setPhase] = useState("question"); // "question" | "answered" | "gameover" | "complete"
  const [loading, setLoading] = useState(false);
  const [coins, setCoins] = useState(0);
  const [heartsRefillAt, setHeartsRefillAt] = useState(null);
  const [buying, setBuying] = useState(null);
  const depletedAfterAnswer = useRef(false);

  // Animations
  const cardAnim = useRef(new Animated.Value(0)).current;
  const xpScale = useRef(new Animated.Value(1)).current;
  const heartShake = useRef(new Animated.Value(0)).current;
  const floatOpacity = useRef(new Animated.Value(0)).current;
  const floatTranslate = useRef(new Animated.Value(0)).current;
  const [floatText, setFloatText] = useState("");

  const syncGameState = useCallback(async () => {
    try {
      const { data } = await client.get("/game/state");
      const state = data.state || {};
      setXp(state.xp ?? 0);
      setHearts(state.hearts ?? MAX_HEARTS);
      setCoins(state.coins || 0);
      setHeartsRefillAt(state.heartsRefillAt || null);
      if (state.heartsBlocked || (state.hearts ?? MAX_HEARTS) <= 0) {
        depletedAfterAnswer.current = false;
        setPhase((current) => (current === "complete" ? current : "gameover"));
        return state;
      }
      return state;
    } catch {
      return null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      syncGameState();
      if (initialQuestions.length === 0) {
        const key = route.params?.regenerateKey;
        if (key) {
          setLoading(true);
          client
            .get(`/game/quiz/${key}`)
            .then(({ data }) => setQuestions(data.questions))
            .catch((e) => Alert.alert("Error", e.message))
            .finally(() => setLoading(false));
        }
      }
    }, [initialQuestions.length, route.params?.regenerateKey, syncGameState])
  );

  useEffect(() => {
    cardAnim.setValue(0);
    Animated.timing(cardAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [idx, cardAnim]);

  const animateXp = () => {
    xpScale.setValue(1);
    Animated.sequence([
      Animated.timing(xpScale, { toValue: 1.35, duration: 220, useNativeDriver: true }),
      Animated.timing(xpScale, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const animateHeartLoss = () => {
    heartShake.setValue(0);
    Animated.sequence([
      Animated.timing(heartShake, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(heartShake, { toValue: -1, duration: 120, useNativeDriver: true }),
      Animated.timing(heartShake, { toValue: 0.6, duration: 120, useNativeDriver: true }),
      Animated.timing(heartShake, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  const showFloat = (text) => {
    setFloatText(text);
    floatOpacity.setValue(0);
    floatTranslate.setValue(10);
    Animated.parallel([
      Animated.timing(floatOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(floatTranslate, { toValue: -30, duration: 900, useNativeDriver: true }),
    ]).start();
    setTimeout(() => floatOpacity.setValue(0), 900);
  };

  const answerQuestion = async (option) => {
    if (phase !== "question" || loading) return;
    if (hearts <= 0) {
      setPhase("gameover");
      return;
    }
    const q = questions[idx];
    const isCorrect = sameAnswer(option, q.answer);
    setChosenOption(option);
    setSelected(isCorrect ? "correct" : "wrong");
    setPhase("answered");

    if (isCorrect) {
      const newScore = score + 1;
      const newXp = xp + XP_PER_CORRECT;
      const newXpEarned = xpEarned + XP_PER_CORRECT;
      setScore(newScore);
      setXp(newXp);
      setXpEarned(newXpEarned);
      animateXp();
      showFloat(`+${XP_PER_CORRECT} XP`);
      try {
        const { data } = await client.post("/game/xp", { amount: XP_PER_CORRECT, correct: true });
        if (data?.state?.xp != null) setXp(data.state.xp);
        if (data?.state?.coins != null) {
          setCoins(data.state.coins);
          setCachedCoins(data.state.coins);
        }
        if (data?.comboHit) {
          const extra = data.bonusXp ? ` +${data.bonusXp} bonus XP` : "";
          showFloat(`Combo! +${data.coinsEarned || 1} coin${extra}`);
          setXpEarned((current) => current + (data.bonusXp || 0));
        }
      } catch (e) {
        // Optimistic update already applied; ignore sync failure.
      }
    } else {
      const newHearts = Math.max(0, hearts - 1);
      setHearts(newHearts);
      animateHeartLoss();
      showFloat("-1 ❤️");
      try {
        const { data } = await client.post("/game/hearts", { delta: -1 });
        setHearts(data.state?.hearts ?? newHearts);
        setCoins(data.coins ?? data.state?.coins ?? coins);
        if (data.heartsRefillAt) setHeartsRefillAt(data.heartsRefillAt);
        if (data.gameOver || (data.state?.hearts ?? newHearts) <= 0) {
          depletedAfterAnswer.current = true;
          setPhase("gameover");
        }
      } catch (e) {
        const refillAt = e.response?.data?.heartsRefillAt;
        if (refillAt) setHeartsRefillAt(refillAt);
        if (e.response?.data?.coins != null) setCoins(e.response.data.coins);
        if (e.response?.data?.code === "HEARTS_DEPLETED" || newHearts <= 0) {
          depletedAfterAnswer.current = true;
          setHearts(0);
          setPhase("gameover");
        }
      }
    }
  };

  const nextQuestion = () => {
    if (hearts <= 0) {
      setPhase("gameover");
      return;
    }
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      setSelected(null);
      setChosenOption(null);
      setPhase("question");
    } else {
      setPhase("complete");
    }
  };

  const continueAfterRevive = (nextHearts) => {
    setSelected(null);
    setChosenOption(null);
    if (nextHearts <= 0) {
      setPhase("gameover");
      return;
    }
    if (depletedAfterAnswer.current && idx + 1 < questions.length) {
      setIdx((current) => current + 1);
    }
    depletedAfterAnswer.current = false;
    setPhase("question");
  };

  const retryQuiz = async () => {
    const state = await syncGameState();
    if (!state || state.heartsBlocked || (state.hearts ?? 0) <= 0) {
      setPhase("gameover");
      Alert.alert("Hearts needed", "Revive a heart with coins or wait for the 24-hour refill before retrying.");
      return;
    }
    setIdx(0);
    setScore(0);
    setXpEarned(0);
    setSelected(null);
    setChosenOption(null);
    setPhase("question");
  };

  const buyHearts = async (quantity) => {
    if (buying) return;
    setBuying(quantity > 1 ? "hearts" : "heart");
    try {
      const { data } = await client.post("/game/coins/spend", { item: "heart", quantity });
      setCoins(data.coins || 0);
      setCachedCoins(data.coins || 0);
      setHearts(data.hearts || 0);
      setHeartsRefillAt(null);
      Alert.alert("Heart revived", quantity > 1 ? `You restored ${quantity} hearts.` : "You revived 1 heart. You can continue the quiz.");
      continueAfterRevive(data.hearts || 0);
    } catch (e) {
      Alert.alert("Unable to revive", e.response?.data?.error || e.message || "Please try again.");
    } finally {
      setBuying(null);
    }
  };

  const newSession = () => {
    navigation.navigate("StudyHome");
  };

  // Quiz Over when hearts reach 0.
  useEffect(() => {
    if (hearts === 0 && phase === "answered") {
      setPhase("gameover");
    }
  }, [hearts, phase]);

  const renderHeart = (filled, index) => {
    const heartStyle = {
      transform: filled ? [] : [{ scale: 0.9 }],
    };
    return (
      <Animated.View
        key={index}
        style={[
          heartStyle,
          !filled && index === Math.max(0, hearts) && { transform: [{ rotate: heartShake.interpolate({ inputRange: [-1, 1], outputRange: ["-12deg", "12deg"] }) }] },
        ]}
      >
        <Ionicons
          name={filled ? "heart" : "heart-outline"}
          size={22}
          color={filled ? "#FF5A76" : colors.border}
        />
      </Animated.View>
    );
  };

  // ---- Screens ----

  if (phase === "gameover") {
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
            onCheckAgain={syncGameState}
            onBack={newSession}
            onUpgrade={() => startGoUnlimitedCheckout(navigation)}
            continueLabel="Continue quiz"
            summary={
              <View style={styles.scoreCard}>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>Correct so far</Text>
                  <Text style={styles.scoreValue}>{score}/{Math.min(idx + 1, questions.length || 1)}</Text>
                </View>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>XP earned</Text>
                  <Text style={[styles.scoreValue, { color: colors.amber }]}>+{xpEarned} XP</Text>
                </View>
              </View>
            }
          />
        </ScrollView>
      </Screen>
    );
  }

  if (phase === "complete") {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <Screen>
        <View style={styles.centerWrap}>
          <Animated.View style={[styles.gameOverEmoji, { opacity: cardAnim }]}>
            <Text style={{ fontSize: 52 }}>{pct >= 70 ? "🏆" : "🎉"}</Text>
          </Animated.View>
          <Text style={styles.gameOverTitle}>Quiz Complete!</Text>
          <Text style={styles.gameOverSubtitle}>
            {pct >= 70 ? "Outstanding! You really know your stuff." : "Nice work! Keep practicing to level up."}
          </Text>

          <View style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>Score</Text>
              <Text style={styles.scoreValue}>{score}/{questions.length}</Text>
            </View>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>XP earned</Text>
              <Text style={[styles.scoreValue, { color: colors.amber }]}>+{xpEarned} XP</Text>
            </View>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>Accuracy</Text>
              <Text style={styles.scoreValue}>{pct}%</Text>
            </View>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>Total XP</Text>
              <Text style={styles.scoreValue}>{xp} XP</Text>
            </View>
          </View>

          {hearts > 0 ? (
            <Pressable
              onPress={retryQuiz}
              style={({ pressed }) => [
                styles.bigBtn,
                { backgroundColor: colors.mint, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.bigBtnText}>Retry Quiz</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setPhase("gameover")}
              style={({ pressed }) => [
                styles.bigBtn,
                { backgroundColor: colors.tomato, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Ionicons name="heart" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.bigBtnText}>Revive hearts to retry</Text>
            </Pressable>
          )}
          <Pressable
            onPress={newSession}
            style={({ pressed }) => [
              styles.bigBtn,
              styles.bigBtnSecondary,
              { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="sparkles" size={20} color={colors.violet} style={{ marginRight: 8 }} />
            <Text style={[styles.bigBtnText, { color: colors.text }]}>Generate New Study Session</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (questions.length === 0) {
    return (
      <Screen>
        <View style={styles.centerWrap}>
          <Text style={styles.gameOverTitle}>No questions found</Text>
          <Text style={styles.gameOverSubtitle}>Head back to the Study page and generate a new session.</Text>
          <Pressable onPress={newSession} style={[styles.bigBtn, { backgroundColor: colors.tomato }]}>
            <Text style={styles.bigBtnText}>Back to Study</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const q = questions[idx];

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Status bar */}
        <View style={[styles.statusBar, isWide && { maxWidth: 560, alignSelf: "center", width: "100%" }]}>
          <View style={styles.statusGroup}>
            <Animated.View style={{ transform: [{ scale: xpScale }] }}>
              <View style={[styles.xpPill, { backgroundColor: colors.amberSoft }]}>
                <Ionicons name="flash" size={16} color={colors.amber} />
                <Text style={[styles.xpText, { color: colors.amber }]}>{xp}</Text>
              </View>
            </Animated.View>
            <Pressable
              onPress={() => hearts <= 0 && setPhase("gameover")}
              accessibilityRole="button"
              accessibilityLabel={hearts <= 0 ? "Out of hearts. Open revive options." : `${hearts} hearts remaining`}
              style={[styles.heartPill, { backgroundColor: colors.tomatoSoft }]}
            >
              {[0, 1, 2, 3, 4].map((i) => renderHeart(i < hearts, i))}
            </Pressable>
          </View>
          <View style={styles.progressWrap}>
            <Text style={styles.progressText}>
              Question {Math.min(idx + 1, questions.length)} of {questions.length}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${((idx + (phase === "answered" ? 1 : 0)) / questions.length) * 100}%`, backgroundColor: colors.mint },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Question card */}
        <Animated.View
          style={[
            styles.questionCard,
            isWide && { maxWidth: 560, alignSelf: "center", width: "100%" },
            {
              opacity: cardAnim,
              transform: [
                {
                  translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.topicLabel}>{topic.toUpperCase()}</Text>
          <Text style={styles.questionText}>{q.question}</Text>

          <View style={styles.optionsWrap}>
            {q.options.map((opt, oi) => {
              const isChosen = chosenOption === opt;
              const isAnswer = sameAnswer(opt, q.answer);
              let borderColor = colors.border;
              let bg = colors.surface;
              let textColor = colors.text;

              if (phase === "answered") {
                if (isAnswer) {
                  borderColor = colors.mint;
                  bg = colors.mintSoft;
                  textColor = colors.mint;
                } else if (isChosen) {
                  borderColor = colors.tomato;
                  bg = colors.tomatoSoft;
                  textColor = colors.tomato;
                } else {
                  bg = colors.surface;
                  textColor = colors.textMuted;
                }
              } else if (isChosen) {
                borderColor = colors.violet;
                bg = colors.violetSoft;
                textColor = colors.violet;
              }

              return (
                <Pressable
                  key={oi}
                  onPress={() => answerQuestion(opt)}
                  disabled={phase === "answered"}
                  style={({ pressed }) => [
                    styles.option,
                    { borderColor, backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <View style={[styles.optionLabel, { backgroundColor: phase === "answered" && isAnswer ? colors.mint : colors.bg }]}>
                    <Text
                      style={[
                        styles.optionLabelText,
                        { color: phase === "answered" && isAnswer ? "#fff" : colors.textMuted },
                      ]}
                    >
                      {OPTION_LABELS[oi]}
                    </Text>
                  </View>
                  <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
                  {phase === "answered" && isAnswer && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.mint} style={{ marginLeft: 8 }} />
                  )}
                  {phase === "answered" && isChosen && !isAnswer && (
                    <Ionicons name="close-circle" size={20} color={colors.tomato} style={{ marginLeft: 8 }} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Feedback area */}
          <Animated.View style={{ opacity: floatOpacity, transform: [{ translateY: floatTranslate }] }}>
            {phase === "answered" && (
              <View style={styles.feedbackBox}>
                {selected === "correct" ? (
                  <>
                    <Text style={[styles.feedbackText, { color: colors.mint }]}>✓ Correct! +200 XP</Text>
                  </>
                ) : (
                  <Text style={[styles.feedbackText, { color: colors.tomato }]}>
                    ✗ Not quite — correct answer: {q.answer}
                  </Text>
                )}
              </View>
            )}
          </Animated.View>

          {phase === "answered" && (
            <Pressable
              onPress={nextQuestion}
              style={({ pressed }) => [
                styles.nextBtn,
                { backgroundColor: colors.tomato, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.nextBtnText}>
                {idx + 1 < questions.length ? "Next Question" : "See Results"}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
            </Pressable>
          )}
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    statusBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 12,
      marginBottom: 16,
    },
    statusGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
    xpPill: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
      gap: 6,
    },
    xpText: { fontWeight: "800", fontSize: 14 },
    heartPill: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 10,
      gap: 2,
    },
    progressWrap: { flex: 1, marginLeft: 12 },
    progressText: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 },
    progressTrack: { height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 3 },
    questionCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 22,
      padding: 20,
    },
    topicLabel: { color: colors.violet, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
    questionText: { color: colors.text, fontSize: 17, fontWeight: "700", lineHeight: 25, marginBottom: 18 },
    optionsWrap: { gap: 10 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 14,
    },
    optionLabel: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    optionLabelText: { fontSize: 12, fontWeight: "800" },
    optionText: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
    feedbackBox: { marginTop: 14, alignItems: "center" },
    feedbackText: { fontSize: 13.5, fontWeight: "700" },
    nextBtn: {
      marginTop: 16,
      borderRadius: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    nextBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
    blockedScroll: { flexGrow: 1, justifyContent: "center", paddingVertical: 24 },
    centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    gameOverEmoji: { fontSize: 52, marginBottom: 12 },
    gameOverTitle: { color: colors.text, fontSize: 26, fontWeight: "800", marginBottom: 8, textAlign: "center" },
    gameOverSubtitle: {
      color: colors.textMuted,
      fontSize: 13.5,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 24,
      maxWidth: 300,
    },
    scoreCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 18,
      width: "100%",
      maxWidth: 320,
      marginBottom: 24,
    },
    scoreRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
    },
    scoreLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    scoreValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
    bigBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      paddingVertical: 15,
      paddingHorizontal: 24,
      width: "100%",
      maxWidth: 320,
      marginBottom: 12,
    },
    bigBtnSecondary: { borderWidth: 1 },
    bigBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  });

