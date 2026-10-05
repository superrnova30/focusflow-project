import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { VictoryChart, VictoryLine, VictoryAxis } from "victory-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";
import { getStreakLevel } from "../lib/streakLevels";
import HeaderWallet from "../components/HeaderWallet";
import NotificationBell from "../components/NotificationBell";

function formatDuration(total) {
  const minutes = Number(total) || 0;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export default function StatsScreen({ embedded = false, userId = null, subjectName = "" }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const compact = width < 380;
  const viewOnly = Boolean(userId);
  const displayName = subjectName?.trim() || "Student";
  const styles = useMemo(() => createStyles(colors, isWide, compact, embedded), [colors, isWide, compact, embedded]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadStats = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const path = viewOnly ? `/students/${userId}/stats` : "/sessions/stats";
      const { data } = await client.get(path, { timeout: 20000 });
      setStats(data);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error
          || (viewOnly ? "Unable to load this student's statistics." : "Unable to load your statistics. Please try again.")
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, viewOnly]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const Frame = embedded ? View : Screen;

  if (loading && !stats) {
    return (
      <Frame>
        <View style={[styles.centerState, embedded && styles.centerStateEmbedded]}>
          <View style={styles.stateIcon}>
            <Ionicons name="analytics" size={29} color={colors.violet} />
          </View>
          <ActivityIndicator color={colors.violet} />
          <Text style={styles.stateTitle}>
            {viewOnly ? `Loading ${displayName}'s stats` : "Calculating your progress"}
          </Text>
          <Text style={styles.stateText}>Bringing study activity together…</Text>
        </View>
      </Frame>
    );
  }

  if (error && !stats) {
    return (
      <Frame>
        <View style={[styles.centerState, embedded && styles.centerStateEmbedded]}>
          <View style={[styles.stateIcon, { backgroundColor: colors.tomatoSoft }]}>
            <Ionicons name="cloud-offline-outline" size={29} color={colors.tomato} />
          </View>
          <Text style={styles.stateTitle}>Statistics unavailable</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable onPress={() => loadStats()} style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Frame>
    );
  }

  const chartData = (stats?.last7Days || []).map((day) => ({
    x: new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
    y: day.minutes,
  }));
  const subjects = Array.isArray(stats?.subjects)
    ? stats.subjects
    : Object.entries(stats?.subjectTotals || {}).map(([name, minutes]) => ({ name, minutes, percentage: 0 }));
  const chartWidth = Math.max(
    260,
    Math.min(width - (embedded ? 56 : 64), embedded ? 664 : 944)
  );
  const goalProgress = Math.min(100, stats?.dailyGoalProgress || 0);
  const streakLevel = getStreakLevel(stats?.streak || 0);

  const summaryCards = [
    { icon: "time-outline", value: formatDuration(stats?.totalStudyMinutes), label: "Total focus", color: colors.violet, soft: colors.violetSoft },
    { icon: "timer-outline", value: stats?.totalFocusSessions || 0, label: "Focus sessions", color: colors.mint, soft: colors.mintSoft },
    { icon: "calendar-outline", value: formatDuration(stats?.last7Minutes), label: "Last 7 days", color: colors.amber, soft: colors.amberSoft },
    { icon: "flame-outline", value: stats?.streak || 0, label: `${streakLevel.name} streak`, color: streakLevel.color, soft: streakLevel.softColor },
  ];

  return (
    <Frame>
      <ScrollView
        style={embedded ? undefined : styles.scrollView}
        showsVerticalScrollIndicator={!embedded}
        bounces={!embedded}
        nestedScrollEnabled
        scrollEnabled={!embedded}
        overScrollMode="never"
        contentContainerStyle={[styles.page, embedded && styles.pageEmbedded]}
        refreshControl={
          embedded ? undefined : (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadStats({ refresh: true })}
            tintColor={colors.violet}
            colors={[colors.violet]}
          />
          )
        }
      >
        {embedded ? null : (
        <View style={styles.header}>
          <HeaderWallet compact={compact} />
          <View style={styles.headerActions}>
            <NotificationBell />
            <Pressable
              onPress={() => loadStats({ refresh: true })}
              disabled={refreshing}
              accessibilityRole="button"
              accessibilityLabel="Refresh statistics"
              style={({ pressed }) => [styles.refreshBtn, (pressed || refreshing) && styles.pressed]}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.violet} />
              ) : (
                <Ionicons name="refresh" size={18} color={colors.violet} />
              )}
            </Pressable>
          </View>
        </View>
        )}

        {viewOnly ? (
          <View style={styles.viewOnlyBanner}>
            <View style={[styles.viewOnlyIcon, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name="eye-outline" size={16} color={colors.violet} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.viewOnlyTitle} numberOfLines={1}>{displayName}'s stats</Text>
              <Text style={styles.viewOnlyCopy}>View-only · study progress shared on their profile</Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.warning}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.tomato} />
            <Text style={styles.warningText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.goalCard}>
          <View style={styles.goalTop}>
            <View style={styles.goalIcon}>
              <Ionicons name="flag" size={21} color={colors.violet} />
            </View>
            <View style={styles.goalCopy}>
              <Text style={styles.goalLabel}>{viewOnly ? "TODAY'S FOCUS" : "TODAY’S FOCUS GOAL"}</Text>
              <Text style={styles.goalValue}>
                {formatDuration(stats?.todayMinutes)} <Text style={styles.goalTarget}>of {formatDuration(stats?.dailyGoalMinutes)}</Text>
              </Text>
            </View>
            <Text style={styles.goalPercent}>{goalProgress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${goalProgress}%` }]} />
          </View>
          <Text style={styles.goalHint}>
            {goalProgress >= 100
              ? (viewOnly ? "Daily goal complete for today." : "Daily goal complete — excellent work!")
              : viewOnly
                ? `${formatDuration(Math.max(0, (stats?.dailyGoalMinutes || 0) - (stats?.todayMinutes || 0)))} left to reach today's goal`
                : `${formatDuration(Math.max(0, (stats?.dailyGoalMinutes || 0) - (stats?.todayMinutes || 0)))} left to reach today’s goal`}
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          {summaryCards.map((card) => (
            <View key={card.label} style={styles.summaryCard}>
              <View style={[styles.summaryIcon, { backgroundColor: card.soft }]}>
                <Ionicons name={card.icon} size={18} color={card.color} />
              </View>
              <Text style={styles.summaryValue}>{card.value}</Text>
              <Text style={styles.summaryLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.chartCard}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Last 7 days</Text>
            <Text style={styles.cardMeta}>{stats?.activeDaysLast7 || 0}/7 active days</Text>
          </View>
          <VictoryChart
            width={chartWidth}
            height={220}
            padding={{ left: 45, right: 22, top: 18, bottom: 34 }}
            domainPadding={{ y: 12 }}
          >
            <VictoryAxis
              style={{
                tickLabels: { fill: colors.textMuted, fontSize: 10, fontWeight: "600" },
                axis: { stroke: colors.border },
                grid: { stroke: "none" },
                ticks: { stroke: "transparent" },
              }}
            />
            <VictoryAxis
              dependentAxis
              tickFormat={(value) => `${value}m`}
              style={{
                tickLabels: { fill: colors.textMuted, fontSize: 9 },
                axis: { stroke: "transparent" },
                grid: { stroke: colors.border, strokeDasharray: "4,5" },
                ticks: { stroke: "transparent" },
              }}
            />
            <VictoryLine
              interpolation="monotoneX"
              data={chartData}
              style={{ data: { stroke: colors.violet, strokeWidth: 3 } }}
            />
          </VictoryChart>
        </View>

        <View style={styles.performanceGrid}>
          <View style={styles.performanceCard}>
            <View style={[styles.performanceIcon, { backgroundColor: colors.mintSoft }]}>
              <Ionicons name="checkmark-done" size={20} color={colors.mint} />
            </View>
            <Text style={styles.performanceLabel}>TASK COMPLETION</Text>
            <Text style={styles.performanceValue}>{stats?.completionRate || 0}%</Text>
            <Text style={styles.performanceMeta}>
              {stats?.completedTasks || 0} of {stats?.totalTasks || 0} tasks completed
            </Text>
            <View style={styles.miniTrack}>
              <View style={[styles.miniFill, { width: `${stats?.completionRate || 0}%`, backgroundColor: colors.mint }]} />
            </View>
          </View>

          <View style={styles.performanceCard}>
            <View style={[styles.performanceIcon, { backgroundColor: colors.amberSoft }]}>
              <Ionicons name="trophy" size={20} color={colors.amber} />
            </View>
            <Text style={styles.performanceLabel}>QUIZ PERFORMANCE</Text>
            <Text style={styles.performanceValue}>{stats?.averageQuizScore || 0}%</Text>
            <Text style={styles.performanceMeta}>{stats?.quizzesTaken || 0} quiz attempts</Text>
            <View style={styles.miniTrack}>
              <View style={[styles.miniFill, { width: `${stats?.averageQuizScore || 0}%`, backgroundColor: colors.amber }]} />
            </View>
          </View>
        </View>

        <View style={styles.subjectCard}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Where your time goes</Text>
          </View>
          {subjects.length === 0 ? (
            <View style={styles.emptySubject}>
              <View style={styles.emptySubjectIcon}>
                <Ionicons name="book-outline" size={23} color={colors.violet} />
              </View>
              <Text style={styles.emptySubjectTitle}>No subject activity yet</Text>
              <Text style={styles.emptySubjectText}>
                {viewOnly
                  ? "Subject breakdown will appear here once they log focus time."
                  : "Choose a subject during a focus session to see your breakdown here."}
              </Text>
            </View>
          ) : (
            subjects.map((subject, index) => {
              const percentage = subject.percentage || (
                stats?.totalStudyMinutes ? Math.round((subject.minutes / stats.totalStudyMinutes) * 100) : 0
              );
              return (
                <View key={subject.id || subject.name} style={[styles.subjectRow, index === subjects.length - 1 && styles.subjectRowLast]}>
                  <View style={styles.subjectTop}>
                    <Text style={styles.subjectName} numberOfLines={1}>{subject.name}</Text>
                    <Text style={styles.subjectMinutes}>{formatDuration(subject.minutes)} · {percentage}%</Text>
                  </View>
                  <View style={styles.subjectTrack}>
                    <View style={[styles.subjectFill, { width: `${Math.min(100, percentage)}%` }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.footprintCard}>
          <View style={styles.footprintHeader}>
            <Text style={styles.cardTitle}>{viewOnly ? "Study footprint" : "Everything you’ve built"}</Text>
            <View style={styles.levelBadge}>
              <Ionicons name="shield-checkmark" size={14} color={colors.violet} />
              <Text style={styles.levelText}>Level {stats?.level || 1}</Text>
            </View>
          </View>
          <View style={styles.footprintGrid}>
            {[
              ["flash", stats?.xp || 0, "XP"],
              ["albums-outline", stats?.flashcards || 0, "Cards"],
              ["document-text-outline", stats?.notes || 0, "Notes"],
              ["chatbubbles-outline", stats?.aiConversations || 0, "AI chats"],
            ].map(([icon, value, label]) => (
              <View key={label} style={styles.footprintItem}>
                <Ionicons name={icon} size={17} color={colors.violet} />
                <Text style={styles.footprintValue}>{value}</Text>
                <Text style={styles.footprintLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </Frame>
  );
}

const createStyles = (colors, isWide, compact, embedded) =>
  StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    page: {
      width: "100%",
      maxWidth: embedded ? "100%" : 1008,
      alignSelf: "center",
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
    },
    pageEmbedded: {
      paddingTop: 0,
      paddingBottom: 4,
      gap: 0,
    },
    viewOnlyBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    viewOnlyIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    viewOnlyTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
    viewOnlyCopy: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
    pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
    centerStateEmbedded: { flex: 0, paddingVertical: 28, minHeight: 160 },
    stateIcon: {
      width: 62,
      height: 62,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      marginBottom: 16,
    },
    stateTitle: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 13, textAlign: "center" },
    stateText: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 5, textAlign: "center", maxWidth: 340 },
    retryBtn: { backgroundColor: colors.tomato, borderRadius: RADIUS.md, paddingVertical: 11, paddingHorizontal: 20, marginTop: 18 },
    retryText: { color: "#fff", fontSize: 12.5, fontWeight: "900" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 12,
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
    refreshBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
    },
    warning: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.tomatoSoft, borderRadius: RADIUS.md, padding: 11, marginBottom: 12 },
    warningText: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 16 },
    goalCard: {
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.violet,
      borderRadius: RADIUS.xl,
      padding: compact ? 14 : 18,
      marginBottom: 12,
    },
    goalTop: { flexDirection: "row", alignItems: "center", gap: 11 },
    goalIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    goalCopy: { flex: 1, minWidth: 0 },
    goalLabel: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
    goalValue: { color: colors.text, fontSize: compact ? 19 : 23, fontWeight: "900", marginTop: 2 },
    goalTarget: { color: colors.textMuted, fontSize: compact ? 11 : 13, fontWeight: "700" },
    goalPercent: { color: colors.violet, fontSize: compact ? 17 : 20, fontWeight: "900" },
    progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: "hidden", marginTop: 14 },
    progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.violet },
    goalHint: { color: colors.textMuted, fontSize: 10.5, fontWeight: "600", marginTop: 8 },
    summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    summaryCard: {
      flexBasis: isWide ? "23%" : "47%",
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: compact ? 11 : 14,
    },
    summaryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 9 },
    summaryValue: { color: colors.text, fontSize: compact ? 17 : 20, fontWeight: "900" },
    summaryLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginTop: 2 },
    cardHead: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 4,
    },
    cardTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: compact ? 15 : 16, fontWeight: "800" },
    cardMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    chartCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      alignItems: "center",
      overflow: "hidden",
      marginTop: 12,
      paddingTop: compact ? 12 : 14,
      paddingHorizontal: compact ? 12 : 14,
    },
    performanceGrid: { flexDirection: isWide ? "row" : "column", gap: 9, marginTop: 10 },
    performanceCard: {
      flexGrow: isWide ? 1 : 0,
      flexShrink: isWide ? 1 : 0,
      flexBasis: isWide ? 0 : "auto",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: 15,
    },
    performanceIcon: { width: 37, height: 37, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 11 },
    performanceLabel: { color: colors.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
    performanceValue: { color: colors.text, fontSize: 25, fontWeight: "900", marginTop: 3 },
    performanceMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 1 },
    miniTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden", marginTop: 12 },
    miniFill: { height: "100%", borderRadius: 3 },
    subjectCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 15,
      paddingTop: compact ? 12 : 14,
      marginTop: 10,
    },
    subjectRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    subjectRowLast: { borderBottomWidth: 0 },
    subjectTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    subjectName: { flex: 1, color: colors.text, fontSize: 12.5, fontWeight: "800" },
    subjectMinutes: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
    subjectTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden", marginTop: 9 },
    subjectFill: { height: "100%", borderRadius: 3, backgroundColor: colors.violet },
    emptySubject: { alignItems: "center", paddingVertical: 27, paddingHorizontal: 16 },
    emptySubjectIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft },
    emptySubjectTitle: { color: colors.text, fontSize: 13.5, fontWeight: "900", marginTop: 10 },
    emptySubjectText: { color: colors.textMuted, fontSize: 11.5, lineHeight: 17, textAlign: "center", marginTop: 4, maxWidth: 340 },
    footprintCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.xl, padding: 16, marginTop: 10 },
    footprintHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
    levelBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.violetSoft, borderRadius: RADIUS.pill, paddingVertical: 7, paddingHorizontal: 10 },
    levelText: { color: colors.violet, fontSize: 10.5, fontWeight: "900" },
    footprintGrid: { flexDirection: "row", gap: compact ? 5 : 8 },
    footprintItem: { flex: 1, alignItems: "center", backgroundColor: colors.bg, borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 4 },
    footprintValue: { color: colors.text, fontSize: compact ? 14 : 17, fontWeight: "900", marginTop: 5 },
    footprintLabel: { color: colors.textMuted, fontSize: compact ? 8.5 : 10, fontWeight: "700", marginTop: 1 },
  });
