import React, { useState, useCallback, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { deckAccent } from "../lib/deckColors";
import client from "../api/client";
import { resolveCollectionId, resolveCardCount } from "../lib/collectionStudy";
import { RADIUS, SPACING } from "../theme/theme";
import HeartsBlockedPanel from "../components/HeartsBlockedPanel";
import { fetchHeartsState, isHeartsBlocked, spendCoinsForHearts } from "../lib/hearts";
import { startGoUnlimitedCheckout } from "../lib/upgradePrompt";

const PRACTICE_TARGET = 247;

export default function FlashcardStudyModesScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const styles = useMemo(() => createStyles(colors, isWide), [colors, isWide]);

  const routeCollection = route.params?.collection;
  const collectionId = resolveCollectionId(route.params);
  const accent = deckAccent(routeCollection?.color, colors);

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [collection, setCollection] = useState(routeCollection || null);
  const [cardCount, setCardCount] = useState(resolveCardCount(routeCollection));
  const [publicUnlocked, setPublicUnlocked] = useState(false);
  const [heartsState, setHeartsState] = useState(null);
  const [buying, setBuying] = useState(null);
  const heartsLocked = isHeartsBlocked(heartsState);

  const fetchStudyData = useCallback(async () => {
    if (!collectionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [collectionRes, progressRes, gameRes] = await Promise.all([
        client.get(`/flashcards/collections/${collectionId}`),
        client.get(`/flashcards/collections/${collectionId}/study/progress`),
        fetchHeartsState(client).catch(() => null),
      ]);
      if (gameRes) setHeartsState(gameRes);
      const loadedCollection = collectionRes.data.collection;
      setCollection(loadedCollection);
      setProgress(progressRes.data.progress);
      setPublicUnlocked(Boolean(progressRes.data.unlocked && !progressRes.data.isOwner));
      const count =
        progressRes.data.cardCount ??
        loadedCollection?.flashcards?.length ??
        resolveCardCount(loadedCollection);
      setCardCount(count);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message || "Could not load this deck for study.");
      setCardCount((prev) => prev || resolveCardCount(routeCollection));
    } finally {
      setLoading(false);
    }
  }, [collectionId, routeCollection]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Study deck",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Back",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg]);

  useFocusEffect(
    useCallback(() => {
      fetchStudyData();
    }, [fetchStudyData])
  );

  const practiceAnswered = progress?.practiceAnswered || 0;
  const practiceUnlocked = progress?.practiceUnlocked || practiceAnswered >= PRACTICE_TARGET || publicUnlocked;
  const practicePct = Math.min(100, Math.round((practiceAnswered / PRACTICE_TARGET) * 100));
  const hasCards = cardCount > 0;

  const buyHearts = async (quantity) => {
    if (buying) return;
    setBuying(quantity > 1 ? "hearts" : "heart");
    try {
      const data = await spendCoinsForHearts(client, quantity);
      setHeartsState((current) => ({
        ...(current || {}),
        hearts: data.hearts,
        coins: data.coins,
        heartsBlocked: false,
        heartsRefillAt: null,
      }));
    } catch (e) {
      Alert.alert("Unable to revive", e.response?.data?.error || e.message || "Please try again.");
    } finally {
      setBuying(null);
    }
  };

  const openMode = (screen) => {
    if (!hasCards) {
      Alert.alert("No cards yet", "Add flashcards to this deck before studying.");
      return;
    }
    if (heartsLocked && (screen === "FlashcardMemorize" || screen === "FlashcardPracticeTest")) {
      return;
    }
    const deck = collection || routeCollection || {};
    navigation.navigate(screen, {
      collectionId,
      collection: {
        ...deck,
        id: collectionId,
        _count: { flashcards: cardCount },
        cardCount,
      },
    });
  };

  const modes = [
    {
      id: "memorize",
      screen: "FlashcardMemorize",
      title: "Memorize",
      subtitle: "Active recall quizzes — type what you remember before revealing the answer.",
      icon: "bulb-outline",
      color: colors.violet,
      soft: colors.violetSoft,
      badge: progress?.memorizeSessions ? `${progress.memorizeSessions} session${progress.memorizeSessions === 1 ? "" : "s"}` : null,
    },
    {
      id: "tutor",
      screen: "FlashcardTutorLesson",
      title: "AI Tutor Lesson",
      subtitle: "Learn this deck step by step with a guided AI tutor lesson.",
      icon: "school-outline",
      color: colors.mint,
      soft: colors.mintSoft,
      badge: progress?.tutorCompleted ? "Completed" : "AI powered",
    },
    {
      id: "practice",
      screen: "FlashcardPracticeTest",
      title: "Practice Test",
      subtitle: practiceUnlocked
        ? "Full practice test unlocked — keep sharpening your knowledge."
        : `Answer ${PRACTICE_TARGET} questions to unlock. ${practiceAnswered}/${PRACTICE_TARGET} done.`,
      icon: practiceUnlocked ? "ribbon-outline" : "lock-closed-outline",
      color: colors.amber,
      soft: colors.amberSoft,
      badge: practiceUnlocked ? "Unlocked" : `${practicePct}%`,
      locked: !practiceUnlocked,
    },
  ];

  if (loading && !progress) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.violet} size="large" />
          <Text style={styles.centerText}>Loading study options…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: accent.soft, borderColor: accent.color }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name={accent.icon} size={24} color={accent.color} />
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>{collection?.name || "Deck"}</Text>
          <Text style={styles.heroMeta}>
            {cardCount} {cardCount === 1 ? "card" : "cards"} · Choose a study mode
          </Text>
        </View>

        {!hasCards && (
          <View style={[styles.warnBanner, { backgroundColor: colors.tomatoSoft, borderColor: colors.tomato }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.tomato} />
            <Text style={[styles.warnText, { color: colors.text }]}>
              Add cards to this deck first. You can write your own or use Magic Import from the collection screen.
            </Text>
          </View>
        )}

        {heartsLocked ? (
          <View style={{ marginBottom: SPACING.lg }}>
            <HeartsBlockedPanel
              coins={heartsState?.coins || 0}
              hearts={heartsState?.hearts || 0}
              refillAt={heartsState?.heartsRefillAt}
              buying={buying}
              title="Quizzes unavailable"
              message="You're out of hearts after incorrect answers. Wait 24 hours for a full refill, or spend coins to revive hearts and keep studying."
              onRevive={() => buyHearts(1)}
              onRefillAll={(qty) => buyHearts(qty)}
              onCheckAgain={async () => {
                const state = await fetchHeartsState(client);
                setHeartsState(state);
              }}
              onUpgrade={() => startGoUnlimitedCheckout(navigation)}
            />
          </View>
        ) : null}

        <View style={styles.modeList}>
          {modes.map((mode) => {
            const quizLocked = heartsLocked && (mode.id === "memorize" || mode.id === "practice");
            const disabled = !hasCards || quizLocked;
            return (
            <Pressable
              key={mode.id}
              onPress={() => openMode(mode.screen)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.modeCard,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.55 : 1 },
                pressed && !disabled && styles.pressed,
              ]}
            >
              <View style={[styles.modeIcon, { backgroundColor: mode.soft }]}>
                <Ionicons name={mode.icon} size={22} color={mode.color} />
              </View>
              <View style={styles.modeBody}>
                <View style={styles.modeTitleRow}>
                  <Text style={styles.modeTitle}>{mode.title}</Text>
                  {mode.badge ? (
                    <View style={[styles.modeBadge, { backgroundColor: mode.soft }]}>
                      <Text style={[styles.modeBadgeText, { color: mode.color }]}>{mode.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.modeSubtitle}>{mode.subtitle}</Text>
                {mode.id === "practice" && !practiceUnlocked && hasCards ? (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${practicePct}%`, backgroundColor: mode.color }]} />
                  </View>
                ) : null}
              </View>
              <Ionicons name={quizLocked ? "heart-dislike" : "chevron-forward"} size={18} color={colors.textMuted} />
            </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, isWide) =>
  StyleSheet.create({
    page: {
      width: "100%",
      maxWidth: isWide ? 640 : 520,
      alignSelf: "center",
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xl * 2,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.md,
    },
    centerText: {
      color: colors.textMuted,
      fontSize: 14,
    },
    hero: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    heroIcon: {
      width: 48,
      height: 48,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    heroTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.3,
      marginBottom: 4,
    },
    heroMeta: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    warnBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    warnText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
    },
    modeList: {
      gap: SPACING.sm,
    },
    modeCard: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    modeIcon: {
      width: 46,
      height: 46,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
    },
    modeBody: {
      flex: 1,
      minWidth: 0,
    },
    modeTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 4,
    },
    modeTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
    },
    modeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.pill,
    },
    modeBadgeText: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    modeSubtitle: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 18,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      marginTop: 10,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
    },
    pressed: {
      opacity: 0.85,
    },
  });
