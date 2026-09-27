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

function formatDuration(total) {
  const minutes = Number(total) || 0;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export default function StatsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const compact = width < 380;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadStats = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/sessions/stats", { timeout: 20000 });
      setStats(data);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "Unable to load your statistics. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  if (loading && !stats) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <Ionicons name="analytics" size={29} color={colors.violet} />
          </View>
          <ActivityIndicator color={colors.violet} />
          <Text style={styles.stateTitle}>Calculating your progress</Text>
          <Text style={styles.stateText}>Bringing your study activity together…</Text>
        </View>
      </Screen>
    );
  }

  if (error && !stats) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <View style={[styles.stateIcon, { backgroundColor: colors.tomatoSoft }]}>
            <Ionicons name="cloud-offline-outline" size={29} color={colors.tomato} />
          </View>
          <Text style={styles.stateTitle}>Statistics unavailable</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable onPress={() => loadStats()} style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const chartData = (stats?.last7Days || []).map((day) => ({
    x: new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
    y: day.minutes,
  }));
  const subjects = Array.isArray(stats?.subjects)
    ? stats.subjects
    : Object.entries(stats?.subjectTotals || {}).map(([name, minutes]) => ({ name, minutes, percentage: 0 }));
  const chartWidth = Math.max(280, Math.min(width - 64, 944));
  const goalProgress = Math.min(100, stats?.dailyGoalProgress || 0);

  const summaryCards = [
    { icon: "time-outline", value: formatDuration(stats?.totalStudyMinutes), label: "Total focus", color: colors.violet, soft: colors.violetSoft },
    { icon: "timer-outline", value: stats?.totalFocusSessions || 0, label: "Focus sessions", color: colors.mint, soft: colors.mintSoft },
    { icon: "calendar-outline", value: formatDuration(stats?.last7Minutes), label: "Last 7 days", color: colors.amber, soft: colors.amberSoft },
    { icon: "flame-outline", value: stats?.streak || 0, label: "Day streak", color: colors.tomato, soft: colors.tomatoSoft },
  ];

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadStats({ refresh: true })}
            tintColor={colors.violet}
            colors={[colors.violet]}
          />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>YOUR PROGRESS</Text>
            <Text style={styles.title}>Study statistics</Text>
            <Text style={styles.subtitle}>See what you’ve accomplished and where to focus next.</Text>
          </View>
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
              <Ionicons name="refresh" size={19} color={colors.violet} />
            )}
          </Pressable>
        </View>

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
              <Text style={styles.goalLabel}>TODAY’S FOCUS GOAL</Text>
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
              ? "Daily goal complete — excellent work!"
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

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>FOCUS TREND</Text>
            <Text style={styles.sectionTitle}>Last 7 days</Text>
          </View>
          <Text style={styles.sectionMeta}>{stats?.activeDaysLast7 || 0}/7 active days</Text>
        </View>
        <View style={styles.chartCard}>
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

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>SUBJECT BREAKDOWN</Text>
            <Text style={styles.sectionTitle}>Where your time goes</Text>
          </View>
        </View>
        <View style={styles.subjectCard}>
          {subjects.length === 0 ? (
            <View style={styles.emptySubject}>
              <View style={styles.emptySubjectIcon}>
                <Ionicons name="book-outline" size={23} color={colors.violet} />
              </View>
              <Text style={styles.emptySubjectTitle}>No subject activity yet</Text>
              <Text style={styles.emptySubjectText}>Choose a subject during a focus session to see your breakdown here.</Text>
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
            <View>
              <Text style={styles.sectionEyebrow}>LEARNING FOOTPRINT</Text>
              <Text style={styles.sectionTitle}>Everything you’ve built</Text>
            </View>
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
    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    page: {
      width: "100%",
      maxWidth: 1008,
      alignSelf: "center",
      paddingTop: SPACING.md,
      paddingBottom: 110,
    },
    pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
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
    header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: SPACING.lg },
    eyebrow: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 2 },
    title: { color: colors.text, fontSize: compact ? 25 : 29, lineHeight: compact ? 31 : 35, fontWeight: "900", letterSpacing: -0.7 },
    subtitle: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4, maxWidth: 560 },
    refreshBtn: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft },
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
    sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 21, marginBottom: 9, paddingHorizontal: 2 },
    sectionEyebrow: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 0.8, marginBottom: 2 },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
    sectionMeta: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
    chartCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.xl, alignItems: "center", overflow: "hidden" },
    performanceGrid: { flexDirection: isWide ? "row" : "column", gap: 9, marginTop: 9 },
    performanceCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 15 },
    performanceIcon: { width: 37, height: 37, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 11 },
    performanceLabel: { color: colors.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
    performanceValue: { color: colors.text, fontSize: 25, fontWeight: "900", marginTop: 3 },
    performanceMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 1 },
    miniTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden", marginTop: 12 },
    miniFill: { height: "100%", borderRadius: 3 },
    subjectCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, paddingHorizontal: 15 },
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
    footprintCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.xl, padding: 16, marginTop: 20 },
    footprintHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 15 },
    levelBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.violetSoft, borderRadius: RADIUS.pill, paddingVertical: 7, paddingHorizontal: 10 },
    levelText: { color: colors.violet, fontSize: 10.5, fontWeight: "900" },
    footprintGrid: { flexDirection: "row", gap: compact ? 5 : 8 },
    footprintItem: { flex: 1, alignItems: "center", backgroundColor: colors.bg, borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 4 },
    footprintValue: { color: colors.text, fontSize: compact ? 14 : 17, fontWeight: "900", marginTop: 5 },
    footprintLabel: { color: colors.textMuted, fontSize: compact ? 8.5 : 10, fontWeight: "700", marginTop: 1 },
  });
