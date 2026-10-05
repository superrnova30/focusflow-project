import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";
import { getStreakLevel } from "../lib/streakLevels";

const MEDALS = {
  1: { icon: "trophy", color: "#FFC15E" },
  2: { icon: "medal", color: "#C0C7D4" },
  3: { icon: "medal", color: "#D9935A" },
};

function medalFor(rank) {
  return MEDALS[rank] ? { ...MEDALS[rank], isMedal: true } : { icon: "remove", color: null, isMedal: false };
}

export default function LeaderboardScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const compact = width < 380;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchLeaderboard = useCallback(async () => {
    try {
      setError("");
      const { data } = await client.get("/game/leaderboard", { params: { limit: 20 } });
      setData(data);
    } catch (e) {
      setError("We couldn't update the rankings. Check your connection and try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchLeaderboard();
    }, [fetchLeaderboard])
  );

  const refreshLeaderboard = useCallback(() => {
    setRefreshing(true);
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const formatXp = (value) => Number(value || 0).toLocaleString();

  const renderRankIcon = (rank) => {
    const m = medalFor(rank);
    if (m.isMedal) {
      return (
        <View style={[styles.medalIcon, { backgroundColor: `${m.color}1A` }]}>
          <Ionicons name={m.icon} size={17} color={m.color} />
        </View>
      );
    }
    return <Text style={styles.rankNumber}>{rank}</Text>;
  };

  const openProfile = (item) => {
    if (!item?.id) return;
    navigation.navigate("StudentProfile", { userId: item.id, name: item.name });
  };

  const renderItem = ({ item }) => {
    const isMe = item.isMe;
    const streakLevel = getStreakLevel(item.streakCount || 0);
    return (
      <Pressable
        onPress={() => openProfile(item)}
        accessible
        accessibilityLabel={`Rank ${item.rank}, ${item.name}, ${formatXp(item.xp)} XP, ${item.streakCount || 0} day streak${isMe ? ", you" : ""}`}
        style={({ pressed }) => [
          styles.row,
          isMe && styles.myRow,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.rankCell}>{renderRankIcon(item.rank)}</View>
        <View style={[styles.avatar, isMe && styles.myAvatar]}>
          <Text style={[styles.avatarInitial, isMe && styles.myAvatarInitial]}>
            {(item.name || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.nameCell}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name || "Student"}
          </Text>
          <View style={styles.nameMeta}>
            {isMe && <Text style={styles.youBadge}>YOU</Text>}
            <Ionicons name="flame" size={12} color={streakLevel.color} />
            <Text style={[styles.sub, { color: streakLevel.color }]}>
              {item.streakCount || 0} day · {streakLevel.name}
            </Text>
          </View>
        </View>
        <View style={styles.statsCell}>
          <Text style={styles.xpText}>{formatXp(item.xp)}</Text>
          <Text style={styles.xpLabel}>XP</Text>
        </View>
      </Pressable>
    );
  };

  if (loading && !data) {
    return (
      <Screen>
        <View style={styles.centerLoading}>
          <View style={styles.loadingIcon}>
            <Ionicons name="trophy" size={30} color={colors.amber} />
          </View>
          <ActivityIndicator color={colors.tomato} size="small" />
          <Text style={styles.loadingTitle}>Building the leaderboard</Text>
          <Text style={styles.loadingText}>Gathering the latest student rankings…</Text>
        </View>
      </Screen>
    );
  }

  const leaderboard = data?.leaderboard || [];
  const me = data?.me || {};
  const myStreakLevel = getStreakLevel(me.streakCount || 0);

  return (
    <Screen>
      <FlatList
        data={leaderboard}
        keyExtractor={(item) => `rank-${item.id}`}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshLeaderboard}
            tintColor={colors.tomato}
            colors={[colors.tomato]}
          />
        }
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={27} color={colors.violet} />
              </View>
              <Text style={styles.emptyTitle}>The race starts here</Text>
              <Text style={styles.emptyText}>Earn XP from study sessions and quizzes to claim the first spot.</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <Pressable
                onPress={() => navigation.goBack()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              >
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>WEEKLY RANKINGS</Text>
                <Text style={styles.headerTitle}>Leaderboard</Text>
                <Text style={styles.headerSubtitle}>Learn consistently, earn XP, and climb the ranks.</Text>
              </View>
              <Pressable
                onPress={refreshLeaderboard}
                accessibilityRole="button"
                accessibilityLabel="Refresh leaderboard"
                disabled={refreshing}
                style={({ pressed }) => [styles.refreshBtn, (pressed || refreshing) && styles.pressed]}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={colors.violet} />
                ) : (
                  <Ionicons name="refresh" size={19} color={colors.violet} />
                )}
              </Pressable>
            </View>

            {/* Podium for top 3 */}
            {leaderboard.length > 0 && (
              <View style={styles.podiumPanel}>
                <View style={styles.podiumHeading}>
                  <View>
                    <Text style={styles.podiumEyebrow}>TOP PERFORMERS</Text>
                    <Text style={styles.podiumTitle}>This week’s leaders</Text>
                  </View>
                  <View style={styles.trophyIcon}>
                    <Ionicons name="trophy" size={21} color={colors.amber} />
                  </View>
                </View>

                <View style={styles.podiumRow}>
                  {[1, 0, 2].map((offset) => {
                    const entry = leaderboard[offset];
                    if (!entry) return <View key={`empty-${offset}`} style={styles.podiumPlaceholder} />;
                    const isGold = offset === 0;
                    const medal = medalFor(entry.rank);
                    return (
                      <Pressable
                        key={entry.id}
                        onPress={() => openProfile(entry)}
                        style={({ pressed }) => [styles.podiumCard, isGold && styles.podiumCardGold, pressed && styles.pressed]}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`Position ${entry.rank}, ${entry.name}, ${formatXp(entry.xp)} XP. Open profile.`}
                      >
                        <View style={[styles.podiumRankBadge, isGold && styles.podiumRankBadgeGold]}>
                          <Ionicons name={medal.icon} size={isGold ? 19 : 16} color={medal.color} />
                          <Text style={[styles.podiumRank, isGold && styles.podiumRankGold]}>#{entry.rank}</Text>
                        </View>
                        <View style={[styles.podiumAvatar, isGold && styles.podiumAvatarGold]}>
                          <Text style={[styles.podiumAvatarText, isGold && styles.podiumAvatarTextGold]}>
                            {(entry.name || "?").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.podiumName} numberOfLines={1}>
                          {entry.name || "Student"}
                        </Text>
                        <View style={styles.podiumXp}>
                          <Ionicons name="flash" size={12} color={colors.amber} />
                          <Text style={styles.podiumXpText}>{formatXp(entry.xp)} XP</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* My rank summary */}
            {me && me.rank ? (
              <Pressable
                onPress={() => openProfile({ id: me.id, name: me.name })}
                style={({ pressed }) => [styles.myRankCard, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Your position, rank ${me.rank}. Open your public profile.`}
              >
                <View style={styles.myRankBadge}>
                  <Text style={styles.myRankNumber}>#{me.rank}</Text>
                </View>
                <View style={styles.myRankCopy}>
                  <Text style={styles.myRankLabel}>YOUR POSITION</Text>
                  <Text style={styles.myRankValue}>View your public profile</Text>
                </View>
                <View style={styles.myRankStats}>
                  <View style={styles.myRankStat}>
                    <Ionicons name="flash" size={15} color={colors.amber} />
                    <Text style={styles.myRankXp}>{formatXp(me.xp)} XP</Text>
                  </View>
                  <View style={styles.myRankStat}>
                    <Ionicons name="flame" size={15} color={myStreakLevel.color} />
                    <Text style={[styles.myRankStreakText, { color: myStreakLevel.color }]}>
                      {me.streakCount || 0} days
                    </Text>
                  </View>
                </View>
              </Pressable>
            ) : null}

            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="cloud-offline-outline" size={19} color={colors.tomato} />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={fetchLeaderboard} style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {leaderboard.length > 0 && (
              <View style={styles.listHeading}>
                <View>
                  <Text style={styles.sectionLabel}>ALL RANKINGS</Text>
                  <Text style={styles.sectionTitle}>Top students</Text>
                </View>
                <Text style={styles.studentCount}>{leaderboard.length} students</Text>
              </View>
            )}
          </>
        }
      />
    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    page: {
      width: "100%",
      maxWidth: 980,
      alignSelf: "center",
      paddingTop: SPACING.sm,
      paddingBottom: 56,
    },
    pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
    centerLoading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 30,
    },
    loadingIcon: {
      width: 62,
      height: 62,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.amberSoft,
      marginBottom: 18,
    },
    loadingTitle: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 14 },
    loadingText: { color: colors.textMuted, fontSize: 12.5, textAlign: "center", marginTop: 5 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 9 : 12,
      marginBottom: SPACING.lg,
    },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: {
      color: colors.violet,
      fontSize: 8,
      lineHeight: 11,
      fontWeight: "900",
      letterSpacing: 1,
      marginBottom: 2,
    },
    headerTitle: {
      color: colors.text,
      fontSize: compact ? 24 : isWide ? 32 : 28,
      lineHeight: compact ? 29 : isWide ? 38 : 34,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    headerSubtitle: {
      color: colors.textMuted,
      fontSize: compact ? 11.5 : 12.5,
      lineHeight: 18,
      marginTop: 2,
    },
    backBtn: {
      width: compact ? 39 : 43,
      height: compact ? 39 : 43,
      borderRadius: 13,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    refreshBtn: {
      width: compact ? 39 : 43,
      height: compact ? 39 : 43,
      borderRadius: 13,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    podiumPanel: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? 12 : isWide ? 20 : 15,
      marginBottom: 12,
      shadowColor: "#0F172A",
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    podiumHeading: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    podiumEyebrow: {
      color: colors.amber,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    podiumTitle: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 2 },
    trophyIcon: {
      width: 39,
      height: 39,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.amberSoft,
    },
    podiumRow: { flexDirection: "row", alignItems: "flex-end", gap: compact ? 6 : 9 },
    podiumPlaceholder: { flex: 1 },
    podiumCard: {
      flex: 1,
      minWidth: 0,
      minHeight: compact ? 142 : 154,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingVertical: compact ? 10 : 13,
      paddingHorizontal: compact ? 5 : 8,
      alignItems: "center",
      justifyContent: "center",
    },
    podiumCardGold: {
      minHeight: compact ? 158 : 174,
      backgroundColor: colors.amberSoft,
      borderColor: colors.amber,
    },
    podiumRankBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      minHeight: 23,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 7,
      backgroundColor: colors.surface,
    },
    podiumRankBadgeGold: { backgroundColor: colors.surface },
    podiumRank: { color: colors.textMuted, fontSize: 9.5, fontWeight: "900" },
    podiumRankGold: { color: colors.amber },
    podiumAvatar: {
      width: compact ? 42 : 50,
      height: compact ? 42 : 50,
      borderRadius: compact ? 14 : 16,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 9,
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    podiumAvatarGold: {
      width: compact ? 48 : 58,
      height: compact ? 48 : 58,
      borderRadius: compact ? 16 : 19,
      backgroundColor: colors.surface,
      borderColor: colors.amber,
    },
    podiumAvatarText: { color: colors.violet, fontSize: compact ? 16 : 19, fontWeight: "900" },
    podiumAvatarTextGold: { color: colors.amber, fontSize: compact ? 19 : 22 },
    podiumName: {
      color: colors.text,
      fontSize: compact ? 10.5 : 12,
      fontWeight: "800",
      marginTop: 8,
      maxWidth: "100%",
    },
    podiumXp: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginTop: 5,
    },
    podiumXpText: { color: colors.amber, fontSize: compact ? 9 : 10.5, fontWeight: "900" },
    myRankCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.violet,
      borderRadius: RADIUS.lg,
      padding: compact ? 11 : 14,
      marginBottom: 12,
      gap: compact ? 9 : 12,
    },
    myRankBadge: {
      width: compact ? 42 : 48,
      height: compact ? 42 : 48,
      borderRadius: compact ? 13 : 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violet,
      flexShrink: 0,
    },
    myRankNumber: { color: "#FFFFFF", fontSize: compact ? 14 : 16, fontWeight: "900" },
    myRankCopy: { flex: 1, minWidth: 0 },
    myRankLabel: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
    myRankValue: {
      color: colors.text,
      fontSize: compact ? 11.5 : 13,
      fontWeight: "800",
      marginTop: 3,
    },
    myRankStats: {
      alignItems: "flex-end",
      gap: 5,
      flexShrink: 0,
    },
    myRankStat: { flexDirection: "row", alignItems: "center", gap: 4 },
    myRankXp: { color: colors.text, fontSize: compact ? 10.5 : 12, fontWeight: "900" },
    myRankStreakText: { color: colors.textMuted, fontSize: compact ? 9.5 : 11, fontWeight: "700" },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      padding: 11,
      backgroundColor: colors.tomatoSoft,
      borderRadius: RADIUS.md,
      marginBottom: 12,
    },
    errorText: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 16 },
    retryBtn: { paddingVertical: 6, paddingHorizontal: 9 },
    retryText: { color: colors.tomato, fontSize: 11, fontWeight: "900" },
    listHeading: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginTop: 5,
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    sectionLabel: {
      color: colors.violet,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.9,
      marginBottom: 2,
    },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
    studentCount: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: compact ? 10 : 12,
      paddingHorizontal: compact ? 9 : 12,
      marginBottom: 8,
    },
    myRow: { backgroundColor: colors.violetSoft, borderColor: colors.violet },
    rankCell: { width: compact ? 31 : 36, alignItems: "center", flexShrink: 0 },
    rankNumber: { color: colors.textMuted, fontSize: 13, fontWeight: "900" },
    medalIcon: {
      width: 29,
      height: 29,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    avatar: {
      width: compact ? 38 : 43,
      height: compact ? 38 : 43,
      borderRadius: compact ? 12 : 14,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: compact ? 5 : 8,
      backgroundColor: colors.violetSoft,
      flexShrink: 0,
    },
    myAvatar: { backgroundColor: colors.violet },
    avatarInitial: { color: colors.violet, fontSize: compact ? 14 : 16, fontWeight: "900" },
    myAvatarInitial: { color: "#FFFFFF" },
    nameCell: { flex: 1, marginLeft: compact ? 9 : 12, minWidth: 0 },
    name: { color: colors.text, fontSize: compact ? 12.5 : 14, fontWeight: "800" },
    nameMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
    youBadge: {
      color: colors.violet,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.5,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.pill,
      paddingVertical: 2,
      paddingHorizontal: 5,
      marginRight: 2,
    },
    sub: { color: colors.textMuted, fontSize: compact ? 9 : 10.5, fontWeight: "600" },
    statsCell: { alignItems: "flex-end", marginLeft: 8, flexShrink: 0 },
    xpText: { color: colors.amber, fontSize: compact ? 12 : 14, fontWeight: "900" },
    xpLabel: {
      color: colors.textMuted,
      fontSize: 7.5,
      fontWeight: "900",
      letterSpacing: 0.7,
      marginTop: 1,
    },
    emptyState: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      paddingVertical: 34,
      paddingHorizontal: 24,
      marginTop: 4,
    },
    emptyIcon: {
      width: 54,
      height: 54,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      marginBottom: 12,
    },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
    emptyText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      maxWidth: 360,
      marginTop: 5,
    },
  });
