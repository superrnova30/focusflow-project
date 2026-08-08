import React, { useState, useCallback, useRef } from "react";
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
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import BottomSheet from "../components/BottomSheet";
import client from "../api/client";

const XP_PER_CORRECT = 200;
const MAX_HEARTS = 5;

export default function StudyHomeScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const { refreshUser } = useAuth();

  const [materials, setMaterials] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [collections, setCollections] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

// Gamification state (XP + Hearts)
  const [xp, setXp] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);

  // Gamification polish — streak, level, daily challenge
  const [streak, setStreak] = useState({ current: 0, longest: 0 });
  const [level, setLevel] = useState({ current: 1, xpWithinLevel: 0, xpForNext: 500, step: 500 });
  const [challenge, setChallenge] = useState(null);
  const [completingChallenge, setCompletingChallenge] = useState(false);

  // "I want to study..." generator
  const [studyTopic, setStudyTopic] = useState("");
  const [generating, setGenerating] = useState(false);

  // Bottom-sheet state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetStep, setSheetStep] = useState("main"); // "main" | "cards" | "notes"

  // Animations
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(20)).current;
  const fabScale = useRef(new Animated.Value(0)).current;
  const xpPulse = useRef(new Animated.Value(1)).current;

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
    } catch (e) {
      // ignore
    }
  }, []);

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

  // Fetch today's daily challenge with the user's progress toward it.
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
        });
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Mark today's challenge complete (server verifies the metric). On success
  // refresh XP + streak so the home screen stays in sync immediately.
  const completeChallenge = async () => {
    if (!challenge || challenge.completed || completingChallenge) return;
    setCompletingChallenge(true);
    try {
      await client.post(`/game/challenges/${challenge.id}/complete`);
      setChallenge((c) => (c ? { ...c, completed: true, progress: c.target } : c));
      Alert.alert("Challenge complete! 🎉", `+${challenge.xpReward} XP earned.`);
      fetchGameState();
      fetchStreakLevel();
    } catch (e) {
      Alert.alert("Not yet", e.message || "You haven't met this challenge's goal yet.");
    } finally {
      setCompletingChallenge(false);
    }
  };

  const fetchAll = useCallback(async () => {
    try {
      const [matRes, quizRes, collRes, noteRes] = await Promise.all([
        client.get("/materials"),
        client.get("/quizzes"),
        client.get("/flashcards/collections"),
        client.get("/notes"),
      ]);
      setMaterials(matRes.data.materials);
      setQuizzes(quizRes.data.quizzes);
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
      fetchStreakLevel();
      fetchChallenge();
    }, [fetchAll, fetchGameState, fetchStreakLevel, fetchChallenge])
  );

  // "I want to study..." → generate a gamified quiz from the topic.
  const generateStudy = async (source) => {
    const topic = studyTopic.trim();
    if (source === "topic" && !topic) {
      Alert.alert("Enter a topic", "Type what you want to study, e.g. \"Photosynthesis\".");
      return;
    }

    setGenerating(true);
    try {
      const payload = { topic: topic || "General" };
      if (source === "notes") {
        // Delegate to the note-import flow for pasted notes.
        setGenerating(false);
        navigation.navigate("NoteImport");
        return;
      }
      if (source === "pdf") {
        // Delegate to card-import flow which supports PDF upload + AI.
        setGenerating(false);
        navigation.navigate("CardImport");
        return;
      }

      const { data } = await client.post("/game/quiz", payload, { timeout: 120000 });
      if (!data.questions || data.questions.length === 0) {
        Alert.alert("No questions", "The AI didn't generate any questions. Try a different topic.");
        return;
      }
      navigation.navigate("GamifiedQuiz", {
        questions: data.questions,
        answerKey: data.answerKey,
        topic: data.topic,
        xp,
        hearts,
      });
    } catch (e) {
      Alert.alert("Generation failed", e.message);
    } finally {
      setGenerating(false);
    }
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
              navigation.navigate("Flashcards");
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

  const renderStat = (emoji, value, label, soft) => (
    <Pressable
      style={({ pressed }) => [
        styles.statCard,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: soft }]}>
        <Text style={styles.statEmoji}>{emoji}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );

  const renderMaterial = ({ item }) => (
    <Card style={{ marginBottom: 8 }}>
      <View style={styles.materialRow}>
        <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate("Material", { material: item })}>
          <Text style={styles.materialTitle}>{item.title}</Text>
          <Text style={styles.materialMeta}>
            {item.flashcards?.length || 0} cards · {item.quizzes?.length || 0} quiz
          </Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate("Material", { material: item })} style={{ marginLeft: 10 }}>
          <Text style={styles.actionText}>View</Text>
        </Pressable>
      </View>
    </Card>
  );

  const renderNote = ({ item }) => (
    <Pressable onPress={() => navigation.navigate("NoteView", { note: item })}>
      <Card style={{ marginBottom: 8, flexDirection: "row", alignItems: "center" }}>
        <View style={[styles.noteIcon, { backgroundColor: item.source === "ai" ? colors.violetSoft : colors.amberSoft }]}>
          <Text style={styles.noteIconEmoji}>{item.source === "ai" ? "✨" : "📝"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.materialTitle}>{item.title}</Text>
          <Text style={styles.materialMeta}>
            {item.source === "ai" ? "AI" : "Manual"} · {(item.contentJson || []).length} blocks
          </Text>
        </View>
        <Text style={styles.actionText}>Open →</Text>
      </Card>
    </Pressable>
  );

  return (
    <Screen>
      <FlatList
        data={materials}
        keyExtractor={(m) => m.id}
        renderItem={renderMaterial}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={
          <>
{/* XP + Hearts status bar — tap to open the Progress dashboard */}
<Pressable
              onPress={() => navigation.navigate("Progress")}
              style={({ pressed }) => [styles.gameBar, { opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={styles.gameBarLeft}>
                <View style={[styles.xpPill, { backgroundColor: colors.amberSoft }]}>
                  <Ionicons name="flash" size={17} color={colors.amber} />
                  <Text style={[styles.xpText, { color: colors.amber }]}>{xp} XP</Text>
                </View>
                <View style={[styles.levelPill, { backgroundColor: colors.violetSoft }]}>
                  <Ionicons name="shield-checkmark" size={15} color={colors.violet} />
                  <Text style={[styles.levelText, { color: colors.violet }]}>Lv {level.current}</Text>
                </View>
                <View style={[styles.streakPill, { backgroundColor: colors.tomatoSoft }]}>
                  <Ionicons name="flame" size={15} color={colors.tomato} />
                  <Text style={[styles.streakText, { color: colors.tomato }]}>{streak.current}</Text>
                </View>
              </View>
              <View style={styles.gameBarRight}>
                <View style={[styles.heartPill, { backgroundColor: colors.tomatoSoft }]}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Ionicons
                      key={i}
                      name={i < hearts ? "heart" : "heart-outline"}
                      size={19}
                      color={i < hearts ? "#FF5A76" : colors.border}
                    />
                  ))}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 2 }} />
              </View>
            </Pressable>

            {/* Daily Challenge + Leaderboard shortcut */}
            {challenge && !challenge.completed && (
              <Pressable
                onPress={completeChallenge}
                disabled={completingChallenge}
                style={({ pressed }) => [
                  styles.challengeCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.violet,
                    borderWidth: 1,
                    opacity: pressed || completingChallenge ? 0.85 : 1,
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
                    {Math.min(challenge.progress, challenge.target)}/{challenge.target} · +{challenge.xpReward} XP
                  </Text>
                </View>
                <View style={[styles.challengeCta, { backgroundColor: colors.violetSoft }]}>
                  {completingChallenge ? (
                    <ActivityIndicator color={colors.violet} size="small" />
                  ) : (
                    <Ionicons name="checkmark" size={20} color={colors.violet} />
                  )}
                </View>
              </Pressable>
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

            {/* Hero — greeting at top, above the input field */}
            <Animated.View style={[styles.hero, { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] }]}>
              <View style={styles.heroTextWrap}>
                <View style={[styles.heroIcon, { backgroundColor: colors.violetSoft }]}>
                  <Text style={styles.heroEmoji}>📚</Text>
                </View>
                <View style={styles.heroTexts}>
                  <Text style={styles.heroTitle}>What shall we study?</Text>
                  <Text style={styles.heroSubtitle}>
                    Type a topic below and let AI craft a fun quiz — earn XP for every correct answer!
                  </Text>
                </View>
              </View>

</Animated.View>

            {/* "I want to study..." generator */}
            <View style={[styles.generatorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.generatorLabel}>WHAT DO YOU WANT TO LEARN?</Text>
              <View style={styles.generatorRow}>
                <TextInput
                  value={studyTopic}
                  onChangeText={setStudyTopic}
                  placeholder="I want to study..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.generatorInput, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                  onSubmitEditing={() => generateStudy("topic")}
                  returnKeyType="go"
                />
                <Pressable
                  onPress={() => generateStudy("topic")}
                  disabled={generating}
                  style={({ pressed }) => [
                    styles.generateBtn,
                    { backgroundColor: colors.tomato, opacity: pressed || generating ? 0.8 : 1 },
                  ]}
                >
                  {generating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name="sparkles" size={18} color="#fff" />
                  )}
                  <Text style={styles.generateBtnText}>Generate</Text>
                </Pressable>
              </View>

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
            <View style={[styles.statsRow, isWide && styles.statsRowWide]}>
              {renderStat("🃏", totalCards, "Cards", colors.mintSoft)}
              {renderStat("📝", notes.length, "Notes", colors.amberSoft)}
              {renderStat("📚", materials.length, "Study packs", colors.violetSoft)}
              {renderStat("📊", quizzes.length, "Quizzes", colors.tomatoSoft)}
            </View>

            {/* Quick access */}
            <View style={styles.quickRow}>
              <Pressable style={styles.quickBtn} onPress={() => navigation.navigate("Flashcards")}>
                <Ionicons name="layers" size={18} color={colors.mint} />
                <Text style={styles.quickBtnText}>Cards</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => navigation.navigate("Notes")}>
                <Ionicons name="document-text" size={18} color={colors.amber} />
                <Text style={styles.quickBtnText}>Notes</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => navigation.navigate("Coach")}>
                <Ionicons name="sparkles" size={18} color={colors.violet} />
                <Text style={styles.quickBtnText}>AI Coach</Text>
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
            {materials.length === 0 && (
              <Text style={styles.mutedText}>
                No study packs yet. Tap + to create flashcards or notes, or visit AI Coach for guidance.
              </Text>
            )}
          </>
        }
        ListFooterComponent={
          <>
            <Text style={styles.sectionLabel}>AVAILABLE QUIZZES ({quizzes.length})</Text>
            {quizzes.length === 0 && <Text style={styles.mutedText}>No quizzes available.</Text>}
            {quizzes.map((q) => (
              <Pressable key={q.id} onPress={() => navigation.navigate("Quiz", { quizId: q.id, title: q.title })}>
                <Card style={{ marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.materialTitle}>{q.title}</Text>
                    <Text style={styles.materialMeta}>
                      {q.questions?.length || 0} questions{q.isPublished ? " · Published" : " · Draft"}
                    </Text>
                  </View>
                  <Text style={styles.actionText}>Take →</Text>
                </Card>
              </Pressable>
            ))}
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

const useStyles = (colors) =>
  StyleSheet.create({
    // Game status bar
    gameBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 12,
      marginBottom: 12,
    },
    xpPill: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 14,
      gap: 6,
    },
    xpText: { fontWeight: "800", fontSize: 13 },
    levelPill: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 11,
      gap: 5,
    },
    levelText: { fontWeight: "800", fontSize: 13 },
    streakPill: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 11,
      gap: 4,
    },
    streakText: { fontWeight: "800", fontSize: 13 },
    gameBarLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
    gameBarRight: { flexDirection: "row", alignItems: "center" },
    heartPill: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
      gap: 3,
    },
    // Daily challenge card
    challengeCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
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
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 16,
      padding: 13,
      marginBottom: 4,
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
      borderRadius: 18,
      padding: 14,
      marginBottom: 6,
    },
    generatorLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    generatorRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    generatorInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    generateBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
    generatorShortcuts: { flexDirection: "row", gap: 8, marginTop: 10 },
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
    hero: { position: "relative", flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 16 },
    heroTextWrap: { flexDirection: "row", alignItems: "center", flex: 1 },
    heroTexts: { flex: 1, marginLeft: 14 },
    heroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    heroEmoji: { fontSize: 30 },
    heroTitle: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 6 },
    heroSubtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, maxWidth: 280 },
    statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    statsRowWide: { flexWrap: "wrap" },
    statCard: {
      flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6,
      alignItems: "center",
    },
    statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
    statEmoji: { fontSize: 18 },
    statValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
    statLabel: { color: colors.textMuted, fontSize: 10.5, textAlign: "center", marginTop: 2 },
    quickRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
    quickBtn: {
      flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row",
      justifyContent: "center", gap: 6,
    },
    quickBtnText: { color: colors.text, fontWeight: "700", fontSize: 12.5 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8 },
    mutedText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 8 },
    collectionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    collectionChip: {
      borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 6,
    },
    collectionChipText: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
    collectionChipMeta: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },
    materialRow: { flexDirection: "row", alignItems: "center" },
    materialTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
    materialMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    actionText: { color: colors.tomato, fontSize: 12, fontWeight: "700" },
    noteIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
    noteIconEmoji: { fontSize: 20 },
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
