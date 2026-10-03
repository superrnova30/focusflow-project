import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import ConfirmDialog from "../components/ConfirmDialog";
import { useTheme } from "../context/ThemeContext";
import BottomSheet from "../components/BottomSheet";
import client from "../api/client";
import { useAIChat } from '../context/AIChatContext';
import { usePremium } from '../context/PremiumContext';
import { RADIUS, SPACING } from "../theme/theme";

const GOLD = '#FFC15E';

const XP_PER_CORRECT = 200;
const MAX_HEARTS = 5;

export default function StudyHomeScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 760;
  const compact = width < 380;
  const styles = useMemo(
    () => createStyles(colors, isWide, isNarrow, compact),
    [colors, isWide, isNarrow, compact]
  );

  const { isPremium, premium, refreshLimits } = usePremium();

  const [materials, setMaterials] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [collections, setCollections] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingMaterial, setDeletingMaterial] = useState(null);
  const [deletingMaterialBusy, setDeletingMaterialBusy] = useState(false);

// Gamification state (XP + Hearts)
  const [xp, setXp] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);

  // Gamification polish — streak, level, daily challenge
  const [streak, setStreak] = useState({ current: 0, longest: 0 });
  const [level, setLevel] = useState({ current: 1, xpWithinLevel: 0, xpForNext: 500, step: 500 });
  const [challenge, setChallenge] = useState(null);

  // Lightweight input that navigates to the dedicated AI conversation page
  const [studyTopic, setStudyTopic] = useState("");
  const [navigatingToChat, setNavigatingToChat] = useState(false);
  const { messages: chatMessagesContext } = useAIChat();

  // Bottom-sheet state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetStep, setSheetStep] = useState("main"); // "main" | "cards" | "notes"

  // Animations
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(20)).current;
  const fabScale = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      Animated.timing(heroOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      Animated.timing(heroTranslate, { toValue: 0, duration: 600, useNativeDriver: true }).start();
      Animated.spring(fabScale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
    }, [heroOpacity, heroTranslate, fabScale])
  );

const fetchGameState = useCallback(async () => {
    try {
      const { data } = await client.get("/game/state");
      if (data.state) {
        setXp(data.state.xp || 0);
        setHearts(data.state.hearts ?? MAX_HEARTS);
      }
      await refreshLimits();
    } catch (e) {
      // ignore
    }
  }, [refreshLimits]);

  // Fetch streak + level so the home screen always reflects the latest
  // gamification state (bumps streak, returns level progress).
  const fetchStreakLevel = useCallback(async () => {
    try {
      const { data } = await client.get("/game/streak");
      if (data) {
        setStreak(data.streak || { current: 0, longest: 0 });
        setLevel(
          data.level || { current: 1, xpWithinLevel: 0, xpForNext: 500, step: 500 }
        );
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Fetch today's daily challenge; the server auto-claims XP when the goal is met.
  const fetchChallenge = useCallback(async () => {
    try {
      const { data } = await client.get("/game/challenges");
      if (data && data.challenge) {
        setChallenge({
          id: data.challenge.id,
          title: data.challenge.title,
          description: data.challenge.description,
          xpReward: data.challenge.xpReward,
          completed: data.challenge.completed,
          progress: data.progress || 0,
          target: data.target || data.challenge.targetValue || 1,
          justCompleted: Boolean(data.autoCompleted),
        });
        if (data.autoCompleted && data.xpAwarded > 0) {
          fetchGameState();
          fetchStreakLevel();
        }
      }
    } catch (e) {
      // ignore
    }
  }, [fetchGameState, fetchStreakLevel]);

  const fetchAll = useCallback(async () => {
    try {
      const [matRes, quizRes, collRes, noteRes] = await Promise.all([
        client.get("/materials"),
        client.get("/quizzes"),
        client.get("/flashcards/collections"),
        client.get("/notes"),
      ]);
      const nextMaterials = matRes.data.materials || [];
      setMaterials(nextMaterials);
      const materialIds = new Set(nextMaterials.map((m) => m.id));
      const linkedQuizzes = nextMaterials.flatMap((m) => m.quizzes || []);
      const linkedIds = new Set(linkedQuizzes.map((q) => q.id));
      const extraQuizzes = (quizRes.data.quizzes || []).filter(
        (q) => !q.materialId || materialIds.has(q.materialId) || linkedIds.has(q.id)
      );
      const merged = [...linkedQuizzes];
      extraQuizzes.forEach((q) => {
        if (!merged.some((existing) => existing.id === q.id)) merged.push(q);
      });
      setQuizzes(merged);
      setCollections(collRes.data.collections || []);
      setNotes(noteRes.data.notes || []);
    } catch (e) {
      // Don't block the home screen if one endpoint is temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

useFocusEffect(
    useCallback(() => {
      fetchAll();
      fetchGameState();
      (async () => {
        await fetchStreakLevel();
        await fetchChallenge();
      })();
    }, [fetchAll, fetchGameState, fetchStreakLevel, fetchChallenge])
  );

  // When invoked, open the dedicated StudyChat page and hand off the topic.
  const sendStudyPrompt = async (promptOverride) => {
    const trimmed = (promptOverride ?? studyTopic ?? "").trim();
    if (!trimmed) {
      Alert.alert("Enter a topic", "Type what you want to study, e.g. \"Photosynthesis\".");
      return;
    }

    if (navigatingToChat) return; // debounce double tap
    setNavigatingToChat(true);
    setStudyTopic("");
    navigation.navigate('StudyChat', { initialTopic: trimmed });
    // reset after short delay in case component remains mounted
    setTimeout(() => setNavigatingToChat(false), 800);
  };

  // "I want to study..." → generate a study response in-page and stay on this screen.
  const generateStudy = async (source) => {
    if (source === "notes") {
      navigation.navigate("NoteImport");
      return;
    }

    if (source === "pdf") {
      navigation.navigate("CardImport");
      return;
    }

    if (source === "topic") {
      await sendStudyPrompt();
      return;
    }

    const topic = studyTopic.trim();
    if (!topic) {
      Alert.alert("Enter a topic", "Type what you want to study, e.g. \"Photosynthesis\".");
      return;
    }

    await sendStudyPrompt(topic);
  };

  const openSheet = () => {
    setSheetStep("main");
    setSheetVisible(true);
  };

  const goStep = (step) => setSheetStep(step);

  const renderOption = ({ emoji, title, subtitle, color, soft, onPress }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionCard,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.optionIcon, { backgroundColor: soft }]}>
        <Text style={styles.optionEmoji}>{emoji}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );

  const renderSheetContent = () => {
    if (sheetStep === "cards") {
      return (
        <View style={{ paddingBottom: 8 }}>
          {renderOption({
            emoji: "✨",
            title: "Magic Import",
            subtitle: "AI generates flashcards from a topic, notes, or PDF",
            color: colors.violet,
            soft: colors.violetSoft,
            onPress: () => {
              setSheetVisible(false);
              navigation.navigate("CardImport");
            },
          })}
          {renderOption({
            emoji: "✍️",
            title: "Write Your Own",
            subtitle: "Create cards manually and organize them into decks",
            color: colors.mint,
            soft: colors.mintSoft,
            onPress: () => {
              setSheetVisible(false);
              navigation.navigate("FlashcardEdit", {});
            },
          })}
          <Pressable onPress={() => goStep("main")} style={styles.backLink}>
            <Ionicons name="arrow-back" size={16} color={colors.textMuted} />
            <Text style={styles.backLinkText}>Back</Text>
          </Pressable>
        </View>
      );
    }

    if (sheetStep === "notes") {
      return (
        <View style={{ paddingBottom: 8 }}>
          {renderOption({
            emoji: "✨",
            title: "Magic Import",
            subtitle: "AI generates a structured study guide for you",
            color: colors.violet,
            soft: colors.violetSoft,
            onPress: () => {
              setSheetVisible(false);
              navigation.navigate("NoteImport");
            },
          })}
          {renderOption({
            emoji: "✍️",
            title: "Write Your Own",
            subtitle: "Freeform notes with headings, lists, and checklists",
            color: colors.amber,
            soft: colors.amberSoft,
            onPress: () => {
              setSheetVisible(false);
              navigation.navigate("NoteEdit", {});
            },
          })}
          <Pressable onPress={() => goStep("main")} style={styles.backLink}>
            <Ionicons name="arrow-back" size={16} color={colors.textMuted} />
            <Text style={styles.backLinkText}>Back</Text>
          </Pressable>
        </View>
      );
    }

    // main
    return (
      <View style={{ paddingBottom: 8 }}>
        {renderOption({
          emoji: "🃏",
          title: "Cards",
          subtitle: "Create and study flashcards",
          color: colors.mint,
          soft: colors.mintSoft,
          onPress: () => goStep("cards"),
        })}
        {renderOption({
          emoji: "📝",
          title: "Notes",
          subtitle: "Capture ideas and study notes",
          color: colors.amber,
          soft: colors.amberSoft,
          onPress: () => goStep("notes"),
        })}
      </View>
    );
  };

  const totalCards = collections.reduce((sum, c) => sum + (c._count?.flashcards || 0), 0);

  const confirmDeleteMaterial = async () => {
    if (!deletingMaterial) return;
    setDeletingMaterialBusy(true);
    try {
      await client.delete(`/materials/${deletingMaterial.id}`);
      setDeletingMaterial(null);
      await fetchAll();
    } catch (e) {
      Alert.alert("Error", e.message || "Could not delete study pack.");
    } finally {
      setDeletingMaterialBusy(false);
    }
  };

  const renderMaterial = ({ item }) => (
    <View style={styles.contentCardWrap}>
      <Pressable
        onPress={() => navigation.navigate("Material", { material: item })}
        style={({ pressed }) => [styles.contentCard, pressed && styles.pressed]}
      >
        <View style={[styles.contentIcon, { backgroundColor: colors.violetSoft }]}>
          <Ionicons name="book-outline" size={20} color={colors.violet} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.contentTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.contentMeta}>
            {item.flashcards?.length || 0} cards · {item.quizzes?.length || 0} quizzes
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </Pressable>
      <Pressable
        onPress={() => setDeletingMaterial(item)}
        hitSlop={8}
        style={({ pressed }) => [styles.contentDeleteBtn, pressed && styles.pressed]}
      >
        <Ionicons name="trash-outline" size={16} color={colors.tomato} />
      </Pressable>
    </View>
  );

  const renderNote = ({ item }) => (
    <Pressable
      onPress={() => navigation.navigate("NoteView", { note: item })}
      style={({ pressed }) => [styles.contentCard, pressed && styles.pressed]}
    >
      <View style={[styles.contentIcon, { backgroundColor: item.source === "ai" ? colors.violetSoft : colors.amberSoft }]}>
        <Ionicons
          name={item.source === "ai" ? "sparkles-outline" : "document-text-outline"}
          size={20}
          color={item.source === "ai" ? colors.violet : colors.amber}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.contentTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.contentMeta}>
          {item.source === "ai" ? "AI generated" : "Manual"} · {(item.contentJson || []).length} blocks
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <Screen>
      <FlatList
        data={materials}
        keyExtractor={(m) => m.id}
        renderItem={renderMaterial}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
        ListHeaderComponent={
          <>
            <View style={styles.hubHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.hubEyebrow}>STUDY HUB</Text>
                <Text style={styles.hubTitle}>Learn your way</Text>
                <Text style={styles.hubSubtitle}>
                  Ask AI, create study materials, and keep everything you’re learning in one place.
                </Text>
              </View>
              <Pressable
                onPress={openSheet}
                accessibilityRole="button"
                accessibilityLabel="Create study content"
                style={({ pressed }) => [styles.headerCreateBtn, pressed && styles.pressed]}
              >
                <Ionicons name="add" size={19} color="#FFFFFF" />
                {!compact && <Text style={styles.headerCreateText}>Create</Text>}
              </Pressable>
            </View>

{/* XP + Hearts status bar — tap to open the Progress dashboard */}
            <Pressable
              onPress={() => navigation.navigate("Progress")}
              accessibilityRole="button"
              accessibilityLabel={`${xp} XP, level ${level.current}, ${streak.current} day streak, ${hearts} of ${MAX_HEARTS} hearts. Open progress.`}
              style={({ pressed }) => [styles.gameBar, { opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={styles.gameBarContent}>
                <View style={styles.progressStats}>
                  <View style={styles.statusMetric}>
                    <View style={[styles.statusIcon, { backgroundColor: colors.amberSoft }]}>
                      <Ionicons name="flash" size={17} color={colors.amber} />
                    </View>
                    <View style={styles.statusCopy}>
                      <Text style={styles.statusLabel}>TOTAL XP</Text>
                      <Text style={[styles.statusValue, { color: colors.amber }]}>{xp}</Text>
                    </View>
                  </View>

                  <View style={styles.metricDivider} />

                  <View style={styles.statusMetric}>
                    <View style={[styles.statusIcon, { backgroundColor: colors.violetSoft }]}>
                      <Ionicons name="shield-checkmark" size={16} color={colors.violet} />
                    </View>
                    <View style={styles.statusCopy}>
                      <Text style={styles.statusLabel}>LEVEL</Text>
                      <Text style={[styles.statusValue, { color: colors.violet }]}>Lv {level.current}</Text>
                    </View>
                  </View>

                  <View style={styles.metricDivider} />

                  <View style={styles.statusMetric}>
                    <View style={[styles.statusIcon, { backgroundColor: colors.tomatoSoft }]}>
                      <Ionicons name="flame" size={16} color={colors.tomato} />
                    </View>
                    <View style={styles.statusCopy}>
                      <Text style={styles.statusLabel}>STREAK</Text>
                      <Text style={[styles.statusValue, { color: colors.tomato }]}>
                        {streak.current} {streak.current === 1 ? "day" : "days"}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.energySection}>
                  <View style={styles.energyCopy}>
                    <Text style={styles.energyLabel}>FOCUS ENERGY</Text>
                    <Text style={styles.energyValue}>{hearts} of {MAX_HEARTS} hearts</Text>
                  </View>
                  <View style={styles.heartsRow}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Ionicons
                        key={i}
                        name={i < hearts ? "heart" : "heart-outline"}
                        size={compact ? 18 : 20}
                        color={i < hearts ? "#FF5A76" : colors.border}
                      />
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.progressChevron}>
                <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
              </View>
            </Pressable>

            {/* Daily Challenge + Leaderboard shortcut */}
            <View style={styles.engagementRow}>
              {challenge && !challenge.completed && (
                <View
                  style={[
                    styles.challengeCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.violet,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <View style={[styles.challengeIcon, { backgroundColor: colors.violetSoft }]}>
                    <Ionicons name="trophy" size={20} color={colors.violet} />
                  </View>
                  <View style={styles.challengeBody}>
                    <Text style={styles.challengeTitle}>Daily Challenge</Text>
                    <Text style={styles.challengeDesc} numberOfLines={2}>
                      {challenge.title}: {challenge.description}
                    </Text>
                    <View style={styles.challengeProgressTrack}>
                      <View
                        style={[
                          styles.challengeProgressFill,
                          {
                            width: `${Math.min(100, (challenge.progress / Math.max(1, challenge.target)) * 100)}%`,
                            backgroundColor: colors.violet,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.challengeMeta}>
                      {Math.min(challenge.progress, challenge.target)}/{challenge.target} · +{challenge.xpReward} XP auto-reward
                    </Text>
                  </View>
                </View>
              )}

              {challenge && challenge.completed && (
                <View
                  style={[
                    styles.challengeCard,
                    styles.challengeCardDone,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.success || "#22c55e",
                    },
                  ]}
                >
                  <View style={[styles.challengeIcon, { backgroundColor: "rgba(34,197,94,0.12)" }]}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.success || "#22c55e"} />
                  </View>
                  <View style={styles.challengeBody}>
                    <Text style={styles.challengeTitle}>Daily Challenge complete</Text>
                    <Text style={styles.challengeDesc} numberOfLines={2}>
                      {challenge.title} · +{challenge.xpReward} XP earned
                      {challenge.justCompleted ? " just now" : " today"}
                    </Text>
                  </View>
                </View>
              )}

            {/* Dedicated trophy button to open the Leaderboard */}
            <Pressable
              onPress={() => navigation.navigate("Leaderboard")}
              style={({ pressed }) => [
                styles.leaderboardBtn,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.leaderboardIcon, { backgroundColor: colors.amberSoft }]}>
                <Ionicons name="trophy" size={20} color={colors.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.leaderboardTitle}>Leaderboard</Text>
                <Text style={styles.leaderboardSubtitle}>See how you rank against top students</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
            </View>

            {/* Hero — greeting at top, above the input field */}
            <Animated.View style={[styles.hero, { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] }]}>
              <View style={styles.heroTextWrap}>
                <View style={[styles.heroIcon, { backgroundColor: colors.violetSoft }]}>
                  <Ionicons name="sparkles" size={28} color={colors.violet} />
                </View>
                <View style={styles.heroTexts}>
                  <Text style={styles.heroEyebrow}>ASK FOCUSFLOW AI</Text>
                  <Text style={styles.heroTitle}>What will you master today?</Text>
                  <Text style={styles.heroSubtitle}>
                    Ask a question, explore a topic, or turn your materials into something easier to learn.
                  </Text>
                </View>
              </View>

</Animated.View>

            {/* Study chat area */}
            <View style={[styles.generatorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.generatorHeader}>
                <View>
                  <Text style={styles.generatorLabel}>AI STUDY ASSISTANT</Text>
                  <Text style={styles.generatorTitle}>Start with a question</Text>
                </View>
                <View style={[styles.onlineBadge, { backgroundColor: colors.mintSoft }]}>
                  <View style={[styles.onlineDot, { backgroundColor: colors.mint }]} />
                  <Text style={[styles.onlineText, { color: colors.mint }]}>READY</Text>
                </View>
              </View>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }} keyboardVerticalOffset={90}>
                <View style={styles.chatContainer}>
                  {/* Preview: show last assistant response if available */}
                  <View style={{ padding: 12 }}>
                    {chatMessagesContext && chatMessagesContext.length > 0 ? (
                      (() => {
                        const last = [...chatMessagesContext].reverse().find((m) => m.role === 'assistant');
                        return last ? (
                          <View style={[styles.chatBubble, styles.assistantBubble, { backgroundColor: colors.bg, borderColor: colors.border }]}> 
                            <Text style={[styles.chatText, { color: colors.text }]} numberOfLines={3} ellipsizeMode="tail">{last.content}</Text>
                          </View>
                        ) : (
                          <Text style={styles.chatPlaceholder}>Ask for an explanation, study plan, quiz help, or examples.</Text>
                        );
                      })()
                    ) : (
                      <Text style={styles.chatPlaceholder}>Ask for an explanation, study plan, quiz help, or examples.</Text>
                    )}
                  </View>

                  <View style={styles.generatorRow}>
                    <TextInput
                      value={studyTopic}
                      onChangeText={setStudyTopic}
                      placeholder="Ask Gemini about a topic..."
                      placeholderTextColor={colors.textMuted}
                      style={[styles.generatorInput, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                      onSubmitEditing={() => generateStudy("topic")}
                      returnKeyType="send"
                      multiline={false}
                    />
                    <Pressable
                      onPress={() => generateStudy("topic")}
                      disabled={navigatingToChat}
                      style={({ pressed }) => [
                        styles.generateBtn,
                        { backgroundColor: colors.tomato, opacity: pressed || navigatingToChat ? 0.75 : 1 },
                      ]}
                    >
                      {navigatingToChat ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="arrow-up" size={18} color="#fff" />
                          <Text style={styles.generateBtnText}>Ask</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>

              {/* PDF / paste-notes shortcuts */}
              <View style={styles.generatorShortcuts}>
                <Pressable
                  onPress={() => generateStudy("pdf")}
                  style={[styles.shortcutBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                >
                  <Ionicons name="document-attach" size={16} color={colors.violet} />
                  <Text style={styles.shortcutText}>Upload PDF</Text>
                </Pressable>
                <Pressable
                  onPress={() => generateStudy("notes")}
                  style={[styles.shortcutBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                >
                  <Ionicons name="clipboard" size={16} color={colors.amber} />
                  <Text style={styles.shortcutText}>Paste notes</Text>
                </Pressable>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              {[
                ["layers-outline", totalCards, "Cards", colors.mint, colors.mintSoft],
                ["document-text-outline", notes.length, "Notes", colors.amber, colors.amberSoft],
                ["book-outline", materials.length, "Study packs", colors.violet, colors.violetSoft],
                ["help-circle-outline", quizzes.length, "Quizzes", colors.tomato, colors.tomatoSoft],
              ].map(([icon, value, label, color, soft]) => (
                <View key={label} style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: soft }]}>
                    <Ionicons name={icon} size={18} color={color} />
                  </View>
                  <View>
                    <Text style={styles.statValue}>{value}</Text>
                    <Text style={styles.statLabel}>{label}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Quick access */}
            <View style={styles.quickRow}>
              <Pressable style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]} onPress={() => navigation.navigate("Flashcards")}>
                <View style={[styles.quickIcon, { backgroundColor: colors.mintSoft }]}>
                  <Ionicons name="layers-outline" size={19} color={colors.mint} />
                </View>
                <Text style={styles.quickBtnText}>Flashcards</Text>
                <Text style={styles.quickBtnMeta}>Review decks</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]} onPress={() => navigation.navigate("Notes")}>
                <View style={[styles.quickIcon, { backgroundColor: colors.amberSoft }]}>
                  <Ionicons name="document-text-outline" size={19} color={colors.amber} />
                </View>
                <Text style={styles.quickBtnText}>Notes</Text>
                <Text style={styles.quickBtnMeta}>Capture ideas</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]} onPress={() => navigation.navigate("Coach")}>
                <View style={[styles.quickIcon, { backgroundColor: colors.violetSoft }]}>
                  <Ionicons name="sparkles-outline" size={19} color={colors.violet} />
                </View>
                <Text style={styles.quickBtnText}>AI Coach</Text>
                <Text style={styles.quickBtnMeta}>Get guidance</Text>
              </Pressable>
            </View>

            {/* Go Unlimited — the premium entry point, marked with a crown. */}
            <View style={styles.promoGrid}>
            <Pressable
              onPress={() => navigation.navigate("Premium")}
              style={({ pressed }) => [
                styles.unlimitedBanner,
                {
                  backgroundColor: isPremium ? colors.mintSoft : colors.violetSoft,
                  borderColor: isPremium ? colors.mint : GOLD + '66',
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <View style={[styles.unlimitedIcon, { backgroundColor: colors.surface, borderColor: GOLD + '55' }]}>
                <Text style={styles.unlimitedCrown}>👑</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.unlimitedTitleRow}>
                  <Text style={styles.unlimitedTitle}>{isPremium ? 'Go Unlimited' : 'Go Unlimited'}</Text>
                  {isPremium ? (
                    <View style={[styles.unlimitedBadge, { backgroundColor: colors.mint, borderColor: colors.mint }]}>
                      <Text style={styles.unlimitedBadgeText}>ACTIVE</Text>
                    </View>
                  ) : (
                    <View style={[styles.unlimitedBadge, { backgroundColor: GOLD, borderColor: GOLD }]}>
                      <Ionicons name="star" size={9} color="#1A1400" />
                      <Text style={[styles.unlimitedBadgeText, { color: '#1A1400' }]}>PRO</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.unlimitedSubtitle}>
                  {isPremium
                    ? `${premium.daysRemaining} day${premium.daysRemaining === 1 ? '' : 's'} remaining · manage your plan`
                    : 'Unlimited tasks, hearts, hints, chat, tutor & AI tools'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isPremium ? colors.mint : colors.violet} />
            </Pressable>

            {/* Saved AI conversations — one tap from the study hub. */}
            <Pressable
              onPress={() => navigation.navigate("AIHistory")}
              style={({ pressed }) => [
                styles.historyBanner,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <View style={[styles.historyBannerIcon, { backgroundColor: colors.violetSoft }]}>
                <Ionicons name="time" size={20} color={colors.violet} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyBannerTitle}>AI History</Text>
                <Text style={styles.historyBannerSubtitle}>Revisit every conversation with your AI tutor</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
            </View>

            {/* Notes section */}
            {notes.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>RECENT NOTES ({notes.length})</Text>
                {notes.slice(0, 3).map((n) => (
                  <View key={n.id}>{renderNote({ item: n })}</View>
                ))}
              </>
            )}

            {/* Collections section */}
            {collections.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>FLASHCARD DECKS ({collections.length})</Text>
                <View style={styles.collectionRow}>
                  {collections.slice(0, 5).map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => navigation.navigate("FlashcardCollection", { collection: c })}
                      style={[styles.collectionChip, { borderColor: colors.mint, backgroundColor: colors.mintSoft }]}
                    >
                      <Text style={styles.collectionChipText}>{c.name}</Text>
                      <Text style={styles.collectionChipMeta}>{c._count?.flashcards || 0} cards</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionLabel}>YOUR STUDY PACKS ({materials.length})</Text>
            {loading && materials.length === 0 ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={colors.violet} />
                <Text style={styles.mutedText}>Loading your study space…</Text>
              </View>
            ) : materials.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.violetSoft }]}>
                  <Ionicons name="book-outline" size={23} color={colors.violet} />
                </View>
                <Text style={styles.emptyTitle}>No study packs yet</Text>
                <Text style={styles.mutedText}>
                  Import notes or a PDF to create your first study pack.
                </Text>
              </View>
            ) : null}
          </>
        }
        ListFooterComponent={
          <>
            <Text style={styles.sectionLabel}>AVAILABLE QUIZZES ({quizzes.length})</Text>
            {quizzes.length === 0 ? (
              <View style={styles.emptyStateCompact}>
                <Text style={styles.mutedText}>No quizzes available yet.</Text>
              </View>
            ) : (
              <View style={styles.quizGrid}>
                {quizzes.map((quiz) => (
                  <Pressable
                    key={quiz.id}
                    onPress={() => navigation.navigate("Quiz", { quizId: quiz.id, title: quiz.title })}
                    style={({ pressed }) => [styles.quizCard, pressed && styles.pressed]}
                  >
                    <View style={[styles.contentIcon, { backgroundColor: colors.tomatoSoft }]}>
                      <Ionicons name="help-circle-outline" size={20} color={colors.tomato} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.contentTitle} numberOfLines={1}>{quiz.title}</Text>
                      <Text style={styles.contentMeta}>
                        {quiz.questions?.length || 0} questions · {quiz.isPublished ? "Ready" : "Draft"}
                      </Text>
                    </View>
                    <View style={[styles.quizCta, { backgroundColor: colors.tomatoSoft }]}>
                      <Ionicons name="play" size={14} color={colors.tomato} />
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        }
      />

      {/* Floating Add button */}
      <Animated.View
        style={[
          styles.fabWrap,
          { transform: [{ scale: fabScale }] },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={openSheet}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: colors.tomato, shadowColor: colors.tomato },
            pressed && { transform: [{ scale: 0.92 }] },
          ]}
        >
          <Ionicons name="add" size={32} color="#fff" />
        </Pressable>
      </Animated.View>

      {/* Bottom sheet */}
      <ConfirmDialog
        visible={Boolean(deletingMaterial)}
        title="Delete study pack?"
        message={`Remove "${deletingMaterial?.title || "this pack"}" and its flashcards and quizzes?`}
        confirmText="Delete"
        destructive
        loading={deletingMaterialBusy}
        onConfirm={confirmDeleteMaterial}
        onCancel={() => !deletingMaterialBusy && setDeletingMaterial(null)}
      />

      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={sheetStep === "cards" ? "Create Flashcards" : sheetStep === "notes" ? "Create Notes" : "Add New"}
        subtitle={
          sheetStep === "cards"
            ? "Generate cards with AI or write your own."
            : sheetStep === "notes"
            ? "Generate structured notes with AI or write your own."
            : "What would you like to create?"
        }
        maxHeight={0.6}
      >
        {renderSheetContent()}
      </BottomSheet>
    </Screen>
  );
}

const createStyles = (colors, isWide, isNarrow, compact) =>
  StyleSheet.create({
    page: {
      width: "100%",
      maxWidth: 1120,
      alignSelf: "center",
      paddingTop: SPACING.md,
      paddingBottom: 120,
    },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
    hubHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: SPACING.md,
      marginBottom: SPACING.md,
    },
    hubEyebrow: {
      color: colors.violet,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.1,
      marginBottom: 4,
    },
    hubTitle: {
      color: colors.text,
      fontSize: compact ? 25 : 29,
      lineHeight: compact ? 31 : 35,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    hubSubtitle: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 19,
      maxWidth: 620,
      marginTop: 5,
    },
    headerCreateBtn: {
      minWidth: compact ? 45 : 105,
      height: 45,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: RADIUS.md,
      backgroundColor: colors.tomato,
      shadowColor: colors.tomato,
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    headerCreateText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "900" },
    // Game status bar
    gameBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? 11 : 13,
      marginBottom: SPACING.md,
      shadowColor: "#0F172A",
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    gameBarContent: {
      flex: 1,
      flexDirection: isNarrow ? "column" : "row",
      alignItems: "center",
      gap: isNarrow ? 11 : 16,
      minWidth: 0,
    },
    progressStats: {
      flex: 1,
      width: isNarrow ? "100%" : undefined,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minWidth: 0,
    },
    statusMetric: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: compact ? 6 : 8,
      minWidth: 0,
    },
    statusIcon: {
      width: compact ? 31 : 35,
      height: compact ? 31 : 35,
      borderRadius: compact ? 10 : 11,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    statusCopy: {
      minWidth: 0,
    },
    statusLabel: {
      color: colors.textMuted,
      fontSize: compact ? 7 : 8,
      fontWeight: "800",
      letterSpacing: 0.65,
      marginBottom: 2,
    },
    statusValue: {
      fontSize: compact ? 12 : 13.5,
      lineHeight: compact ? 15 : 17,
      fontWeight: "900",
    },
    metricDivider: {
      width: 1,
      height: 30,
      backgroundColor: colors.border,
      opacity: 0.75,
      marginHorizontal: compact ? 3 : 6,
    },
    energySection: {
      width: isNarrow ? "100%" : undefined,
      minWidth: isNarrow ? undefined : 218,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      backgroundColor: colors.tomatoSoft,
      borderRadius: RADIUS.md,
      paddingVertical: compact ? 8 : 9,
      paddingHorizontal: compact ? 10 : 12,
    },
    energyCopy: {
      flexShrink: 1,
    },
    energyLabel: {
      color: colors.tomato,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.65,
      marginBottom: 2,
    },
    energyValue: {
      color: colors.text,
      fontSize: compact ? 10.5 : 11.5,
      fontWeight: "700",
    },
    heartsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 2 : 3,
      flexShrink: 0,
    },
    progressChevron: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
      marginLeft: compact ? 7 : 10,
      flexShrink: 0,
    },
    engagementRow: {
      flexDirection: isWide ? "row" : "column",
      alignItems: "stretch",
      gap: 10,
      marginBottom: 4,
    },
    // Daily challenge card
    challengeCard: {
      flex: isWide ? 1.15 : undefined,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 16,
      padding: 14,
      marginBottom: 0,
      borderWidth: 1,
    },
    challengeCardDone: {
      flex: isWide ? 1.15 : undefined,
    },
    challengeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    challengeBody: { flex: 1, marginLeft: 12 },
    challengeTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
    challengeDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
    challengeProgressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: "hidden",
      marginTop: 6,
    },
    challengeProgressFill: { height: "100%", borderRadius: 3 },
    challengeMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 4 },
    challengeCta: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 10,
    },
    // Leaderboard shortcut
    leaderboardBtn: {
      flex: isWide ? 0.85 : undefined,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 16,
      padding: 13,
      marginBottom: 0,
    },
    leaderboardIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    leaderboardTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
    leaderboardSubtitle: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
    // "I want to study..." generator
    generatorCard: {
      borderWidth: 1,
      borderRadius: RADIUS.xl,
      padding: compact ? 12 : 16,
      marginBottom: SPACING.md,
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    generatorHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 11,
    },
    generatorLabel: {
      color: colors.violet,
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    generatorTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: 2 },
    onlineBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: RADIUS.pill,
    },
    onlineDot: { width: 6, height: 6, borderRadius: 3 },
    onlineText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
    chatContainer: {
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      marginBottom: 10,
      maxWidth: "100%",
      minHeight: 108,
      maxHeight: 360,
    },
    chatMessages: {
      padding: 12,
      gap: 8,
      width: "100%",
    },
    chatBubble: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      maxWidth: "85%",
      flexShrink: 1,
    },
    userBubble: {
      alignSelf: "flex-end",
    },
    assistantBubble: {
      alignSelf: "flex-start",
    },
    chatText: {
      fontSize: 13.5,
      lineHeight: 20,
      flexShrink: 1,
      flexWrap: "wrap",
    },
    chatPlaceholder: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
    typingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 1,
    },
    generatorRow: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      width: "100%",
      maxWidth: "100%",
    },
    generatorInput: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      maxWidth: "100%",
    },
    generateBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minWidth: compact ? 48 : 82,
      maxWidth: "32%",
    },
    generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
    generatorShortcuts: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    shortcutBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
    },
    shortcutText: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
    hero: {
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      padding: compact ? 13 : 16,
      marginTop: SPACING.md,
      marginBottom: 10,
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.violet + "33",
      borderRadius: RADIUS.xl,
    },
    heroTextWrap: { flexDirection: "row", alignItems: "center", flex: 1 },
    heroTexts: { flex: 1, marginLeft: 14 },
    heroIcon: {
      width: compact ? 50 : 58,
      height: compact ? 50 : 58,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    heroEyebrow: {
      color: colors.violet,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginBottom: 3,
    },
    heroTitle: {
      color: colors.text,
      fontSize: compact ? 18 : 22,
      fontWeight: "900",
      letterSpacing: -0.4,
      marginBottom: 4,
    },
    heroSubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: isWide ? 600 : 360,
    },
    statsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: SPACING.md,
    },
    statCard: {
      flex: 1,
      minWidth: compact ? "47%" : isWide ? 180 : "47%",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingVertical: 11,
      paddingHorizontal: 12,
    },
    statIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    statValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
    statLabel: { color: colors.textMuted, fontSize: 9.5, marginTop: 1 },
    quickRow: { flexDirection: "row", gap: 8, marginBottom: SPACING.md },
    quickBtn: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingVertical: 12,
      paddingHorizontal: compact ? 7 : 10,
      alignItems: "center",
    },
    quickIcon: {
      width: 35,
      height: 35,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 7,
    },
    quickBtnText: { color: colors.text, fontWeight: "800", fontSize: compact ? 10.5 : 12 },
    quickBtnMeta: { color: colors.textMuted, fontSize: compact ? 8 : 9.5, marginTop: 2 },
    promoGrid: { flexDirection: isWide ? "row" : "column", gap: 9 },
    historyBanner: {
      flex: isWide ? 1 : undefined,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 16,
      padding: 13,
      marginTop: 0,
      marginBottom: 0,
    },
    historyBannerIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    historyBannerTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
    historyBannerSubtitle: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
    // Go Unlimited entry point
    unlimitedBanner: {
      flex: isWide ? 1 : undefined,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 16,
      padding: 13,
      marginTop: 0,
      marginBottom: 0,
    },
    unlimitedIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      borderWidth: 1,
    },
    unlimitedCrown: { fontSize: 21 },
    unlimitedTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    unlimitedTitle: { color: colors.text, fontSize: 14.5, fontWeight: "800" },
    unlimitedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2.5,
    },
    unlimitedBadgeText: { color: "#fff", fontSize: 8.5, fontWeight: "900", letterSpacing: 0.5 },
    unlimitedSubtitle: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: 9.5,
      fontWeight: "900",
      letterSpacing: 0.9,
      marginTop: 22,
      marginBottom: 9,
    },
    mutedText: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
    collectionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    collectionChip: {
      minWidth: compact ? "47%" : 140,
      borderRadius: 12,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 2,
    },
    collectionChipText: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
    collectionChipMeta: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },
    contentCardWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    contentCard: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: 12,
    },
    contentDeleteBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.tomatoSoft,
    },
    contentIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    contentTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
    contentMeta: { color: colors.textMuted, fontSize: 10.5, marginTop: 3 },
    loadingState: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      paddingVertical: 24,
    },
    emptyState: {
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 28,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
    },
    emptyStateCompact: {
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
    },
    emptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
    quizGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    quizCard: {
      flexBasis: isWide ? "48%" : "100%",
      flexGrow: isWide ? 1 : 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: 12,
    },
    quizCta: {
      width: 31,
      height: 31,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    // FAB
    fabWrap: {
      position: "absolute",
      right: 20,
      bottom: 24,
    },
    fab: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent: "center",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 8,
    },
    // Bottom sheet options
    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },
    optionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    optionEmoji: { fontSize: 22 },
    optionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
    optionSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 },
    backLink: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 4, paddingVertical: 6 },
    backLinkText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  });
