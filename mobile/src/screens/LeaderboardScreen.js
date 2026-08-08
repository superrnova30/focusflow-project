import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

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
  const styles = useStyles(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= 700;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data } = await client.get("/game/leaderboard", { params: { limit: 20 } });
      setData(data);
    } catch (e) {
      // Non-fatal; keep previous data.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchLeaderboard();
    }, [fetchLeaderboard])
  );

  const renderRankIcon = (rank) => {
    const m = medalFor(rank);
    if (m.isMedal) {
      return <Ionicons name={m.icon} size={22} color={m.color} />;
    }
    return (
      <Text style={[styles.rankNumber, { color: colors.textMuted }]}>{rank}</Text>
    );
  };

  const renderItem = ({ item, index }) => {
    const isMe = item.isMe;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: isMe ? colors.tomatoSoft : colors.surface, borderColor: colors.border },
          isMe && { borderColor: colors.tomato },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.rankCell}>{renderRankIcon(item.rank)}</View>
        <View style={[styles.avatar, { backgroundColor: isMe ? colors.tomato : colors.violetSoft }]}>
          <Text style={[styles.avatarInitial, { color: isMe ? colors.tomato : colors.violet }]}>
            {(item.name || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.nameCell}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {item.isMe ? "You" : `Rank ${item.rank}`}
          </Text>
        </View>
        <View style={styles.statsCell}>
          <View style={[styles.xpBadge, { backgroundColor: colors.amberSoft }]}>
            <Ionicons name="flash" size={13} color={colors.amber} />
            <Text style={[styles.xpText, { color: colors.amber }]}>{item.xp}</Text>
          </View>
          <View style={styles.streakCell}>
            <Ionicons name="flame" size={13} color={colors.tomato} />
            <Text style={[styles.streakText, { color: colors.textMuted }]}>{item.streakCount || 0}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading && !data) {
    return (
      <Screen>
        <View style={styles.centerLoading}>
          <ActivityIndicator color={colors.tomato} size="large" />
          <Text style={styles.loadingText}>Loading leaderboard…</Text>
        </View>
      </Screen>
    );
  }

  const leaderboard = data?.leaderboard || [];
  const me = data?.me || {};

  return (
    <Screen>
      <FlatList
        data={leaderboard}
        keyExtractor={(item) => `rank-${item.id}`}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.headerTitle}>Leaderboard</Text>
                <Text style={styles.headerSubtitle}>Top students by XP</Text>
              </View>
              <Pressable
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [styles.closeBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            {/* Podium for top 3 */}
            {leaderboard.length > 0 && (
              <View style={styles.podiumRow}>
                {[1, 0, 2].map((offset) => {
                  const entry = leaderboard[offset];
                  if (!entry) return null;
                  const isGold = offset === 0;
                  return (
                    <Pressable
                      key={entry.id}
                      style={[
                        styles.podiumCard,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                        isGold && { borderColor: colors.amber },
                        isWide && styles.podiumCardWide,
                      ]}
                    >
                      <Ionicons name="trophy" size={26} color={isGold ? colors.amber : colors.textMuted} />
                      <Text style={[styles.podiumRank, { color: colors.textMuted }]}>#{entry.rank}</Text>
                      <View style={[styles.podiumAvatar, { backgroundColor: isGold ? colors.amberSoft : colors.violetSoft }]}>
                        <Text style={[styles.podiumAvatarText, { color: isGold ? colors.amber : colors.violet }]}>
                          {(entry.name || "?").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>
                        {entry.name}
                      </Text>
                      <View style={[styles.podiumXp, { backgroundColor: colors.amberSoft }]}>
                        <Ionicons name="flash" size={12} color={colors.amber} />
                        <Text style={[styles.podiumXpText, { color: colors.amber }]}>{entry.xp}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* My rank summary */}
            {me && me.rank ? (
              <Card style={[styles.myRankCard, { borderColor: colors.tomato, backgroundColor: colors.tomatoSoft }]}>
                <View style={styles.myRankLeft}>
                  <Ionicons name="person-circle" size={28} color={colors.tomato} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.myRankLabel, { color: colors.textMuted }]}>YOUR RANK</Text>
                    <Text style={[styles.myRankValue, { color: colors.text }]}>
                      #{me.rank} <Text style={[styles.myRankXp, { color: colors.tomato }]}>{me.xp} XP</Text>
                    </Text>
                  </View>
                </View>
                <View style={styles.myRankStreak}>
                  <Ionicons name="flame" size={18} color={colors.tomato} />
                  <Text style={[styles.myRankStreakText, { color: colors.text }]}>{me.streakCount || 0}</Text>
                </View>
              </Card>
            ) : null}

            <Text style={styles.sectionLabel}>TOP STUDENTS</Text>
          </>
        }
      />
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
      marginTop: 8,
      marginBottom: 16,
    },
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
    podiumRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
    podiumCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 8,
      alignItems: "center",
    },
    podiumCardWide: { maxWidth: 220 },
    podiumRank: { fontSize: 11, fontWeight: "700", marginTop: 4 },
    podiumAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    podiumAvatarText: { fontSize: 18, fontWeight: "800" },
    podiumName: { fontSize: 12, fontWeight: "700", marginTop: 8, maxWidth: "100%" },
    podiumXp: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 10,
      marginTop: 8,
    },
    podiumXpText: { fontSize: 11, fontWeight: "800" },
    myRankCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      marginBottom: 6,
    },
    myRankLeft: { flexDirection: "row", alignItems: "center" },
    myRankLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
    myRankValue: { fontSize: 16, fontWeight: "800", marginTop: 2 },
    myRankXp: { fontSize: 13, fontWeight: "700" },
    myRankStreak: { flexDirection: "row", alignItems: "center", gap: 4 },
    myRankStreakText: { fontSize: 16, fontWeight: "800" },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      marginTop: 8,
      marginBottom: 10,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    rankCell: { width: 34, alignItems: "center" },
    rankNumber: { fontSize: 15, fontWeight: "800" },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
    },
    avatarInitial: { fontSize: 16, fontWeight: "800" },
    nameCell: { flex: 1, marginLeft: 12 },
    name: { fontSize: 14, fontWeight: "700" },
    sub: { fontSize: 11, marginTop: 2 },
    statsCell: { alignItems: "flex-end", gap: 6 },
    xpBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    xpText: { fontSize: 12, fontWeight: "800" },
    streakCell: { flexDirection: "row", alignItems: "center", gap: 3 },
    streakText: { fontSize: 12, fontWeight: "700" },
  });
