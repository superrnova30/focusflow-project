import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card } from "../components/Screen";
import Calendar from "../components/Calendar";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { getStreakLevel } from "../lib/streakLevels";
import { formatRefillClock, useRefillCountdown } from "../lib/hearts";
import HeaderWallet from "../components/HeaderWallet";
import CoinIcon from "../components/CoinIcon";
import { setCachedCoins } from "../lib/coins";

const MAX_HEARTS = 5;

function fmtMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ProgressScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { refreshUser } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 700;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [buying, setBuying] = useState(null);
  const heartsCountdown = useRefillCountdown(data?.user?.heartsRefillAt);

  // Progress bar animation — re-triggers whenever data refreshes.
  const barAnim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  const fetchProgress = useCallback(
    async (month) => {
      try {
        const params = {
          ...(month ? { month } : {}),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        };
        const { data: res } = await client.get("/game/progress", { params });
        setData(res);
        if (res.user?.coins != null) setCachedCoins(res.user.coins);
        if (res.streakCoinsEarned > 0) {
          Alert.alert("Streak level up!", `You earned ${res.streakCoinsEarned} coins.`);
        }
      } catch (e) {
        // Non-fatal; keep previous data.
      } finally {
        setLoading(false);
      }
    },
    []
  );

useFocusEffect(
    useCallback(() => {
      fetchProgress(fmtMonth(viewMonth));
      refreshUser().catch(() => {});
    }, [fetchProgress, viewMonth, refreshUser])
  );

  useEffect(() => {
    if (data) {
      barAnim.setValue(0);
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: false,
      }).start();
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 260, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    }
  }, [data, barAnim, pulse]);

  const changeMonth = (dir) => {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + dir, 1);
    setViewMonth(next);
    setSelectedDate(null);
    fetchProgress(fmtMonth(next));
  };

  const buyReward = async (item) => {
    if (buying) return;
    setBuying(item);
    try {
      const { data: result } = await client.post("/game/coins/spend", { item });
      setData((current) => current ? {
        ...current,
        user: {
          ...current.user,
          coins: result.coins,
          hearts: result.hearts,
          hints: result.hints,
          heartsBlocked: result.heartsBlocked,
          heartsRefillAt: result.heartsRefillAt,
        },
      } : current);
      if (result.coins != null) setCachedCoins(result.coins);
      Alert.alert(
        "Reward unlocked",
        item === "heart" ? "You revived 1 heart." : "You received 1 hint."
      );
    } catch (e) {
      Alert.alert("Unable to purchase", e.response?.data?.error || "Please try again.");
    } finally {
      setBuying(null);
    }
  };

  if (loading && !data) {
    return (
      <Screen>
        <View style={styles.centerLoading}>
          <ActivityIndicator color={colors.tomato} size="large" />
          <Text style={styles.loadingText}>Loading your progress…</Text>
        </View>
      </Screen>
    );
  }

  const user = data?.user || {};
  const level = data?.level || { current: 1, xpWithinLevel: 0, xpForNext: 500, step: 500 };
  const streak = data?.streak || { current: 0, longest: 0 };
  const streakLevel = getStreakLevel(streak.current);
  const hearts = user.hearts ?? MAX_HEARTS;
  const heartsRefillAt = user.heartsRefillAt;
  const pct = Math.min(100, Math.round((level.xpWithinLevel / level.step) * 100));
  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${pct}%`] });

  const renderStatCard = (icon, color, soft, value, label) => (
    <Card style={[styles.statCard, isWide && { flex: 1 }]}>
      <View style={[styles.statIconWrap, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Progress</Text>
            <Text style={styles.headerSubtitle}>Track your study journey</Text>
          </View>
          <View style={styles.headerActions}>
            <HeaderWallet />
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.closeBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Hearts + Streak summary */}
        <View style={[styles.topRow, width < 430 && styles.topRowCompact]}>
          {/* Hearts */}
          <Card style={styles.heartCard}>
            <Text style={styles.cardLabel}>HEARTS</Text>
            <View style={styles.heartRow}>
              <Ionicons name="heart" size={26} color="#FF5A76" />
              <Text style={styles.heartCount}>{hearts}</Text>
            </View>
            <View style={styles.heartsDots}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Ionicons
                  key={i}
                  name={i < hearts ? "heart" : "heart-outline"}
                  size={16}
                  color={i < hearts ? "#FF5A76" : colors.border}
                />
              ))}
            </View>
            {hearts <= 0 ? (
              <Text style={styles.heartTimer}>
                {heartsCountdown === "Ready now"
                  ? "Hearts are ready to restore"
                  : `Refills in ${heartsCountdown || "24 hours"}`}
                {formatRefillClock(heartsRefillAt) ? `\nAvailable ${formatRefillClock(heartsRefillAt)}` : ""}
              </Text>
            ) : null}
          </Card>

          {/* Streak */}
          <Card style={[styles.streakCard, { borderColor: streakLevel.color, backgroundColor: streakLevel.softColor }]}>
            <View style={styles.streakHeader}>
              <Text style={[styles.cardLabel, styles.streakCardLabel, { color: streakLevel.color }]}>CURRENT STREAK</Text>
              <View style={[styles.streakBadge, { backgroundColor: streakLevel.color }]}>
                <Text style={styles.streakBadgeText}>{streakLevel.name}</Text>
              </View>
            </View>
            <View style={styles.streakMain}>
              <View style={[styles.streakIcon, { backgroundColor: `${streakLevel.color}24` }]}>
                <Ionicons name="flame" size={26} color={streakLevel.color} />
              </View>
              <Text style={[styles.streakCount, { color: streakLevel.color }]}>{streak.current}</Text>
              <Text style={styles.streakUnit}>{streak.current === 1 ? "day" : "days"}</Text>
            </View>
            <Text style={styles.streakBest}>Best: {streak.longest} days 🔥</Text>
            <Text style={[styles.streakNext, { color: streakLevel.color }]}>
              {streakLevel.nextMilestone
                ? `${streakLevel.daysToNext} day${streakLevel.daysToNext === 1 ? "" : "s"} to ${streakLevel.nextName}`
                : "Highest streak level reached"}
            </Text>
          </Card>
        </View>

        <Card style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <View style={styles.coinBalance}>
              <View style={styles.coinIcon}>
                <CoinIcon size={20} />
              </View>
              <View>
                <Text style={styles.walletLabel}>STREAK COINS</Text>
                <Text style={styles.walletValue}>{user.coins || 0} coins</Text>
              </View>
            </View>
            <Text style={styles.walletHint}>Earn 20 at each streak level</Text>
          </View>
          <View style={[styles.shopRow, width < 430 && styles.shopRowCompact]}>
            <Pressable
              disabled={buying != null || hearts >= MAX_HEARTS || (user.coins || 0) < 5}
              onPress={() => buyReward("heart")}
              style={({ pressed }) => [
                styles.shopButton,
                (hearts >= MAX_HEARTS || (user.coins || 0) < 5) && styles.shopButtonDisabled,
                pressed && styles.shopButtonPressed,
              ]}
            >
              <Ionicons name="heart" size={22} color="#FF5A76" />
              <View style={styles.shopCopy}>
                <Text style={styles.shopTitle}>{hearts >= MAX_HEARTS ? "Hearts full" : "Revive 1 Heart"}</Text>
                <Text style={styles.shopPrice}>5 coins</Text>
              </View>
              {buying === "heart" && <ActivityIndicator size="small" color={colors.tomato} />}
            </Pressable>
            <Pressable
              disabled={buying != null || (user.coins || 0) < 10}
              onPress={() => buyReward("hint")}
              style={({ pressed }) => [
                styles.shopButton,
                (user.coins || 0) < 10 && styles.shopButtonDisabled,
                pressed && styles.shopButtonPressed,
              ]}
            >
              <Ionicons name="key" size={22} color={colors.amber} />
              <View style={styles.shopCopy}>
                <Text style={styles.shopTitle}>Get 1 Hint</Text>
                <Text style={styles.shopPrice}>10 coins · {user.hints || 0} available</Text>
              </View>
              {buying === "hint" && <ActivityIndicator size="small" color={colors.amber} />}
            </Pressable>
          </View>
        </Card>

        {/* XP + Level card with progress bar */}
        <Card style={styles.xpCard}>
          <View style={styles.xpHeader}>
            <View style={[styles.xpIconWrap, { backgroundColor: colors.amberSoft }]}>
              <Ionicons name="flash" size={22} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.xpTitle}>Level {level.current}</Text>
              <Text style={styles.xpTotal}>{user.xp || 0} total XP · {user.totalXpEarned || 0} earned</Text>
            </View>
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <Text style={[styles.xpNext, { color: colors.amber }]}>
                {level.xpForNext} XP to go
              </Text>
            </Animated.View>
          </View>

          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { width: barWidth, backgroundColor: colors.amber }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barLabelText}>
              {level.xpWithinLevel}/{level.step} XP in level
            </Text>
            <Text style={styles.barLabelText}>{pct}%</Text>
          </View>
        </Card>

        {/* Quick stats */}
        <Text style={styles.sectionLabel}>LIFETIME STATS</Text>
        <View style={[styles.statsRow, isWide && styles.statsRowWide]}>
          {renderStatCard("checkmark-circle", colors.mint, colors.mintSoft, user.correctAnswers || 0, "Correct")}
          {renderStatCard("close-circle", colors.tomato, colors.tomatoSoft, user.wrongAnswers || 0, "Wrong")}
          {renderStatCard("trophy", colors.violet, colors.violetSoft, user.challengesCompleted || 0, "Challenges")}
        </View>

        {/* Calendar */}
        <Text style={styles.sectionLabel}>STUDY CALENDAR</Text>
        <Calendar
          days={data?.calendar || []}
          viewMonth={viewMonth}
          onPrev={() => changeMonth(-1)}
          onNext={() => changeMonth(1)}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          streakColor={streakLevel.color}
        />

        <Text style={styles.hintText}>
          💡 Earn XP and hearts by completing focus sessions and acing quizzes. Keep your streak alive by studying daily!
        </Text>
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    centerLoading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    loadingText: { color: colors.textMuted, fontSize: 14 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 8,
      marginBottom: 16,
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
    headerTitle: { color: colors.text, fontSize: 26, fontWeight: "800" },
    headerSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    topRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    topRowCompact: { flexDirection: "column" },
    heartCard: { flex: 1, padding: 16 },
    streakCard: { flex: 1, padding: 16 },
    cardLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 10 },
    heartRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    heartCount: { color: colors.text, fontSize: 30, fontWeight: "800" },
    heartsDots: { flexDirection: "row", gap: 3, marginTop: 10 },
    heartTimer: { color: colors.amber, fontSize: 11, fontWeight: "700", marginTop: 10, lineHeight: 16 },
    streakHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    streakCardLabel: { marginBottom: 0 },
    streakBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
    streakBadgeText: { color: "#fff", fontSize: 9.5, fontWeight: "900" },
    streakMain: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 },
    streakIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    streakCount: { color: colors.text, fontSize: 30, fontWeight: "800" },
    streakUnit: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    streakBest: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
    streakNext: { fontSize: 10.5, fontWeight: "800", marginTop: 4 },
    walletCard: { padding: 16, marginBottom: 12, borderColor: "#F5B942" },
    walletHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 },
    coinBalance: { flexDirection: "row", alignItems: "center", gap: 10 },
    coinIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFE8A3", alignItems: "center", justifyContent: "center" },
    walletLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
    walletValue: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 1 },
    walletHint: { color: colors.textMuted, fontSize: 10.5, flexShrink: 1, textAlign: "right" },
    shopRow: { flexDirection: "row", gap: 10 },
    shopRowCompact: { flexDirection: "column" },
    shopButton: { flex: 1, minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
    shopButtonDisabled: { opacity: 0.45 },
    shopButtonPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
    shopCopy: { flex: 1 },
    shopTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
    shopPrice: { color: colors.textMuted, fontSize: 10.5, marginTop: 3 },
    xpCard: { padding: 18, marginBottom: 12 },
    xpHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    xpIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    xpTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
    xpTotal: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    xpNext: { fontSize: 12, fontWeight: "800" },
    barTrack: { height: 12, borderRadius: 6, backgroundColor: colors.bg, overflow: "hidden" },
    barFill: { height: "100%", borderRadius: 6 },
    barLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
    barLabelText: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      marginTop: 18,
      marginBottom: 10,
    },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
    statsRowWide: {},
    statCard: { flex: 1, alignItems: "center", padding: 14 },
    statIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 8 },
    statValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
    statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    hintText: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 16, textAlign: "center", paddingHorizontal: 8 },
  });
