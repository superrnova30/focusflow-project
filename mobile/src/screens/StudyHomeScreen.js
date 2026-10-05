import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  TextInput,
  Image,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import ConfirmDialog from "../components/ConfirmDialog";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import BottomSheet from "../components/BottomSheet";
import client from "../api/client";
import { useAIChat } from '../context/AIChatContext';
import { usePremium } from '../context/PremiumContext';
import { studyType, loadStudyFonts } from "../theme/studyType";
import { formatRefillClock } from "../lib/hearts";
import HeaderWallet from "../components/HeaderWallet";
import NotificationBell from "../components/NotificationBell";
import UserAvatar from "../components/UserAvatar";
import { AIHistoryDrawer, AIHistorySidebar } from "../components/AIHistorySidebar";
import { setCachedCoins } from "../lib/coins";
import { useAIHistory } from "../context/AIHistoryContext";

const MAX_HEARTS = 5;

const ITEM_ACCENTS_LIGHT = ["#6C5CE7", "#0EA05C", "#DE911D", "#4C8DFF", "#E86A7A", "#2BB3A8"];
const ITEM_ACCENTS_DARK = ["#9B8CFF", "#4ADE94", "#FFC15E", "#7EB6FF", "#FF8A96", "#4DD4C7"];

function itemAccentColor(index, isDark) {
  const palette = isDark ? ITEM_ACCENTS_DARK : ITEM_ACCENTS_LIGHT;
  return palette[index % palette.length];
}

export default function StudyHomeScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 760;
  const isPhone = width < 560;
  const compact = width < 380;
  const styles = useMemo(
    () => createStyles(colors, isWide, isNarrow, compact, isPhone, isDark),
    [colors, isWide, isNarrow, compact, isPhone, isDark]
  );

  useEffect(() => {
    loadStudyFonts();
  }, []);

  const { isPremium, refreshLimits } = usePremium();
  const { user } = useAuth();
  const { stats: historyStats, conversations, load: loadHistory, loadConversation } = useAIHistory();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [schoolHub, setSchoolHub] = useState({ school: "", decks: [], notes: [] });
  const [resumingId, setResumingId] = useState(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselRef = useRef(null);

  const [materials, setMaterials] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [collections, setCollections] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingMaterial, setDeletingMaterial] = useState(null);
  const [deletingMaterialBusy, setDeletingMaterialBusy] = useState(false);

// Gamification state (XP + Hearts)
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [coins, setCoins] = useState(0);
  const [heartsRefillAt, setHeartsRefillAt] = useState(null);
  const heartsLocked = hearts <= 0 && !isPremium;

  // Gamification polish — streak, level, daily challenge
  const [streak, setStreak] = useState({ current: 0, longest: 0 });
  const [level, setLevel] = useState({ current: 1, xpWithinLevel: 0, xpForNext: 500, step: 500 });
  const [challenge, setChallenge] = useState(null);

  // Lightweight input that navigates to the dedicated AI conversation page
  const [studyTopic, setStudyTopic] = useState("");
  const [navigatingToChat, setNavigatingToChat] = useState(false);
  const { clear: startNewChat, resumeConversation } = useAIChat();

  // Bottom-sheet state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetStep, setSheetStep] = useState("main"); // "main" | "cards" | "notes"

  const fetchGameState = useCallback(async () => {
    try {
      const { data } = await client.get("/game/state");
      if (data.state) {
        setHearts(data.state.hearts ?? MAX_HEARTS);
        setCoins(data.state.coins || 0);
        setCachedCoins(data.state.coins || 0);
        setHeartsRefillAt(data.state.heartsRefillAt || null);
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
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const { data } = await client.get("/game/streak", { params: { timezone } });
      if (data) {
        setStreak(data.streak || { current: 0, longest: 0 });
        setLevel(
          data.level || { current: 1, xpWithinLevel: 0, xpForNext: 500, step: 500 }
        );
        setCoins(data.coins || 0);
        if (data.coins != null) setCachedCoins(data.coins);
        if (data.streakCoinsEarned > 0) {
          Alert.alert(
            "Streak level up!",
            `You earned ${data.streakCoinsEarned} coins. Keep your streak going!`
          );
        }
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

  const fetchSchoolHub = useCallback(async () => {
    try {
      const { data } = await client.get("/students/school", { params: { name: user?.school } });
      setSchoolHub({
        school: data.school || user?.school || "",
        decks: data.decks || [],
        notes: data.notes || [],
      });
    } catch {
      setSchoolHub({ school: user?.school || "", decks: [], notes: [] });
    }
  }, [user?.school]);

  const recentChats = useMemo(() => (conversations || []).slice(0, 6), [conversations]);
  const schoolName = schoolHub.school || user?.school || "Your School";
  const popularDecks = useMemo(() => (schoolHub.decks || []).slice(0, 12), [schoolHub.decks]);
  const carouselGap = 12;
  const carouselPeek = compact ? 26 : isPhone ? 36 : 52;
  const deckCardWidth = useMemo(() => {
    if (!carouselWidth) return compact ? 240 : 280;
    if (popularDecks.length <= 1) return carouselWidth;
    return Math.max(200, carouselWidth - carouselPeek);
  }, [carouselWidth, popularDecks.length, compact, carouselPeek]);
  const deckSnap = deckCardWidth + carouselGap;

useFocusEffect(
    useCallback(() => {
      fetchAll();
      fetchGameState();
      fetchSchoolHub();
      loadHistory({ mode: "initial" });
      (async () => {
        await fetchStreakLevel();
        await fetchChallenge();
      })();
    }, [fetchAll, fetchGameState, fetchSchoolHub, loadHistory, fetchStreakLevel, fetchChallenge])
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
    startNewChat();
    navigation.navigate('StudyChat', { initialTopic: trimmed, initialRequestId: Date.now() });
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

  const openRecentChat = async (conversation) => {
    if (!conversation?.id || resumingId) return;
    setResumingId(conversation.id);
    try {
      const data = await loadConversation(conversation.id);
      resumeConversation(conversation.id, data.messages || []);
      navigation.navigate("StudyChat", {
        resumedConversationId: conversation.id,
        conversationTitle: conversation.title,
      });
    } catch {
      navigation.navigate("AIHistoryDetail", {
        conversationId: conversation.id,
        title: conversation.title,
      });
    } finally {
      setResumingId(null);
    }
  };

  const openSchoolHub = () => {
    const school = schoolHub.school || user?.school;
    if (!school) {
      navigation.navigate("Profile", { screen: "Settings" });
      return;
    }
    navigation.navigate("SchoolHub", { school });
  };

  const openPopularDeck = (deck) => {
    navigation.navigate("FlashcardCollection", {
      collection: deck,
      readOnly: deck.userId !== user?.id,
    });
  };

  const scrollPopularTo = (index) => {
    const next = Math.max(0, Math.min(index, popularDecks.length - 1));
    carouselRef.current?.scrollTo({ x: next * deckSnap, animated: true });
    setCarouselIndex(next);
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

  return (
    <Screen>
      <View style={styles.studyShell}>
        {isWide && sidebarOpen ? (
          <View style={styles.dockedSidebar}>
            <AIHistorySidebar navigation={navigation} />
          </View>
        ) : null}
        <View style={styles.studyMain}>
      <FlatList
        style={styles.list}
        data={materials}
        keyExtractor={(m) => m.id}
        renderItem={renderMaterial}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={styles.page}
        ListHeaderComponent={
          <>
            <View style={styles.hubHeader}>
              <Pressable
                onPress={() => (isWide ? setSidebarOpen((open) => !open) : setHistoryOpen(true))}
                accessibilityRole="button"
                accessibilityLabel={isWide ? (sidebarOpen ? "Hide AI History menu" : "Show AI History menu") : "Open AI History menu"}
                style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
              >
                <Ionicons name="menu" size={22} color={colors.text} />
                {!isWide && (historyStats.totalConversations || 0) > 0 ? (
                  <View style={styles.historyBadge}>
                    <Text style={styles.historyBadgeText}>
                      {historyStats.totalConversations > 99 ? "99+" : historyStats.totalConversations}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <View style={styles.headerActions}>
                <HeaderWallet compact={isPhone} />
                <NotificationBell />
              </View>
            </View>

            <View style={styles.askHero}>
              <View style={styles.askIntro}>
                <Image
                  source={require("../theme/logo.png")}
                  style={styles.askMascot}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
                <View style={styles.askHeadline}>
                  <Text style={styles.askEyebrow}>What shall we</Text>
                  <Text style={styles.askTitle}>Study?</Text>
                </View>
              </View>

              <View style={styles.askField}>
                <Pressable
                  onPress={openSheet}
                  accessibilityRole="button"
                  accessibilityLabel="Create notes or flashcards"
                  style={({ pressed }) => [styles.askAdd, pressed && styles.pressed]}
                >
                  <Ionicons name="add" size={22} color={colors.text} />
                </Pressable>
                <TextInput
                  value={studyTopic}
                  onChangeText={setStudyTopic}
                  placeholder="I want to study..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.askInput}
                  onSubmitEditing={() => generateStudy("topic")}
                  returnKeyType="go"
                  multiline={false}
                  accessibilityLabel="I want to study"
                />
                {studyTopic.trim() ? (
                  <Pressable
                    onPress={() => generateStudy("topic")}
                    disabled={navigatingToChat}
                    style={({ pressed }) => [styles.askSend, pressed && styles.pressed]}
                    accessibilityLabel="Ask AI"
                  >
                    {navigatingToChat ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.jumpRow}>
              {[
                ["layers-outline", "Flashcards", () => navigation.navigate("Files", { screen: "FilesHome", params: { section: "mine", kind: "flashcards" } }), colors.mint, colors.mintSoft],
                ["document-text-outline", "Notes", () => navigation.navigate("Files", { screen: "FilesHome", params: { section: "mine", kind: "notes" } }), colors.amber, colors.amberSoft],
                ["school-outline", "Coach", () => navigation.navigate("Coach"), colors.violet, colors.violetSoft],
              ].map(([icon, label, onPress, color, soft]) => (
                <Pressable
                  key={label}
                  onPress={onPress}
                  style={({ pressed }) => [styles.jumpChip, pressed && styles.pressed]}
                >
                  <View style={[styles.jumpIcon, { backgroundColor: soft }]}>
                    <Ionicons name={icon} size={16} color={color} />
                  </View>
                  <Text style={styles.jumpLabel} numberOfLines={1}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.homeSection}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionHeading}>Jump Back In</Text>
                <Pressable
                  onPress={() => navigation.navigate("AIHistory")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="View all AI conversations"
                >
                  <Text style={styles.viewAllText}>View all</Text>
                </Pressable>
              </View>
              {recentChats.length === 0 ? (
                <View style={styles.inlineEmpty}>
                  <Ionicons name="chatbubbles-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.inlineEmptyText}>Your recent AI chats will show up here.</Text>
                </View>
              ) : (
                <View style={styles.recentRow}>
                  {recentChats.map((chat, index) => (
                    <Pressable
                      key={chat.id}
                      onPress={() => openRecentChat(chat)}
                      disabled={resumingId === chat.id}
                      accessibilityRole="button"
                      accessibilityLabel={chat.title || "Conversation"}
                      style={({ pressed }) => [styles.recentCard, pressed && styles.pressed]}
                    >
                      <View
                        pointerEvents="none"
                        style={[styles.itemAccent, { backgroundColor: itemAccentColor(index, isDark) }]}
                      />
                      {resumingId === chat.id ? (
                        <ActivityIndicator size="small" color={colors.violet} />
                      ) : (
                        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.violet} />
                      )}
                      <Text style={styles.recentTitle} numberOfLines={1}>
                        {chat.title || "Conversation"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.homeSection}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionHeading} numberOfLines={1}>
                  Decks Popular at {schoolName}
                </Text>
                <Pressable
                  onPress={openSchoolHub}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={schoolHub.school || user?.school ? "View all school decks" : "Add your school"}
                >
                  <Text style={styles.viewAllText}>
                    {schoolHub.school || user?.school ? "View all" : "Add school"}
                  </Text>
                </Pressable>
              </View>
              {popularDecks.length === 0 ? (
                <View style={styles.inlineEmpty}>
                  <Ionicons name="school-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.inlineEmptyText}>
                    {schoolHub.school || user?.school
                      ? "No public decks from your school yet."
                      : "Add your school in Settings to see popular decks."}
                  </Text>
                </View>
              ) : (
                <View
                  style={styles.popularCarousel}
                  onLayout={(event) => {
                    const nextWidth = Math.round(event.nativeEvent.layout.width);
                    if (nextWidth && nextWidth !== carouselWidth) setCarouselWidth(nextWidth);
                  }}
                >
                  <ScrollView
                    ref={carouselRef}
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={popularDecks.length > 1 ? deckSnap : undefined}
                    snapToAlignment="start"
                    disableIntervalMomentum
                    contentContainerStyle={[
                      styles.popularTrack,
                      popularDecks.length > 1 && { paddingRight: carouselPeek - carouselGap },
                    ]}
                    onScroll={(event) => {
                      if (popularDecks.length <= 1) return;
                      const next = Math.round(event.nativeEvent.contentOffset.x / deckSnap);
                      const clamped = Math.max(0, Math.min(next, popularDecks.length - 1));
                      if (clamped !== carouselIndex) setCarouselIndex(clamped);
                    }}
                    scrollEventThrottle={16}
                  >
                    {popularDecks.map((deck, index) => {
                      const cards = deck._count?.flashcards || 0;
                      return (
                        <Pressable
                          key={deck.id}
                          onPress={() => openPopularDeck(deck)}
                          accessibilityRole="button"
                          accessibilityLabel={`${deck.name || "Deck"}, ${cards} cards, by ${deck.user?.name || "Student"}`}
                          style={({ pressed }) => [
                            styles.popularCard,
                            { width: deckCardWidth },
                            pressed && styles.pressed,
                          ]}
                        >
                          <View
                            pointerEvents="none"
                            style={[styles.itemAccent, { backgroundColor: itemAccentColor(index, isDark) }]}
                          />
                          <View style={styles.popularBody}>
                            <Text style={styles.popularTitle} numberOfLines={2}>
                              {deck.name || "Untitled deck"}
                            </Text>
                            <View style={styles.popularMeta}>
                              <Text style={styles.popularCards}>
                                {cards} {cards === 1 ? "card" : "cards"}
                              </Text>
                              <View style={styles.popularAuthorRow}>
                                <UserAvatar user={deck.user} size={compact ? 16 : 18} />
                                <Text style={styles.popularAuthor} numberOfLines={1}>
                                  {deck.user?.name || "Student"}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {popularDecks.length > 1 ? (
                    <View style={styles.popularNav}>
                      {!isPhone ? (
                        <Pressable
                          onPress={() => scrollPopularTo(carouselIndex - 1)}
                          disabled={carouselIndex === 0}
                          accessibilityRole="button"
                          accessibilityLabel="Previous deck"
                          style={({ pressed }) => [
                            styles.popularArrow,
                            carouselIndex === 0 && styles.popularArrowOff,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Ionicons name="chevron-back" size={16} color={colors.text} />
                        </Pressable>
                      ) : null}
                      <View style={styles.popularDots}>
                        {popularDecks.map((deck, index) => (
                          <Pressable
                            key={deck.id}
                            onPress={() => scrollPopularTo(index)}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`Go to deck ${index + 1}`}
                            style={[
                              styles.popularDot,
                              index === carouselIndex && styles.popularDotOn,
                            ]}
                          />
                        ))}
                      </View>
                      {!isPhone ? (
                        <Pressable
                          onPress={() => scrollPopularTo(carouselIndex + 1)}
                          disabled={carouselIndex === popularDecks.length - 1}
                          accessibilityRole="button"
                          accessibilityLabel="Next deck"
                          style={({ pressed }) => [
                            styles.popularArrow,
                            carouselIndex === popularDecks.length - 1 && styles.popularArrowOff,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Ionicons name="chevron-forward" size={16} color={colors.text} />
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {loading && materials.length === 0 ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={colors.violet} />
              </View>
            ) : materials.length === 0 && quizzes.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.mutedText}>Tap Create to add notes or flashcards.</Text>
              </View>
            ) : (
              <Text style={styles.sectionLabel}>Your library</Text>
            )}
          </>
        }
        ListFooterComponent={
          quizzes.length === 0 ? null : (
          <>
            {materials.length > 0 ? <Text style={styles.sectionLabel}>Quizzes</Text> : null}
              <View style={styles.quizGrid}>
                {quizzes.map((quiz) => (
                  <Pressable
                    key={quiz.id}
                    onPress={() => {
                      if (heartsLocked) {
                        Alert.alert(
                          "Quiz unavailable",
                          `You're out of hearts. They refill ${formatRefillClock(heartsRefillAt) ? `at ${formatRefillClock(heartsRefillAt)}` : "in 24 hours"}, or spend 5 coins in Progress to revive one.`,
                          [
                            { text: "Not now", style: "cancel" },
                            { text: "Open Progress", onPress: () => navigation.navigate("Progress") },
                          ]
                        );
                        return;
                      }
                      navigation.navigate("Quiz", { quizId: quiz.id, title: quiz.title });
                    }}
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
          </>
          )
        }
      />

        </View>
      </View>

      <AIHistoryDrawer
        visible={!isWide && historyOpen}
        onClose={() => setHistoryOpen(false)}
        navigation={navigation}
      />

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

const createStyles = (colors, isWide, isNarrow, compact, isPhone, isDark) => {
  const type = (extra) => studyType.text(extra);
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.06)";
  const cardFill = isDark ? colors.surfaceRaised : colors.surface;
  const cardLift = isDark
    ? { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }
    : { shadowColor: "#1B1F3B", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 };

  return StyleSheet.create({
    list: {
      flex: 1,
    },
    studyShell: {
      flex: 1,
      flexDirection: isWide ? "row" : "column",
      gap: isWide ? 16 : 0,
      minHeight: 0,
    },
    dockedSidebar: {
      width: 280,
      flexShrink: 0,
      alignSelf: "stretch",
      paddingTop: 8,
      paddingBottom: 8,
    },
    studyMain: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
    },
    page: {
      width: "100%",
      maxWidth: isWide ? "100%" : 960,
      alignSelf: "center",
      paddingTop: 8,
      paddingBottom: 24,
    },
    menuBtn: {
      width: 42,
      height: 42,
      borderRadius: 16,
      backgroundColor: cardFill,
      borderWidth: 1,
      borderColor: cardBorder,
      alignItems: "center",
      justifyContent: "center",
      ...cardLift,
    },
    historyBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
    },
    historyBadgeText: type({ color: "#fff", fontSize: 9, fontWeight: "700" }),
    pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
    hubHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 12,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 0,
    },
    // Game status bar
    gameBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: cardFill,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 18,
      paddingVertical: compact ? 8 : 10,
      paddingHorizontal: compact ? 6 : 10,
      marginBottom: 10,
    },
    statusMetric: {
      flex: 1,
      alignItems: "center",
      minWidth: 0,
    },
    statusLabel: type({
      color: colors.textMuted,
      fontSize: compact ? 10 : 11,
      fontWeight: "600",
      marginBottom: 2,
    }),
    statusValue: type({
      fontSize: compact ? 13 : 15,
      lineHeight: compact ? 16 : 18,
      fontWeight: "700",
    }),
    metricDivider: {
      width: 1,
      height: 22,
      backgroundColor: cardBorder,
      opacity: 0.7,
    },
    challengeStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 10,
    },
    challengeIcon: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    challengeTitle: type({ color: colors.text, fontSize: 13, fontWeight: "700" }),
    challengeDesc: type({ color: colors.textMuted, fontSize: 12, marginTop: 1 }),
    askHero: {
      alignItems: "center",
      paddingTop: compact ? 16 : isPhone ? 20 : isWide ? 26 : 22,
      paddingBottom: compact ? 4 : 6,
      marginBottom: 12,
    },
    askIntro: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: compact ? 10 : 14,
      width: "100%",
      maxWidth: 420,
      marginBottom: compact ? 14 : 18,
    },
    askMascot: {
      width: compact ? 72 : isPhone ? 86 : 100,
      height: compact ? 72 : isPhone ? 86 : 100,
    },
    askHeadline: {
      flexShrink: 1,
      minWidth: 0,
    },
    askEyebrow: type({
      color: colors.textMuted,
      fontSize: compact ? 15 : isPhone ? 16 : 18,
      fontWeight: "500",
    }),
    askTitle: type({
      color: colors.text,
      fontSize: compact ? 30 : isPhone ? 36 : 40,
      lineHeight: compact ? 34 : isPhone ? 40 : 46,
      fontWeight: "700",
    }),
    askField: {
      width: "100%",
      maxWidth: 560,
      minHeight: compact ? 52 : 58,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? colors.surfaceRaised : "#FFFFFF",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? cardBorder : "rgba(17,24,39,0.08)",
      paddingLeft: 6,
      paddingRight: 6,
      shadowColor: "#1B1F3B",
      shadowOpacity: isDark ? 0.16 : 0.07,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: isDark ? 1 : 2,
    },
    askInput: type({
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: compact ? 15 : 16,
      fontWeight: "500",
      paddingVertical: 14,
      paddingHorizontal: 8,
    }),
    askSend: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
    },
    askAdd: {
      width: compact ? 36 : 40,
      height: compact ? 36 : 40,
      borderRadius: 20,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#F3F2FA",
      alignItems: "center",
      justifyContent: "center",
    },
    shortcutBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 10,
    },
    shortcutText: type({ color: colors.text, fontSize: 13, fontWeight: "600" }),
    heroTextWrap: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 },
    heroTexts: { flex: 1, marginLeft: 10, minWidth: 0 },
    heroIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      flexShrink: 0,
    },
    heroSubtitle: type({
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
      fontWeight: "500",
    }),
    jumpRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    jumpChip: {
      flex: 1,
      minWidth: 0,
      flexDirection: compact ? "column" : "row",
      alignItems: "center",
      justifyContent: "center",
      gap: compact ? 6 : 8,
      backgroundColor: cardFill,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 18,
      paddingVertical: compact ? 11 : 13,
      paddingHorizontal: 8,
      ...cardLift,
    },
    jumpIcon: {
      width: 32,
      height: 32,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    jumpLabel: type({ color: colors.text, fontSize: compact ? 12 : 13.5, fontWeight: "600" }),
    homeSection: {
      marginBottom: 14,
    },
    sectionHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 10,
    },
    sectionHeading: type({
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: compact ? 15 : 16.5,
      fontWeight: "700",
    }),
    viewAllText: type({
      color: colors.violet,
      fontSize: 13,
      fontWeight: "600",
    }),
    inlineEmpty: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: cardFill,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    inlineEmptyText: type({
      flex: 1,
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "500",
    }),
    recentRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    itemAccent: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    recentCard: {
      maxWidth: "100%",
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      overflow: "hidden",
      backgroundColor: cardFill,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 14,
      paddingVertical: 10,
      paddingLeft: compact ? 16 : 18,
      paddingRight: compact ? 12 : 14,
    },
    recentTitle: type({ flexShrink: 1, color: colors.text, fontSize: compact ? 13 : 14, fontWeight: "600" }),
    popularCarousel: {
      width: "100%",
    },
    popularTrack: {
      gap: 12,
    },
    popularCard: {
      overflow: "hidden",
      backgroundColor: cardFill,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 18,
      paddingVertical: compact ? 12 : 13,
      paddingLeft: compact ? 18 : 20,
      paddingRight: compact ? 14 : 16,
      ...cardLift,
    },
    popularBody: {
      gap: 6,
    },
    popularTitle: type({
      color: colors.text,
      fontSize: compact ? 15 : 16,
      fontWeight: "700",
      lineHeight: compact ? 20 : 22,
    }),
    popularMeta: {
      gap: 2,
    },
    popularCards: type({
      color: colors.violet,
      fontSize: 13,
      fontWeight: "600",
    }),
    popularAuthorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    },
    popularAuthor: type({
      flexShrink: 1,
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: "500",
    }),
    popularNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginTop: 10,
    },
    popularDots: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    popularDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(17,24,39,0.16)",
    },
    popularDotOn: {
      width: 16,
      backgroundColor: colors.violet,
    },
    popularArrow: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: cardFill,
      borderWidth: 1,
      borderColor: cardBorder,
    },
    popularArrowOff: {
      opacity: 0.35,
    },
    unlimitedBanner: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 18,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 4,
    },
    unlimitedIcon: {
      width: 36,
      height: 36,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      borderWidth: 1,
    },
    unlimitedCrown: { fontSize: 18 },
    unlimitedTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    unlimitedTitle: type({ color: colors.text, fontSize: 15, fontWeight: "700" }),
    unlimitedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2.5,
    },
    unlimitedBadgeText: type({ color: "#fff", fontSize: 10, fontWeight: "700" }),
    unlimitedSubtitle: type({ color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "500" }),
    sectionLabel: type({
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 10,
    }),
    mutedText: type({ color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 5, fontWeight: "500" }),
    collectionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    collectionChip: {
      minWidth: compact ? "47%" : 140,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 2,
    },
    collectionChipText: type({ color: colors.text, fontSize: 13, fontWeight: "600" }),
    collectionChipMeta: type({ color: colors.textMuted, fontSize: 11.5, marginTop: 2, fontWeight: "500" }),
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
      gap: 12,
      backgroundColor: cardFill,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 18,
      padding: 13,
      ...cardLift,
    },
    contentDeleteBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.tomatoSoft,
    },
    contentIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    contentTitle: type({ color: colors.text, fontSize: 14, fontWeight: "700" }),
    contentMeta: type({ color: colors.textMuted, fontSize: 12, marginTop: 3, fontWeight: "500" }),
    loadingState: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      paddingVertical: 16,
    },
    emptyState: {
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: cardFill,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: cardBorder,
      borderRadius: 18,
    },
    emptyStateCompact: {
      padding: 12,
      backgroundColor: cardFill,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: cardBorder,
      borderRadius: 18,
    },
    emptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    emptyTitle: type({ color: colors.text, fontSize: 15, fontWeight: "700" }),
    emptyCta: {
      marginTop: 10,
      backgroundColor: colors.tomato,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    emptyCtaText: type({ color: "#fff", fontSize: 13, fontWeight: "700" }),
    quizGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    quizCard: {
      flexBasis: isWide ? "48%" : "100%",
      flexGrow: isWide ? 1 : 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: cardFill,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 18,
      padding: 13,
      ...cardLift,
    },
    quizCta: {
      width: 32,
      height: 32,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    // Bottom sheet options
    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
    },
    optionIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    optionEmoji: { fontSize: 22 },
    optionTitle: type({ color: colors.text, fontSize: 15, fontWeight: "700" }),
    optionSubtitle: type({ color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18, fontWeight: "500" }),
    backLink: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 4, paddingVertical: 6 },
    backLinkText: type({ color: colors.textMuted, fontSize: 13, fontWeight: "600" }),
  });
};
