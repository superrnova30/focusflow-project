import React, { useState, useEffect, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import HighlightedAnswer from "../components/HighlightedAnswer";
import HeartsBlockedPanel from "../components/HeartsBlockedPanel";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { handleLimitError, isUpgradeRequired, startGoUnlimitedCheckout } from "../lib/upgradePrompt";
import { extractLimitCode, messageForLimitCode } from "../lib/limitMessages";
import { resolveCollectionId } from "../lib/collectionStudy";
import { isHeartsBlocked } from "../lib/hearts";
import { setCachedCoins } from "../lib/coins";
import { notifyTasksChanged } from "../lib/tasks";
import { RADIUS, SPACING } from "../theme/theme";

const OPTION_LABELS = ["A", "B", "C", "D"];
const TUTOR_MCQ_XP = 10;
const MAX_HEARTS = 5;

function hasValidMcqChoices(question) {
  const opts = (question?.options || []).map((item) => String(item || "").trim()).filter(Boolean);
  const answer = String(question?.answer || "").trim();
  if (!String(question?.question || "").trim() || !answer || opts.length !== 4) return false;
  const unique = new Set(opts.map((item) => item.toLowerCase()));
  if (unique.size !== 4) return false;
  return opts.some((item) => item.toLowerCase() === answer.toLowerCase());
}

const sameChoice = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const emptyQuizState = () => ({
  answered: false,
  correct: false,
  selected: "",
  revealed: false,
  eliminatedOptions: [],
  xpAwarded: 0,
  hinted: false,
  feedback: null,
  correctAnswer: "",
});

export default function FlashcardTutorLessonScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const collectionId = resolveCollectionId(route.params);
  const collection = route.params?.collection;

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState(null);
  const [game, setGame] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [resumeStepIndex, setResumeStepIndex] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [quizStates, setQuizStates] = useState([[emptyQuizState(), emptyQuizState()]]);
  const [sessionXp, setSessionXp] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [buying, setBuying] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadNonce, setLoadNonce] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "AI Tutor Lesson",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Modes",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg]);

  useEffect(() => {
    if (!collectionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setLesson(null);
    setCompleted(false);
    setSessionXp(0);
    client
      .post(`/flashcards/collections/${collectionId}/study/tutor-lesson`)
      .then(({ data }) => {
        if (cancelled) return;
        const nextLesson = data.lesson;
        const cards = (nextLesson?.cards || [])
          .map((card) => ({
            ...card,
            questions: (card.questions || []).filter(hasValidMcqChoices),
          }))
          .filter((card) => (card.questions || []).length > 0);
        if (!cards.length) {
          setLoadError({
            isLimit: false,
            title: "Couldn't start lesson",
            message: "The tutor lesson came back without valid answer choices. Please try again.",
          });
          return;
        }
        setLesson({ ...nextLesson, cards });
        setGame(data.game || null);
        setQuizStates(cards.map((card) => (card.questions || []).map(() => emptyQuizState())));
        setStepIndex(0);
        if (isHeartsBlocked(data.game)) {
          setResumeStepIndex(0);
          setBlocked(true);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const limitHit = isUpgradeRequired(e);
        const code = extractLimitCode(e);
        const apiMessage = e?.response?.data?.error || e?.message || "";
        if (limitHit) {
          handleLimitError(navigation, e);
          setLoadError({
            isLimit: true,
            title: "AI Tutor limit reached",
            message: messageForLimitCode(
              code,
              apiMessage || "You've reached today's AI tutor limit on Basic. Upgrade to Go Unlimited for unlimited tutor lessons, or come back tomorrow."
            ),
          });
          return;
        }
        setLoadError({
          isLimit: false,
          title: "Couldn't start lesson",
          message: apiMessage || "Something went wrong while building this tutor lesson. Please try again.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, navigation, loadNonce]);

  const cards = lesson?.cards || [];
  const steps = useMemo(() => {
    const out = [];
    cards.forEach((card, ci) => {
      out.push({ type: "explain", cardIndex: ci });
      (card.questions || []).forEach((_, qi) => {
        out.push({ type: "quiz", cardIndex: ci, quizIndex: qi });
      });
    });
    return out;
  }, [cards]);
  const step = steps[stepIndex] || { type: "explain", cardIndex: 0, quizIndex: 0 };
  const cardIndex = step.cardIndex || 0;
  const quizIndex = step.quizIndex || 0;
  const phase = step.type === "quiz" ? "quiz" : "explain";
  const currentCard = cards[cardIndex];
  const questions = currentCard?.questions || [];
  const currentQuestion = questions[quizIndex];
  const qState = quizStates[cardIndex]?.[quizIndex] || emptyQuizState();
  const remainingWrong = (currentQuestion?.options || []).filter(
    (opt) =>
      !sameChoice(opt, currentQuestion?.answer)
      && !(qState.eliminatedOptions || []).some((item) => sameChoice(item, opt))
  );
  const canHint = phase === "quiz" && !qState.answered && remainingWrong.length > 0;
  const canGoPrev = stepIndex > 0;
  const canGoNext = phase === "explain" || qState.answered;
  const isLastStep = stepIndex >= Math.max(steps.length - 1, 0);
  const levelPct = Math.min(
    100,
    Math.round(((game?.level?.xpWithinLevel ?? 0) / Math.max(game?.level?.step ?? 500, 1)) * 100)
  );

  const patchQuizState = (next) => {
    setQuizStates((prev) =>
      prev.map((pair, idx) => {
        if (idx !== cardIndex) return pair;
        const copy = [...pair];
        copy[quizIndex] = { ...copy[quizIndex], ...next };
        return copy;
      })
    );
  };

  const applyGame = (nextGame) => {
    if (!nextGame) return;
    setGame(nextGame);
    if (nextGame.coins != null) setCachedCoins(nextGame.coins);
  };

  const allQuestionsIndependentlyCorrect = useMemo(() => {
    if (!cards.length) return false;
    return cards.every((card, ci) =>
      (card.questions || []).every((_, qi) => {
        const state = quizStates[ci]?.[qi];
        return Boolean(state?.answered && state?.correct && !state?.revealed && !state?.hinted && (state?.xpAwarded || 0) > 0);
      })
    );
  }, [cards, quizStates]);

  const finishLesson = async () => {
    if (submitting) return;
    if (!allQuestionsIndependentlyCorrect) {
      Alert.alert(
        "Lesson not complete",
        "Answer every question correctly without using a hint or reveal before finishing."
      );
      return;
    }
    setSubmitting(true);
    try {
      await client.post(`/flashcards/collections/${collectionId}/study/tutor-lesson/complete`, {
        lessonId: lesson?.lessonId,
      });
      notifyTasksChanged({ collectionId });
      setCompleted(true);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const goPrev = () => {
    if (!canGoPrev) return;
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (!canGoNext) return;
    if (isLastStep) {
      finishLesson();
      return;
    }
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  };

  const submitAnswer = async (payload) => {
    if (!currentCard || !currentQuestion || qState.answered || submitting) return;
    if (!hasValidMcqChoices(currentQuestion)) {
      Alert.alert("Invalid question", "This question is missing answer choices. Please restart the lesson.");
      return;
    }
    if (isHeartsBlocked(game)) {
      setResumeStepIndex(stepIndex);
      setBlocked(true);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await client.post(`/flashcards/collections/${collectionId}/study/tutor-lesson/answer`, {
        lessonId: lesson.lessonId,
        cardId: currentCard.cardId,
        questionIndex: quizIndex,
        ...payload,
      });
      if (data.game) applyGame(data.game);
      const xpAwarded = Number(data.xpAwarded || 0);
      if (xpAwarded) setSessionXp((value) => value + xpAwarded);
      const serverAnswer = String(data.correctAnswer || "").trim();
      if (serverAnswer) {
        setLesson((prev) => {
          if (!prev?.cards?.[cardIndex]?.questions?.[quizIndex]) return prev;
          const nextCards = prev.cards.map((card, ci) => {
            if (ci !== cardIndex) return card;
            const questions = (card.questions || []).map((question, qi) => {
              if (qi !== quizIndex) return question;
              return { ...question, answer: serverAnswer };
            });
            return { ...card, questions };
          });
          return { ...prev, cards: nextCards };
        });
      }

      const wrongRetry = Boolean(data.canRetry) && !data.correct && !payload.revealed;
      if (wrongRetry) {
        patchQuizState({
          answered: false,
          correct: false,
          revealed: false,
          selected: "",
          xpAwarded: 0,
          feedback: data.feedback || null,
          correctAnswer: serverAnswer || currentQuestion.answer,
        });
        Alert.alert("Not quite", data.feedback?.title || "Try again without revealing the answer.");
      } else {
        const assisted = Boolean(data.assisted || (qState.hinted && data.correct));
        patchQuizState({
          answered: true,
          correct: Boolean(data.correct),
          revealed: Boolean(data.revealed || assisted || payload.revealed),
          selected: payload.answer || qState.selected,
          xpAwarded,
          hinted: Boolean(qState.hinted || assisted),
          feedback: data.feedback || null,
          correctAnswer: serverAnswer || currentQuestion.answer,
        });
      }
      if (data.heartsBlocked || isHeartsBlocked(data.game)) {
        setResumeStepIndex(stepIndex);
        setBlocked(true);
      }
    } catch (e) {
      if (e?.response?.data?.code === "HEARTS_DEPLETED" || e?.response?.data?.heartsBlocked) {
        if (e.response.data.game) applyGame(e.response.data.game);
        else {
          setGame((g) => ({
            ...g,
            hearts: 0,
            heartsBlocked: true,
            heartsRefillAt: e.response.data.heartsRefillAt || g?.heartsRefillAt,
            coins: e.response.data.coins ?? g?.coins,
          }));
        }
        setResumeStepIndex(stepIndex);
        setBlocked(true);
        return;
      }
      Alert.alert("Error", e?.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const useHint = async () => {
    if (!currentCard || !currentQuestion || !canHint || hintBusy) return;
    if (!game?.unlimitedHints && (game?.hints ?? 0) <= 0) {
      handleLimitError(navigation, {
        upgradeRequired: true,
        code: "NO_HINTS_REMAINING",
        message: "No hints remaining today. Upgrade to Go Unlimited for unlimited hints.",
      });
      return;
    }
    setHintBusy(true);
    try {
      const { data } = await client.post(`/flashcards/collections/${collectionId}/study/tutor-lesson/hint`, {
        lessonId: lesson.lessonId,
        cardId: currentCard.cardId,
        questionIndex: quizIndex,
        options: currentQuestion.options || [],
      });
      if (data.game) applyGame(data.game);
      if (data.xpDeducted) setSessionXp((value) => value - data.xpDeducted);
      const eliminated = (data.eliminatedOptions || []).filter(Boolean);
      const nextSelected = eliminated.includes(qState.selected) ? "" : qState.selected;
      patchQuizState({
        eliminatedOptions: eliminated,
        selected: nextSelected,
        hinted: eliminated.length > 0,
      });
    } catch (e) {
      if (!handleLimitError(navigation, e)) {
        Alert.alert("Hint unavailable", e?.response?.data?.error || e.message);
      }
    } finally {
      setHintBusy(false);
    }
  };

  const buyHearts = async (quantity) => {
    if (buying) return;
    setBuying(quantity > 1 ? "hearts" : "heart");
    try {
      const { data } = await client.post("/game/coins/spend", { item: "heart", quantity });
      applyGame({
        ...(game || {}),
        hearts: data.hearts,
        coins: data.coins,
        heartsBlocked: false,
        heartsRefillAt: null,
      });
      setStepIndex(resumeStepIndex);
      setBlocked(false);
      Alert.alert("Heart revived", quantity > 1 ? `You restored ${quantity} hearts.` : "You revived 1 heart. You can continue.");
    } catch (e) {
      Alert.alert("Could not revive hearts", e?.response?.data?.error || e.message);
    } finally {
      setBuying(null);
    }
  };

  const restoreHeartsIfReady = async () => {
    try {
      const { data } = await client.get("/game/state");
      applyGame({ ...(game || {}), ...(data.state || {}) });
      if (!isHeartsBlocked(data.state)) {
        setStepIndex(resumeStepIndex);
        setBlocked(false);
      }
    } catch {
      setStepIndex(resumeStepIndex);
      setBlocked(false);
    }
  };

  const renderHearts = () =>
    game?.unlimitedHearts ? (
      <>
        <Ionicons name="heart" size={compact ? 16 : 18} color="#FF5A76" />
        <Text style={{ color: "#FF5A76", fontWeight: "800", marginLeft: 2 }}>∞</Text>
      </>
    ) : (
      [0, 1, 2, 3, 4].map((i) => (
        <Ionicons
          key={i}
          name={i < (game?.hearts ?? MAX_HEARTS) ? "heart" : "heart-outline"}
          size={compact ? 16 : 18}
          color={i < (game?.hearts ?? MAX_HEARTS) ? "#FF5A76" : colors.border}
        />
      ))
    );

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.mint} size="large" />
          <Text style={styles.muted}>Building your tutor lesson…</Text>
        </View>
      </Screen>
    );
  }

  if (blocked) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.blockedScroll} showsVerticalScrollIndicator={false}>
          <HeartsBlockedPanel
            coins={game?.coins || 0}
            hearts={game?.hearts || 0}
            refillAt={game?.heartsRefillAt}
            buying={buying}
            title="Lesson paused"
            message="You ran out of hearts after incorrect answers. Wait 24 hours for a full refill, or spend coins to revive hearts and keep studying."
            onRevive={() => buyHearts(1)}
            onRefillAll={(qty) => buyHearts(qty)}
            onCheckAgain={restoreHeartsIfReady}
            onBack={() => navigation.goBack()}
            onUpgrade={() => startGoUnlimitedCheckout(navigation)}
            continueLabel="Continue lesson"
          />
        </ScrollView>
      </Screen>
    );
  }

  if (completed) {
    return (
      <Screen>
        <View style={styles.center}>
          <View style={[styles.resultIcon, { backgroundColor: colors.mintSoft }]}>
            <Ionicons name="school" size={44} color={colors.mint} />
          </View>
          <Text style={styles.resultTitle}>Lesson complete</Text>
          <Text style={styles.muted}>
            You finished the AI tutor lesson for {collection?.name || "this deck"}
            {sessionXp ? ` and earned ${sessionXp} EXP.` : "."} Review the deck with Memorize or Practice Test next.
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.mint }, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>Back to study modes</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (loadError || !currentCard) {
    const errorTitle = loadError?.title || "Couldn't load lesson";
    const errorMessage =
      loadError?.message
      || "This tutor lesson could not be loaded. Go back to the study deck and try again.";
    const isLimit = Boolean(loadError?.isLimit);
    return (
      <Screen>
        <View style={styles.center}>
          <View style={[styles.resultIcon, { backgroundColor: isLimit ? colors.amberSoft : colors.tomatoSoft }]}>
            <Ionicons
              name={isLimit ? "sparkles-outline" : "alert-circle-outline"}
              size={44}
              color={isLimit ? colors.amber : colors.tomato}
            />
          </View>
          <Text style={styles.resultTitle}>{errorTitle}</Text>
          <Text style={styles.muted}>{errorMessage}</Text>
          <View style={styles.errorActions}>
            {isLimit ? (
              <Pressable
                onPress={() => startGoUnlimitedCheckout(navigation)}
                style={({ pressed }) => [styles.primaryBtn, styles.errorActionBtn, { backgroundColor: colors.mint }, pressed && styles.pressed]}
              >
                <Text style={styles.primaryBtnText}>Go Unlimited</Text>
              </Pressable>
            ) : null}
            {!isLimit ? (
              <Pressable
                onPress={() => {
                  if (loading) return;
                  setLoadNonce((n) => n + 1);
                }}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.errorActionBtn,
                  { backgroundColor: colors.mint },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryBtnText}>Try again</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.errorActionBtn,
                { borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.progressSection}>
          <View style={styles.progressMeta}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressCount}>
              {Math.min(stepIndex + 1, steps.length || 1)} / {steps.length || 1}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(((stepIndex + 1) / Math.max(steps.length, 1)) * 100)}%`,
                  backgroundColor: colors.mint,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.hud}>
          <Pressable
            onPress={goPrev}
            disabled={!canGoPrev}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            style={({ pressed }) => [styles.navBtn, { opacity: !canGoPrev ? 0.35 : pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
            <Text style={styles.navText}>Prev</Text>
          </Pressable>

          <View style={styles.statsCluster}>
            <Pressable
              onPress={() => canHint && useHint()}
              style={[styles.statPill, { backgroundColor: colors.amberSoft }]}
            >
              <Ionicons name="key" size={14} color={colors.amber} />
              <Text style={[styles.statText, { color: colors.amber }]}>
                {game?.unlimitedHints ? "∞" : game?.hints ?? 0}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => isHeartsBlocked(game) && setBlocked(true)}
              accessibilityRole="button"
              accessibilityLabel={
                game?.unlimitedHearts
                  ? "Unlimited hearts"
                  : (game?.hearts || 0) <= 0
                    ? "Out of hearts. Open revive options."
                    : `${game?.hearts || 0} hearts remaining`
              }
              style={[styles.statPill, { backgroundColor: colors.tomatoSoft }]}
            >
              {renderHearts()}
            </Pressable>
            <View style={[styles.statPill, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name="flash" size={14} color={colors.violet} />
              <Text style={[styles.statText, { color: colors.violet }]}>{game?.xp ?? 0}</Text>
            </View>
          </View>

          <Pressable
            onPress={goNext}
            disabled={!canGoNext}
            accessibilityRole="button"
            accessibilityLabel="Next"
            style={({ pressed }) => [styles.navBtn, { opacity: !canGoNext ? 0.35 : pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.navText}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>

        <View style={[styles.levelBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.levelLabel}>Level {game?.level?.current ?? 1}</Text>
          <View style={[styles.levelTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.levelFill, { width: `${levelPct}%`, backgroundColor: colors.amber }]} />
          </View>
          <Text style={styles.levelMeta}>
            {game?.level?.xpWithinLevel ?? 0}/{game?.level?.step ?? 500} XP
          </Text>
        </View>

        <Text style={styles.lessonTitle}>{lesson?.title || collection?.name}</Text>

        {phase === "explain" ? (
          <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.promptLabel}>FLASHCARD</Text>
            <Text style={styles.stepTitle}>{currentCard.front}</Text>
            <View style={[styles.answerBox, { backgroundColor: colors.mintSoft, borderColor: colors.mint }]}>
              <Text style={[styles.promptLabel, { color: colors.mint }]}>CORRECT ANSWER</Text>
              <HighlightedAnswer
                card={currentCard}
                text={currentCard.back}
                highlight={currentCard.answerHighlight}
                style={styles.answerText}
              />
            </View>
            <Text style={styles.explainLabel}>Explanation</Text>
            <Text style={styles.stepContent}>{currentCard.explanation}</Text>
          </View>
        ) : (
          <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.mint }]}>
            <View style={styles.questionHeader}>
              <View style={[styles.typeBadge, { backgroundColor: colors.mintSoft }]}>
                <Text style={[styles.typeBadgeText, { color: colors.mint }]}>Multiple choice</Text>
              </View>
              <Text style={styles.deckName} numberOfLines={1}>
                Question {quizIndex + 1} of {questions.length || 2}
              </Text>
            </View>
            <Text style={styles.stepTitle}>{currentQuestion?.question}</Text>
            <View style={styles.optionsWrap}>
              {(currentQuestion?.options || []).map((option, index) => {
                const highlightedAnswer = qState.correctAnswer || currentQuestion.answer;
                const isChosen = sameChoice(qState.selected, option);
                const isAnswer = sameChoice(option, highlightedAnswer);
                const isEliminated = (qState.eliminatedOptions || []).some((item) => sameChoice(item, option));
                let borderColor = colors.border;
                let bg = colors.bg;
                let textColor = colors.text;
                if (qState.answered || qState.revealed) {
                  if (isAnswer) {
                    borderColor = colors.mint;
                    bg = colors.mintSoft;
                    textColor = colors.mint;
                  } else if (isChosen) {
                    borderColor = colors.tomato;
                    bg = colors.tomatoSoft;
                    textColor = colors.tomato;
                  }
                } else if (isEliminated) {
                  borderColor = colors.border;
                  bg = colors.surface;
                  textColor = colors.textMuted;
                } else if (isChosen) {
                  borderColor = colors.violet;
                  bg = colors.violetSoft;
                }
                return (
                  <Pressable
                    key={`${option}-${index}`}
                    disabled={qState.answered || submitting || isEliminated}
                    onPress={() => patchQuizState({ selected: option })}
                    accessibilityState={{ disabled: isEliminated }}
                    style={({ pressed }) => [
                      styles.optionBtn,
                      { borderColor, backgroundColor: bg, opacity: isEliminated && !qState.answered ? 0.45 : 1 },
                      pressed && !isEliminated && styles.pressed,
                    ]}
                  >
                    <View style={[styles.optionLabelWrap, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.optionLabel, { color: textColor }]}>{OPTION_LABELS[index] || index + 1}</Text>
                    </View>
                    <Text style={[styles.optionText, { color: textColor, textDecorationLine: isEliminated && !qState.answered ? "line-through" : "none" }]}>
                      {option}
                    </Text>
                    {qState.answered && isAnswer ? <Ionicons name="checkmark-circle" size={20} color={colors.mint} /> : null}
                    {qState.answered && isChosen && !isAnswer ? <Ionicons name="close-circle" size={20} color={colors.tomato} /> : null}
                  </Pressable>
                );
              })}
            </View>

            {qState.answered ? (
              <View style={[styles.feedback, { backgroundColor: qState.correct && !qState.hinted && !qState.revealed ? colors.mintSoft : qState.correct ? colors.violetSoft : colors.tomatoSoft }]}>
                <Text style={{ color: qState.correct && (qState.xpAwarded || 0) > 0 ? colors.mint : qState.correct ? colors.violet : colors.tomato, fontWeight: "800" }}>
                  {qState.correct && (qState.xpAwarded || 0) > 0
                    ? `Correct! +${qState.xpAwarded || TUTOR_MCQ_XP} EXP`
                    : qState.correct
                      ? "Correct — no EXP with hint/reveal (does not count toward lesson completion)"
                    : qState.feedback?.title || `The correct answer is ${qState.correctAnswer || currentQuestion.answer}`}
                </Text>
                {qState.feedback?.whySelected ? (
                  <Text style={[styles.feedbackBody, { color: colors.text }]}>{qState.feedback.whySelected}</Text>
                ) : null}
                {qState.feedback?.whyCorrect ? (
                  <>
                    <Text style={[styles.feedbackWhyLabel, { color: qState.correct ? colors.mint : colors.tomato }]}>
                      {qState.correct ? "Why this is right" : "Correct answer"}
                    </Text>
                    <Text style={[styles.feedbackBody, { color: colors.text }]}>{qState.feedback.whyCorrect}</Text>
                  </>
                ) : !qState.correct ? (
                  <Text style={[styles.feedbackBody, { color: colors.text }]}>
                    The correct answer is {qState.correctAnswer || currentQuestion.answer}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.actions}>
          {phase === "explain" ? (
            <Pressable
              onPress={goNext}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.mint, flex: 1 }, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>I Understand</Text>
            </Pressable>
          ) : qState.answered ? (
            <Pressable
              onPress={goNext}
              disabled={submitting}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.mint, flex: 1 }, pressed && styles.pressed]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isLastStep ? "Complete lesson" : "Continue"}
                </Text>
              )}
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={() => submitAnswer({ revealed: true })}
                disabled={submitting}
                style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border }, pressed && styles.pressed]}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Reveal</Text>
              </Pressable>
              <Pressable
                onPress={() => submitAnswer({ answer: qState.selected })}
                disabled={submitting || !qState.selected || !hasValidMcqChoices(currentQuestion)}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.mint,
                    flex: 1,
                    opacity: qState.selected && hasValidMcqChoices(currentQuestion) ? 1 : 0.5,
                  },
                  pressed && styles.pressed,
                ]}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Check</Text>}
              </Pressable>
            </>
          )}
        </View>

        {phase === "quiz" && !qState.answered && !qState.revealed ? (
          <Pressable
            onPress={useHint}
            disabled={hintBusy || !canHint}
            accessibilityRole="button"
            accessibilityLabel="Use a hint to gray out one incorrect answer"
            style={({ pressed }) => [
              styles.hintFab,
              { backgroundColor: colors.amberSoft, borderColor: colors.amber, opacity: !canHint ? 0.45 : 1 },
              pressed && canHint && styles.pressed,
            ]}
          >
            {hintBusy ? (
              <ActivityIndicator size="small" color={colors.amber} />
            ) : (
              <Ionicons name="key-outline" size={18} color={colors.amber} />
            )}
            <Text style={[styles.hintFabText, { color: colors.amber }]}>
              {!remainingWrong.length ? "No more hints" : "Use a hint"}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    scroll: {
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xl * 2,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    blockedScroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingVertical: SPACING.lg,
    },
    muted: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },
    progressSection: { marginBottom: SPACING.sm },
    progressMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    progressLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
    progressCount: { color: colors.text, fontSize: 12, fontWeight: "800" },
    progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 3 },
    hud: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: SPACING.sm,
    },
    navBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6, paddingHorizontal: 4, minWidth: 56 },
    navText: { color: colors.text, fontSize: 12, fontWeight: "700" },
    statsCluster: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" },
    levelBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: SPACING.sm,
    },
    levelLabel: { color: colors.text, fontSize: 11, fontWeight: "800", minWidth: 52 },
    levelTrack: { flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
    levelFill: { height: "100%", borderRadius: 3 },
    levelMeta: { color: colors.textMuted, fontSize: 10, fontWeight: "700", minWidth: 72, textAlign: "right" },
    statPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    statText: { fontSize: 12, fontWeight: "900" },
    lessonTitle: {
      color: colors.text,
      fontSize: compact ? 20 : 22,
      fontWeight: "900",
      letterSpacing: -0.3,
      marginBottom: SPACING.md,
    },
    stepCard: {
      borderWidth: 1.5,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    questionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: SPACING.sm },
    typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill },
    typeBadgeText: { fontSize: 10, fontWeight: "800" },
    deckName: { flex: 1, color: colors.textMuted, fontSize: 11, fontWeight: "600", textAlign: "right" },
    promptLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.7,
      marginBottom: 8,
    },
    stepTitle: {
      color: colors.text,
      fontSize: compact ? 17 : 19,
      fontWeight: "800",
      lineHeight: compact ? 24 : 27,
      marginBottom: SPACING.sm,
    },
    stepContent: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 23,
    },
    explainLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.4,
      marginBottom: 8,
      marginTop: 4,
    },
    answerBox: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    answerText: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 24,
      fontWeight: "600",
    },
    optionsWrap: {
      gap: 8,
      marginTop: 4,
    },
    optionBtn: {
      borderWidth: 1.5,
      borderRadius: RADIUS.lg,
      paddingVertical: 12,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    optionLabelWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    optionLabel: {
      fontWeight: "900",
      fontSize: 13,
    },
    optionText: {
      flex: 1,
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 20,
    },
    feedback: {
      marginTop: SPACING.md,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      gap: 8,
    },
    feedbackWhyLabel: {
      marginTop: 4,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    feedbackBody: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    actions: {
      flexDirection: "row",
      gap: SPACING.sm,
    },
    errorActions: {
      width: "100%",
      maxWidth: 320,
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    errorActionBtn: {
      alignSelf: "stretch",
      width: "100%",
    },
    primaryBtn: {
      height: 48,
      borderRadius: RADIUS.lg,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    primaryBtnText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 15,
    },
    secondaryBtn: {
      height: 48,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    secondaryBtnText: {
      fontWeight: "700",
      fontSize: 13,
    },
    hintFab: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      alignSelf: "center",
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginTop: SPACING.md,
    },
    hintFabText: { fontSize: 13, fontWeight: "800" },
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
    },
    pressed: {
      opacity: 0.85,
    },
  });
