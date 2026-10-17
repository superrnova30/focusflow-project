import React, { useState, useEffect, useMemo, useLayoutEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  Switch,
  useWindowDimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { deckAccent } from "../lib/deckColors";
import {
  resolveCollectionId,
  normalizeMemorizePayload,
  cardsToMemorizeQuestions,
  applyQuestionStyle,
  DEFAULT_MEMORIZE_SETTINGS,
} from "../lib/collectionStudy";
import { RADIUS, SPACING } from "../theme/theme";
import { handleLimitError, startGoUnlimitedCheckout } from "../lib/upgradePrompt";
import HeartsBlockedPanel from "../components/HeartsBlockedPanel";
import { formatRefillCountdown, isHeartsBlocked } from "../lib/hearts";
import { setCachedCoins } from "../lib/coins";
import { notifyTasksChanged } from "../lib/tasks";
import HighlightedAnswer from "../components/HighlightedAnswer";

const MAX_HEARTS = 5;
const XP_PER_CORRECT = 5;
const OPTION_LABELS = ["A", "B", "C", "D"];

const QUESTION_STYLE_OPTIONS = [
  { id: "mixed", label: "Mixed", desc: "Rotate MCQ, typing, and flashcards" },
  { id: "mcq", label: "Multiple choice only", desc: "Always show answer choices" },
  { id: "typing", label: "Typing preferred", desc: "Type the answer from memory" },
  { id: "flashcards", label: "Flashcards only", desc: "Reveal the answer, then continue" },
];

const emptyQuestionState = () => ({
  answered: false,
  correct: false,
  selectedAnswer: "",
  typedAnswer: "",
  optionsVisible: false,
  eliminatedOptions: [],
  clue: "",
  revealedAnswer: "",
  usedHint3: false,
  flipped: false,
  revealed: false,
  skipped: false,
  xpAwarded: 0,
});

export default function FlashcardMemorizeScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const routeCollection = route.params?.collection;
  const collectionId = resolveCollectionId(route.params);
  const [collection, setCollection] = useState(routeCollection || null);
  const accent = deckAccent(collection?.color, colors);

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [game, setGame] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_MEMORIZE_SETTINGS);
  const [lightningSeconds, setLightningSeconds] = useState(15);
  const [questionStates, setQuestionStates] = useState([]);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState("quiz");
  const [showSettings, setShowSettings] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [timerLeft, setTimerLeft] = useState(null);
  const [refillLabel, setRefillLabel] = useState("");
  const [buying, setBuying] = useState(null);

  const xpScale = useRef(new Animated.Value(1)).current;
  const floatOpacity = useRef(new Animated.Value(0)).current;
  const floatTranslate = useRef(new Animated.Value(0)).current;
  const [floatText, setFloatText] = useState("");

  const current = questions[index];
  const qState = questionStates[index] || emptyQuestionState();
  const progressPct = questions.length ? Math.round(((index + (qState.answered ? 1 : 0)) / questions.length) * 100) : 0;
  const levelPct = game?.level?.step
    ? Math.min(100, Math.round((game.level.xpWithinLevel / game.level.step) * 100))
    : 0;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: phase === "complete" ? "Deck complete" : "Memorize",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Modes",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
      headerRight:
        phase === "complete"
          ? undefined
          : () => (
              <Pressable onPress={() => setShowSettings(true)} hitSlop={12} style={{ marginRight: 4 }}>
                <Ionicons name="settings-outline" size={22} color={colors.text} />
              </Pressable>
            ),
    });
  }, [navigation, colors.text, colors.bg, phase]);

  const loadSession = useCallback(async () => {
    if (!collectionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.get(`/flashcards/collections/${collectionId}/study/memorize`);
      let { questions: qs, game: loadedGame, lightningSeconds: seconds } = normalizeMemorizePayload(data);

      if (data.collection) {
        setCollection((prev) => ({ ...prev, ...data.collection }));
      }

      if (!qs.length) {
        const { data: collectionData } = await client.get(`/flashcards/collections/${collectionId}`);
        const cards = collectionData.collection?.flashcards || [];
        setCollection(collectionData.collection);
        qs = cardsToMemorizeQuestions(cards, loadedGame?.settings?.questionStyle);
      }

      if (!qs.length) {
        Alert.alert("No cards in this deck", "Add flashcards to this deck before studying.");
        setQuestions([]);
        setQuestionStates([]);
        return;
      }

      setQuestions(qs);
      setQuestionStates(qs.map(() => emptyQuestionState()));
      setGame(loadedGame);
      setSettings(loadedGame?.settings || DEFAULT_MEMORIZE_SETTINGS);
      setLightningSeconds(seconds);
      setIndex(0);
      setSessionCorrect(0);
      setSessionXp(0);
      setPhase(isHeartsBlocked(loadedGame) ? "blocked" : "quiz");
    } catch (e) {
      try {
        const { data: stateRes } = await client.get("/game/state");
        if (isHeartsBlocked(stateRes.state)) {
          setGame((g) => ({
            ...(g || {}),
            hearts: 0,
            coins: stateRes.state.coins || 0,
            heartsBlocked: true,
            heartsRefillAt: stateRes.state.heartsRefillAt,
            unlimitedHearts: stateRes.state.unlimitedHearts,
          }));
          setPhase("blocked");
          return;
        }
      } catch {
        // ignore and try a local fallback below
      }
      try {
        const { data: collectionData } = await client.get(`/flashcards/collections/${collectionId}`);
        const cards = collectionData.collection?.flashcards || [];
        setCollection(collectionData.collection);
        const qs = cardsToMemorizeQuestions(cards, settings?.questionStyle || game?.settings?.questionStyle);
        if (qs.length) {
          setQuestions(qs);
          setQuestionStates(qs.map(() => emptyQuestionState()));
          setPhase("quiz");
          return;
        }
      } catch {
        // fall through to alert below
      }
      Alert.alert("Could not start study session", e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!game?.heartsRefillAt) {
      setRefillLabel("");
      return undefined;
    }
    const tick = () => setRefillLabel(formatRefillCountdown(game.heartsRefillAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game?.heartsRefillAt]);

  const animateXp = () => {
    xpScale.setValue(1);
    Animated.sequence([
      Animated.timing(xpScale, { toValue: 1.28, duration: 180, useNativeDriver: true }),
      Animated.timing(xpScale, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  };

  const showFloat = (text) => {
    setFloatText(text);
    floatOpacity.setValue(0);
    floatTranslate.setValue(8);
    Animated.parallel([
      Animated.timing(floatOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(floatTranslate, { toValue: -24, duration: 800, useNativeDriver: true }),
    ]).start();
    setTimeout(() => floatOpacity.setValue(0), 800);
  };

  const patchQuestionState = (patch) => {
    setQuestionStates((prev) => {
      const next = [...prev];
      next[index] = { ...(next[index] || emptyQuestionState()), ...patch };
      return next;
    });
  };

  const saveSettings = async (nextSettings, { restyle = false, close = false } = {}) => {
    const merged = { ...DEFAULT_MEMORIZE_SETTINGS, ...(settings || {}), ...nextSettings };
    setSettings(merged);
    if (restyle) {
      setQuestions((currentQuestions) => applyQuestionStyle(currentQuestions, questionStates, merged.questionStyle));
      setQuestionStates((prev) =>
        prev.map((state) =>
          state?.answered
            ? state
            : {
                ...state,
                optionsVisible: false,
                eliminatedOptions: [],
                flipped: false,
                revealed: false,
              }
        )
      );
    }
    if (close) setShowSettings(false);
    setSavingSettings(true);
    try {
      const { data } = await client.put("/game/memorize-settings", merged);
      setSettings(data.settings);
    } catch (e) {
      Alert.alert("Could not save settings", e?.response?.data?.error || e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const submitAnswer = async ({
    answer = "",
    selfCorrect = false,
    timedOut = false,
    skipped = false,
  } = {}) => {
    if (!current || qState.answered || submitting || phase !== "quiz") return false;
    if (isHeartsBlocked(game)) {
      setPhase("blocked");
      return false;
    }

    setSubmitting(true);
    try {
      const { data } = await client.post(`/flashcards/collections/${collectionId}/study/memorize/answer`, {
        cardId: current.cardId,
        answer,
        questionType: current.type,
        timedOut,
        skipped,
        selfCorrect,
        usedHint3: qState.usedHint3,
        answerRevealed: Boolean(qState.revealed || qState.usedHint3),
      });

      patchQuestionState({
        answered: true,
        correct: data.correct,
        selfRatedKnown: Boolean(data.selfRatedKnown),
        selectedAnswer: answer,
        xpAwarded: data.xpAwarded || 0,
        skipped,
      });

      setGame(data.game);
      if (data.game?.coins != null) setCachedCoins(data.game.coins);
      if (data.correct) {
        setSessionCorrect((c) => c + 1);
        if (data.xpAwarded) {
          setSessionXp((x) => x + data.xpAwarded);
          animateXp();
          showFloat(data.comboHit ? `Combo! +${data.xpAwarded} XP · +${data.coinsEarned || 1} coin` : `+${data.xpAwarded} XP`);
        }
        if (data.leveledUp) {
          Alert.alert("Level up!", `You reached level ${data.game.level.current}.`);
        }
      } else if (!skipped) {
        if (data.selfRatedKnown) {
          showFloat("Reviewed");
        } else if (current.type === "flashcard" && (qState.revealed || qState.usedHint3) && settings?.questionStyle === "flashcards") {
          showFloat("Keep practicing");
        } else {
          showFloat(data.game?.unlimitedHearts ? "Keep going" : "-1 ❤️");
        }
      }

      if (isHeartsBlocked(data.game || { heartsBlocked: data.heartsBlocked, hearts: data.game?.hearts })) {
        setGame((g) => ({
          ...(data.game || g),
          heartsBlocked: true,
          heartsRefillAt: data.heartsRefillAt || data.game?.heartsRefillAt || g?.heartsRefillAt,
        }));
        setPhase("gameover");
      }
    } catch (e) {
      if ((e?.response?.data?.code === "HEARTS_DEPLETED" || e?.response?.data?.heartsBlocked) && !game?.unlimitedHearts) {
        setPhase("blocked");
        setGame((g) => ({
          ...g,
          ...(e.response?.data?.game || {}),
          hearts: 0,
          coins: e.response?.data?.coins ?? g?.coins ?? 0,
          heartsBlocked: true,
          heartsRefillAt: e.response?.data?.heartsRefillAt,
        }));
        return false;
      }
      if ((e?.response?.status === 403 || e?.upgradeRequired) && !game?.unlimitedHearts) {
        if (handleLimitError(navigation, e)) return false;
        setPhase("blocked");
        setGame((g) => ({
          ...g,
          heartsBlocked: true,
          heartsRefillAt: e.heartsRefillAt || e.response?.data?.heartsRefillAt,
        }));
        return false;
      }
      Alert.alert("Error", e?.response?.data?.error || e.message);
      return false;
    } finally {
      setSubmitting(false);
    }
    return true;
  };

  const revealCard = () => {
    if (!current || qState.answered || qState.revealed) return;
    patchQuestionState({
      revealed: true,
      flipped: true,
      revealedAnswer: current.answer,
    });
  };

  const useHint = async (hintType) => {
    if (!current || qState.answered || hintBusy) return;
    if (hintType === 3 && qState.usedHint3 && qState.revealedAnswer) {
      setShowHints(false);
      return;
    }
    if (!game?.unlimitedHints && (game?.hints ?? 0) <= 0) {
      handleLimitError(navigation, {
        upgradeRequired: true,
        code: "NO_HINTS_REMAINING",
        message: "No hints remaining today. Upgrade to Go Unlimited for unlimited hints.",
      });
      return;
    }

    const visibleOptions =
      current.type === "mcq"
        ? (current.options || []).filter((opt) => !qState.eliminatedOptions.includes(opt))
        : [];
    if (hintType === 1 && current.type === "mcq") {
      const remainingWrong = visibleOptions.filter((opt) => opt !== current.answer);
      if (!remainingWrong.length) {
        Alert.alert("Already narrowed", "There are no more incorrect choices to remove.");
        return;
      }
    }

    setHintBusy(true);
    try {
      const { data } = await client.post(`/flashcards/collections/${collectionId}/study/memorize/hint`, {
        cardId: current.cardId,
        hintType,
        options: visibleOptions,
      });

      setGame((g) => ({ ...g, hints: data.hintsRemaining, unlimitedHints: data.unlimitedHints }));

      if (hintType === 1) {
        const nextOptions = Array.isArray(data.options) && data.options.length >= 2 ? data.options : current.options;
        if (current.type !== "mcq" && nextOptions?.length) {
          setQuestions((qs) =>
            qs.map((question, idx) => (idx === index ? { ...question, type: "mcq", options: nextOptions } : question))
          );
        }
        patchQuestionState({
          optionsVisible: true,
          eliminatedOptions: [...new Set([...(qState.eliminatedOptions || []), ...(data.eliminatedOptions || [])])],
        });
      } else if (hintType === 2) {
        patchQuestionState({ clue: data.clue || qState.clue || "Think about the core idea on this card." });
      } else if (hintType === 3) {
        const answer = data.answer || current.answer;
        patchQuestionState({
          revealedAnswer: answer,
          usedHint3: true,
          ...(current.type === "flashcard" ? { revealed: true, flipped: true } : {}),
        });
      }
      setShowHints(false);
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
      setGame((g) => ({
        ...g,
        hearts: data.hearts,
        coins: data.coins,
        heartsBlocked: false,
        heartsRefillAt: null,
      }));
      if (data.coins != null) setCachedCoins(data.coins);
      Alert.alert("Heart revived", quantity > 1 ? `You restored ${quantity} hearts.` : "You revived 1 heart. You can continue.");
      setPhase("quiz");
    } catch (e) {
      Alert.alert("Unable to revive", e.response?.data?.error || e.message || "Please try again.");
    } finally {
      setBuying(null);
    }
  };

  const restoreHeartsIfReady = async () => {
    try {
      const { data } = await client.get("/game/state");
      setGame((g) => ({
        ...g,
        ...(data.state || {}),
        heartsBlocked: data.state?.heartsBlocked,
      }));
      if (!isHeartsBlocked(data.state)) {
        setPhase("quiz");
      }
    } catch {
      loadSession();
    }
  };

  const finishSession = async () => {
    const answeredCount = (questionStates || []).filter((state) => state?.answered).length;
    if (answeredCount < questions.length) {
      Alert.alert("Keep going", "Review every flashcard in this deck before finishing Memorize.");
      return;
    }
    try {
      await client.post(`/flashcards/collections/${collectionId}/study/memorize/complete`, {
        correct: sessionCorrect,
        total: questions.length,
        answered: answeredCount,
        xpEarned: sessionXp,
      });
      notifyTasksChanged({ collectionId });
      setPhase("complete");
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message);
    }
  };

  const goNext = () => {
    if (index + 1 >= questions.length) {
      finishSession();
      return;
    }
    setIndex((i) => i + 1);
  };

  const continueAfterReveal = async () => {
    if (!current) return;
    if (!qState.answered) {
      const ok = await submitAnswer({ skipped: true });
      if (ok === false) return;
    }
    goNext();
  };

  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  const revealOptions = () => {
    patchQuestionState({ optionsVisible: true });
  };

  // Lightning round timer
  useEffect(() => {
    if (phase !== "quiz" || !settings?.lightningRounds || !current || qState.answered || qState.revealed) {
      setTimerLeft(null);
      return undefined;
    }
    if (current.type === "mcq" && settings.hideOptionsInitially && !qState.optionsVisible) {
      setTimerLeft(null);
      return undefined;
    }

    setTimerLeft(lightningSeconds);
    const interval = setInterval(() => {
      setTimerLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          submitAnswer({ timedOut: true });
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [index, phase, settings?.lightningRounds, current?.id, qState.answered, qState.optionsVisible]);

  const visibleOptions = useMemo(() => {
    if (!current?.options) return [];
    return current.options.filter((opt) => !qState.eliminatedOptions.includes(opt));
  }, [current, qState.eliminatedOptions]);

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
          name={i < (game?.hearts ?? 0) ? "heart" : "heart-outline"}
          size={compact ? 16 : 18}
          color={i < (game?.hearts ?? 0) ? "#FF5A76" : colors.border}
        />
      ))
    );

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={accent.color} size="large" />
          <Text style={styles.muted}>Building your memorize session…</Text>
        </View>
      </Screen>
    );
  }

  if (phase === "blocked" || phase === "gameover") {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.blockedScroll} showsVerticalScrollIndicator={false}>
          <HeartsBlockedPanel
            coins={game?.coins || 0}
            hearts={game?.hearts || 0}
            refillAt={game?.heartsRefillAt}
            buying={buying}
            title={phase === "gameover" ? "Memorize paused" : "Quiz unavailable"}
            message="You ran out of hearts after incorrect answers. Wait 24 hours for a full refill, or spend coins to revive hearts and keep studying."
            onRevive={() => buyHearts(1)}
            onRefillAll={(qty) => buyHearts(qty)}
            onCheckAgain={restoreHeartsIfReady}
            onBack={() => navigation.goBack()}
            onUpgrade={() => startGoUnlimitedCheckout(navigation)}
            continueLabel="Continue studying"
            summary={
              phase === "gameover" ? (
                <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={styles.summaryRow}>Correct: {sessionCorrect}/{index + (qState.answered ? 1 : 0)}</Text>
                  <Text style={styles.summaryRow}>XP earned: +{sessionXp}</Text>
                </View>
              ) : null
            }
          />
        </ScrollView>
      </Screen>
    );
  }

  if (phase === "complete") {
    const total = questions.length;
    const pct = total ? Math.round((sessionCorrect / total) * 100) : 0;
    const missed = Math.max(0, total - sessionCorrect);
    const skippedCount = questionStates.filter((state) => state?.skipped).length;
    const tone = pct >= 80 ? "mint" : pct >= 50 ? "amber" : "tomato";
    const toneColor = colors[tone];
    const toneSoft = colors[`${tone}Soft`];
    const headline =
      pct >= 90
        ? "Outstanding recall"
        : pct >= 70
          ? "Great work"
          : pct >= 40
            ? "Solid start"
            : "Keep going";
    const subtitle =
      pct >= 90
        ? "You know this deck cold. A quick review later will keep it fresh."
        : pct >= 70
          ? "This deck is sticking. One more round will lock in the rest."
          : pct >= 40
            ? "You're building memory. Review the missed cards and try again."
            : "Review the answers, then run Memorize again to raise your score.";
    const missedCards = questions
      .map((item, idx) => ({ item, state: questionStates[idx] }))
      .filter(({ state }) => state?.answered && !state.correct)
      .slice(0, 6);
    const stats = [
      { label: "Correct", value: String(sessionCorrect), icon: "checkmark-circle", color: colors.mint, soft: colors.mintSoft },
      { label: "Missed", value: String(missed), icon: "close-circle", color: colors.tomato, soft: colors.tomatoSoft },
      { label: "XP earned", value: `+${sessionXp}`, icon: "flash", color: colors.amber, soft: colors.amberSoft },
      { label: "Cards", value: String(total), icon: "layers", color: colors.violet, soft: colors.violetSoft },
    ];

    return (
      <Screen>
        <ScrollView
          contentContainerStyle={styles.completeScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.completePage}>
            <View style={[styles.completeHero, { backgroundColor: toneSoft, borderColor: toneColor }]}>
              <View style={[styles.completeIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name={pct >= 70 ? "trophy" : pct >= 40 ? "ribbon" : "refresh"} size={32} color={toneColor} />
              </View>
              <Text style={styles.completeKicker}>{collection?.name || "This deck"}</Text>
              <Text style={styles.completeTitle}>Deck complete</Text>
              <Text style={styles.completeHeadline}>{headline}</Text>
              <Text style={styles.completeCopy}>{subtitle}</Text>
            </View>

            <View style={[styles.scorePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.scoreBadge, { backgroundColor: toneSoft, borderColor: toneColor }]}>
                <Text style={[styles.scorePct, { color: toneColor }]}>{pct}%</Text>
                <Text style={[styles.scorePctLabel, { color: toneColor }]}>accuracy</Text>
              </View>
              <View style={styles.scoreMeta}>
                <Text style={styles.scoreMetaTitle}>
                  {sessionCorrect} of {total} correct
                </Text>
                <Text style={styles.scoreMetaCopy}>
                  {skippedCount > 0
                    ? `${missed} missed · ${skippedCount} skipped · +${sessionXp} XP`
                    : `${missed} missed · +${sessionXp} XP this round`}
                </Text>
                <View style={[styles.scoreTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.scoreFill, { width: `${pct}%`, backgroundColor: toneColor }]} />
                </View>
              </View>
            </View>

            <View style={styles.statGrid}>
              {stats.map((stat) => (
                <View
                  key={stat.label}
                  style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.statIcon, { backgroundColor: stat.soft }]}>
                    <Ionicons name={stat.icon} size={16} color={stat.color} />
                  </View>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>

            {game?.level ? (
              <View style={[styles.completeLevel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={styles.completeLevelLabel}>Level {game.level.current ?? 1}</Text>
                <View style={[styles.levelTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.levelFill, { width: `${levelPct}%`, backgroundColor: colors.amber }]} />
                </View>
                <Text style={styles.completeLevelMeta}>
                  {game.level.xpWithinLevel ?? 0}/{game.level.step ?? 500} XP
                </Text>
              </View>
            ) : null}

            {missedCards.length > 0 ? (
              <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={styles.reviewTitle}>Cards to review</Text>
                {missedCards.map(({ item }, idx) => (
                  <View
                    key={item.id || `${item.question}-${idx}`}
                    style={[styles.reviewRow, idx < missedCards.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                  >
                    <View style={[styles.reviewDot, { backgroundColor: colors.tomatoSoft }]}>
                      <Ionicons name="close" size={12} color={colors.tomato} />
                    </View>
                    <Text style={styles.reviewText} numberOfLines={2}>
                      {item.question}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.completeActions}>
              <Pressable
                onPress={loadSession}
                style={({ pressed }) => [
                  styles.completePrimary,
                  { backgroundColor: accent.color },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.completePrimaryText}>Study this deck again</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [
                  styles.completeSecondary,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="grid-outline" size={18} color={colors.text} />
                <Text style={[styles.completeSecondaryText, { color: colors.text }]}>Back to study modes</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>No cards in this deck yet.</Text>
        </View>
      </Screen>
    );
  }

  const optionsShouldHide =
    current.type === "mcq"
    && settings?.hideOptionsInitially
    && settings?.questionStyle !== "mcq"
    && !qState.optionsVisible
    && !qState.answered;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.page}>
          {/* Progress */}
          <View style={styles.progressSection}>
            <View style={styles.progressMeta}>
              <Text style={styles.progressLabel}>Progress</Text>
              <Text style={styles.progressCount}>
                {Math.min(index + 1, questions.length)} / {questions.length}
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: accent.color }]} />
            </View>
          </View>

          {/* HUD: nav + stats */}
          <View style={styles.hud}>
            <Pressable
              onPress={goPrev}
              disabled={index === 0}
              style={({ pressed }) => [styles.navBtn, { opacity: index === 0 ? 0.35 : pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
              <Text style={styles.navText}>Prev</Text>
            </Pressable>

            <View style={styles.statsCluster}>
              <Pressable onPress={() => setShowHints(true)} style={[styles.statPill, { backgroundColor: colors.amberSoft }]}>
                <Ionicons name="key" size={14} color={colors.amber} />
                <Text style={[styles.statText, { color: colors.amber }]}>
                  {game?.unlimitedHints ? "∞" : game?.hints ?? 0}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => isHeartsBlocked(game) && setPhase("blocked")}
                accessibilityRole="button"
                accessibilityLabel={game?.unlimitedHearts ? "Unlimited hearts" : (game?.hearts || 0) <= 0 ? "Out of hearts. Open revive options." : `${game?.hearts || 0} hearts remaining`}
                style={[styles.statPill, { backgroundColor: colors.tomatoSoft }]}
              >
                {renderHearts()}
              </Pressable>
              <Animated.View style={{ transform: [{ scale: xpScale }] }}>
                <View style={[styles.statPill, { backgroundColor: colors.violetSoft }]}>
                  <Ionicons name="flash" size={14} color={colors.violet} />
                  <Text style={[styles.statText, { color: colors.violet }]}>{game?.xp ?? 0}</Text>
                </View>
              </Animated.View>
            </View>

            <Pressable
              onPress={goNext}
              disabled={!qState.answered}
              style={({ pressed }) => [
                styles.navBtn,
                { opacity: !qState.answered ? 0.35 : pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.navText}>Next</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </Pressable>
          </View>

          {/* Level XP bar */}
          <View style={[styles.levelBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.levelLabel}>Level {game?.level?.current ?? 1}</Text>
            <View style={[styles.levelTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.levelFill, { width: `${levelPct}%`, backgroundColor: colors.amber }]} />
            </View>
            <Text style={styles.levelMeta}>
              {game?.level?.xpWithinLevel ?? 0}/{game?.level?.step ?? 500} XP
            </Text>
          </View>

          {settings?.lightningRounds && timerLeft != null ? (
            <View style={[styles.timerBanner, { backgroundColor: timerLeft <= 5 ? colors.tomatoSoft : colors.amberSoft }]}>
              <Ionicons name="flash" size={16} color={timerLeft <= 5 ? colors.tomato : colors.amber} />
              <Text style={[styles.timerText, { color: timerLeft <= 5 ? colors.tomato : colors.amber }]}>
                Lightning round · {timerLeft}s
              </Text>
            </View>
          ) : null}

          {/* Question card */}
          <View style={[styles.questionCard, { backgroundColor: colors.surface, borderColor: accent.color }]}>
            <View style={styles.questionHeader}>
              <View style={[styles.typeBadge, { backgroundColor: accent.soft }]}>
                <Text style={[styles.typeBadgeText, { color: accent.color }]}>
                  {current.type === "mcq" ? "Multiple choice" : current.type === "typing" ? "Type answer" : "Flashcard"}
                </Text>
              </View>
              {collection?.name ? (
                <Text style={styles.deckName} numberOfLines={1}>
                  {collection.name}
                </Text>
              ) : null}
            </View>
            <Text style={styles.questionText}>{current.question}</Text>

            {qState.clue ? (
              <View style={[styles.clueBox, { backgroundColor: colors.amberSoft, borderColor: colors.amber }]}>
                <Ionicons name="bulb-outline" size={16} color={colors.amber} />
                <Text style={[styles.clueText, { color: colors.text }]}>{qState.clue}</Text>
              </View>
            ) : null}

            {qState.revealedAnswer && current.type !== "flashcard" ? (
              <View style={[styles.clueBox, { backgroundColor: colors.violetSoft, borderColor: colors.violet }]}>
                <Ionicons name="eye-outline" size={16} color={colors.violet} />
                <Text style={[styles.clueText, { color: colors.text }]}>{qState.revealedAnswer}</Text>
              </View>
            ) : null}

            {/* MCQ */}
            {current.type === "mcq" && !qState.revealed ? (
              <>
                {optionsShouldHide ? (
                  <Pressable
                    onPress={revealOptions}
                    style={({ pressed }) => [styles.showOptionsBtn, { borderColor: accent.color, backgroundColor: accent.soft }, pressed && styles.pressed]}
                  >
                    <Ionicons name="list-outline" size={18} color={accent.color} />
                    <Text style={[styles.showOptionsText, { color: accent.color }]}>Show options</Text>
                  </Pressable>
                ) : (
                  <View style={styles.optionsWrap}>
                    {visibleOptions.map((opt, oi) => {
                      const isChosen = qState.selectedAnswer === opt;
                      const isAnswer = opt === current.answer;
                      let borderColor = colors.border;
                      let bg = colors.bg;
                      let textColor = colors.text;
                      if (qState.answered) {
                        if (isAnswer) {
                          borderColor = colors.mint;
                          bg = colors.mintSoft;
                          textColor = colors.mint;
                        } else if (isChosen) {
                          borderColor = colors.tomato;
                          bg = colors.tomatoSoft;
                          textColor = colors.tomato;
                        }
                      }
                      return (
                        <Pressable
                          key={`${opt}-${oi}`}
                          disabled={qState.answered || submitting}
                          onPress={() => submitAnswer({ answer: opt })}
                          style={({ pressed }) => [styles.option, { borderColor, backgroundColor: bg, opacity: pressed ? 0.88 : 1 }]}
                        >
                          <View style={[styles.optionLabel, { backgroundColor: colors.surface }]}>
                            <Text style={styles.optionLabelText}>{OPTION_LABELS[oi] || "?"}</Text>
                          </View>
                          <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
                          {qState.answered && isAnswer ? <Ionicons name="checkmark-circle" size={20} color={colors.mint} /> : null}
                          {qState.answered && isChosen && !isAnswer ? <Ionicons name="close-circle" size={20} color={colors.tomato} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            ) : null}

            {/* Typing */}
            {current.type === "typing" && !qState.revealed ? (
              <>
                <TextInput
                  value={qState.typedAnswer}
                  onChangeText={(text) => patchQuestionState({ typedAnswer: text })}
                  editable={!qState.answered}
                  placeholder="Type your answer…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={[styles.typeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                />
                {!qState.answered ? (
                  <Pressable
                    onPress={() => submitAnswer({ answer: qState.typedAnswer })}
                    disabled={submitting || !qState.typedAnswer.trim()}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: accent.color, opacity: !qState.typedAnswer.trim() ? 0.5 : pressed ? 0.88 : 1 },
                    ]}
                  >
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Check answer</Text>}
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {/* Flashcard — answer is shown after Reveal */}
            {current.type === "flashcard" && (qState.revealed || qState.answered) ? (
              <View style={[styles.flipBack, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Text style={styles.flipLabel}>Answer</Text>
                <HighlightedAnswer
                  card={current}
                  text={current.back || current.answer}
                  highlight={current.answerHighlight}
                  style={styles.flipText}
                />
              </View>
            ) : null}

            {!qState.answered && !qState.revealed ? (
              <Pressable
                onPress={revealCard}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: accent.color, marginTop: SPACING.sm },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="eye-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Reveal</Text>
              </Pressable>
            ) : null}

            {current.type === "flashcard" && qState.revealed && !qState.answered ? (
              <View style={styles.flashActions}>
                <Pressable
                  onPress={() => submitAnswer({ selfCorrect: true })}
                  disabled={submitting}
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.mint, flex: 1 }, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryBtnText}>I knew it</Text>
                </Pressable>
                <Pressable
                  onPress={() => submitAnswer({ selfCorrect: false })}
                  disabled={submitting}
                  style={({ pressed }) => [styles.dangerBtn, { borderColor: colors.tomato, flex: 1 }, pressed && styles.pressed]}
                >
                  <Text style={[styles.dangerBtnText, { color: colors.tomato }]}>I missed it</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Feedback */}
            {qState.answered && !qState.skipped ? (
              <View
                style={[
                  styles.feedback,
                  {
                    backgroundColor: qState.correct
                      ? colors.mintSoft
                      : qState.selfRatedKnown
                        ? colors.violetSoft
                        : colors.tomatoSoft,
                  },
                ]}
              >
                <Text
                  style={{
                    color: qState.correct ? colors.mint : qState.selfRatedKnown ? colors.violet : colors.tomato,
                    fontWeight: "800",
                  }}
                >
                  {qState.correct
                    ? `Correct! +${qState.xpAwarded || XP_PER_CORRECT} XP`
                    : qState.selfRatedKnown
                      ? "Reviewed — no EXP after revealing"
                      : `Incorrect — ${current.answer}`}
                </Text>
              </View>
            ) : null}

            {qState.answered && current.type !== "flashcard" && (current.back || current.answer) ? (
              <View style={[styles.flipBack, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Text style={styles.flipLabel}>Answer</Text>
                <HighlightedAnswer
                  card={current}
                  text={current.back || current.answer}
                  highlight={current.answerHighlight}
                  style={styles.flipText}
                />
              </View>
            ) : null}

            <Animated.View style={{ opacity: floatOpacity, transform: [{ translateY: floatTranslate }], alignItems: "center" }}>
              {floatText ? <Text style={styles.floatText}>{floatText}</Text> : null}
            </Animated.View>

            {qState.answered || (qState.revealed && current.type !== "flashcard") ? (
              <Pressable
                onPress={qState.answered ? goNext : continueAfterReveal}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: accent.color, marginTop: SPACING.sm, opacity: submitting ? 0.7 : pressed ? 0.88 : 1 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>{index + 1 >= questions.length ? "Finish deck" : "Continue"}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />
                  </>
                )}
              </Pressable>
            ) : null}
          </View>

          {!qState.answered && !qState.revealed ? (
            <Pressable onPress={() => setShowHints(true)} style={({ pressed }) => [styles.hintFab, { backgroundColor: colors.amberSoft, borderColor: colors.amber }, pressed && styles.pressed]}>
              <Ionicons name="key-outline" size={18} color={colors.amber} />
              <Text style={[styles.hintFabText, { color: colors.amber }]}>Use a hint</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {/* Hints modal */}
      <Modal visible={showHints} transparent animationType="fade" onRequestClose={() => setShowHints(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHints(false)} accessibilityLabel="Close hints" />
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.modalTitle}>Hint keys</Text>
            <Text style={styles.modalSubtitle}>
              {game?.unlimitedHints ? "Unlimited hints with Go Unlimited" : `${game?.hints ?? 0} keys remaining`}
            </Text>
            {[
              { type: 1, title: "Eliminate choices", desc: "Remove incorrect answers from the list.", color: colors.mint, soft: colors.mintSoft },
              { type: 2, title: "Reveal a clue", desc: "Show the first letter of the highlighted correct answer.", color: colors.amber, soft: colors.amberSoft },
              { type: 3, title: "Show answer", desc: "Shows the highlighted correct answer · +2.5 XP if you still answer correctly.", color: colors.violet, soft: colors.violetSoft },
            ].map((hint) => (
              <Pressable
                key={hint.type}
                onPress={() => useHint(hint.type)}
                disabled={hintBusy}
                accessibilityRole="button"
                accessibilityLabel={hint.title}
                style={({ pressed }) => [styles.hintRow, (pressed || hintBusy) && styles.pressed]}
              >
                <View style={[styles.hintIcon, { backgroundColor: hint.soft }]}>
                  {hintBusy ? (
                    <ActivityIndicator size="small" color={hint.color} />
                  ) : (
                    <Text style={{ fontWeight: "900", color: hint.color }}>{hint.type}</Text>
                  )}
                </View>
                <View style={styles.hintCopy}>
                  <Text style={styles.hintTitle}>{hint.title}</Text>
                  <Text style={styles.hintDesc}>{hint.desc}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* Settings modal */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.settingsHeader}>
              <Text style={styles.modalTitle}>Quiz settings</Text>
              <Pressable onPress={() => setShowSettings(false)} hitSlop={10} accessibilityLabel="Close settings">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.settingsSection}>Preferred question style</Text>
            {QUESTION_STYLE_OPTIONS.map((opt) => {
              const active = settings?.questionStyle === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    saveSettings({ questionStyle: opt.id }, { restyle: true, close: true });
                  }}
                  style={({ pressed }) => [
                    styles.styleOption,
                    { borderColor: active ? accent.color : colors.border, backgroundColor: active ? accent.soft : colors.bg },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.radio, { borderColor: active ? accent.color : colors.border }]}>
                    {active ? <View style={[styles.radioDot, { backgroundColor: accent.color }]} /> : null}
                  </View>
                  <View style={styles.styleCopy}>
                    <Text style={[styles.styleTitle, { color: colors.text }]}>{opt.label}</Text>
                    <Text style={styles.styleDesc}>{opt.desc}</Text>
                  </View>
                </Pressable>
              );
            })}

            <Text style={[styles.settingsSection, { marginTop: SPACING.md }]}>Settings</Text>
            {[
              { key: "hideOptionsInitially", label: "Hide options initially", desc: "Require tapping Show options for MCQ." },
              { key: "lightningRounds", label: "Lightning rounds", desc: "Add a visible countdown timer per question." },
              { key: "spellingMistakesAllowed", label: "Spelling mistakes allowed", desc: "Accept minor typos on typing questions." },
            ].map((row) => (
              <View key={row.key} style={[styles.toggleRow, { borderColor: colors.border }]}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleLabel}>{row.label}</Text>
                  <Text style={styles.toggleDesc}>{row.desc}</Text>
                </View>
                <Switch
                  value={Boolean(settings?.[row.key])}
                  onValueChange={(val) => {
                    saveSettings({ [row.key]: val });
                  }}
                  trackColor={{ false: colors.border, true: accent.color }}
                  thumbColor="#fff"
                  disabled={savingSettings}
                />
              </View>
            ))}

            <Text style={styles.settingsNote}>Study mode updates this deck right away and is saved for next time.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    scroll: { paddingBottom: SPACING.xl * 2 },
    page: {
      width: "100%",
      maxWidth: isWide ? 640 : 520,
      alignSelf: "center",
      paddingTop: SPACING.sm,
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
    muted: { color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
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
    statPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    statText: { fontSize: 12, fontWeight: "900" },
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
    timerBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: RADIUS.md,
      paddingVertical: 8,
      marginBottom: SPACING.sm,
    },
    timerText: { fontSize: 12, fontWeight: "800" },
    questionCard: {
      borderWidth: 1.5,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    questionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: SPACING.sm },
    typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill },
    typeBadgeText: { fontSize: 10, fontWeight: "800" },
    deckName: { flex: 1, color: colors.textMuted, fontSize: 11, fontWeight: "600", textAlign: "right" },
    questionText: {
      color: colors.text,
      fontSize: compact ? 17 : 19,
      fontWeight: "800",
      lineHeight: compact ? 24 : 27,
      marginBottom: SPACING.md,
    },
    clueBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
      marginBottom: SPACING.sm,
    },
    clueText: { flex: 1, fontSize: 13, lineHeight: 18 },
    showOptionsBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1.5,
      borderRadius: RADIUS.lg,
      paddingVertical: 14,
      marginBottom: SPACING.sm,
    },
    showOptionsText: { fontSize: 14, fontWeight: "800" },
    optionsWrap: { gap: 8 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderRadius: RADIUS.md,
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 10,
    },
    optionLabel: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    optionLabelText: { color: colors.textMuted, fontSize: 12, fontWeight: "900" },
    optionText: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
    typeInput: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 12,
      minHeight: 80,
      fontSize: 15,
      textAlignVertical: "top",
      marginBottom: SPACING.sm,
    },
    flipBack: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
    flipLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 4 },
    flipText: { color: colors.text, fontSize: 16, fontWeight: "700", lineHeight: 22 },
    flashActions: { flexDirection: "row", gap: 8 },
    feedback: { borderRadius: RADIUS.md, padding: 10, marginTop: SPACING.sm },
    floatText: { color: colors.amber, fontWeight: "900", fontSize: 13, marginTop: 4 },
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
    },
    hintFabText: { fontSize: 13, fontWeight: "800" },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      height: 46,
      borderRadius: RADIUS.lg,
      marginTop: 4,
    },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
    secondaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 44,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      paddingHorizontal: SPACING.md,
    },
    secondaryBtnText: { fontWeight: "800", fontSize: 13 },
    dangerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      height: 44,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
    },
    dangerBtnText: { fontWeight: "800", fontSize: 13 },
    blockedIcon: {
      width: 84,
      height: 84,
      borderRadius: 42,
      alignItems: "center",
      justifyContent: "center",
    },
    blockedTitle: { color: colors.text, fontSize: 22, fontWeight: "900", textAlign: "center" },
    completeScroll: {
      paddingBottom: SPACING.xl * 2,
      flexGrow: 1,
    },
    completePage: {
      width: "100%",
      maxWidth: isWide ? 680 : 520,
      alignSelf: "center",
      paddingTop: SPACING.md,
      gap: SPACING.md,
    },
    completeHero: {
      borderWidth: 1,
      borderRadius: RADIUS.xl,
      padding: isWide ? SPACING.xl : SPACING.lg,
      alignItems: "center",
    },
    completeIcon: {
      width: compact ? 56 : 64,
      height: compact ? 56 : 64,
      borderRadius: RADIUS.lg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    completeKicker: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      textAlign: "center",
      marginBottom: 4,
    },
    completeTitle: {
      color: colors.text,
      fontSize: compact ? 24 : 28,
      fontWeight: "900",
      letterSpacing: -0.5,
      textAlign: "center",
    },
    completeHeadline: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center",
      marginTop: 6,
    },
    completeCopy: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 6,
      maxWidth: 420,
    },
    scorePanel: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      flexDirection: isWide ? "row" : "column",
      alignItems: isWide ? "center" : "stretch",
      gap: SPACING.md,
    },
    scoreBadge: {
      width: isWide ? 108 : "100%",
      minHeight: compact ? 88 : 96,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: SPACING.md,
    },
    scorePct: {
      fontSize: compact ? 36 : 42,
      fontWeight: "900",
      letterSpacing: -1,
    },
    scorePctLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginTop: 2,
    },
    scoreMeta: { flex: 1, minWidth: 0 },
    scoreMetaTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
    scoreMetaCopy: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 12, lineHeight: 18 },
    scoreTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
    scoreFill: { height: "100%", borderRadius: 4 },
    statGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    statCard: {
      flexGrow: 1,
      flexBasis: compact ? "46%" : 148,
      minWidth: compact ? 140 : 148,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
    },
    statIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    statValue: { color: colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.3 },
    statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 2 },
    completeLevel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    completeLevelLabel: { color: colors.text, fontSize: 12, fontWeight: "800", minWidth: 58 },
    completeLevelMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "700", minWidth: 78, textAlign: "right" },
    reviewCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: 4,
    },
    reviewTitle: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    reviewRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 10,
    },
    reviewDot: {
      width: 22,
      height: 22,
      borderRadius: 7,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    reviewText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "600", lineHeight: 20 },
    completeActions: { gap: 10, marginTop: 4 },
    completePrimary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 50,
      borderRadius: RADIUS.lg,
    },
    completePrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
    completeSecondary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
    },
    completeSecondaryText: { fontWeight: "800", fontSize: 14 },
    summaryCard: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md, width: "100%", maxWidth: 320 },
    summaryRow: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 4 },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
      padding: SPACING.md,
    },
    modalCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      zIndex: 2,
    },
    settingsCard: {
      borderWidth: 1,
      borderTopLeftRadius: RADIUS.lg,
      borderTopRightRadius: RADIUS.lg,
      padding: SPACING.md,
      maxHeight: "90%",
      zIndex: 2,
    },
    settingsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.sm },
    modalTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
    modalSubtitle: { color: colors.textMuted, fontSize: 12, marginBottom: SPACING.sm },
    hintRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
    hintIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    hintCopy: { flex: 1 },
    hintTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
    hintDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    settingsSection: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    styleOption: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: 10,
      marginBottom: 8,
    },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    radioDot: { width: 8, height: 8, borderRadius: 4 },
    styleCopy: { flex: 1 },
    styleTitle: { fontSize: 13, fontWeight: "800" },
    styleDesc: { color: colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 16 },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderBottomWidth: 1,
      paddingVertical: 12,
    },
    toggleCopy: { flex: 1 },
    toggleLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
    toggleDesc: { color: colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15 },
    settingsNote: { color: colors.textMuted, fontSize: 11, marginTop: SPACING.sm, textAlign: "center" },
    pressed: { opacity: 0.85 },
  });
