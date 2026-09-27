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
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

function formatDuration(total) {
  const minutes = Number(total) || 0;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export default function AdminDashboardScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 980;
  const isTablet = width >= 640;
  const isPhone = width < 600;
  const compact = width < 390;
  const styles = useMemo(
    () => createStyles(colors, isDesktop, isTablet, isPhone, compact),
    [colors, isDesktop, isTablet, isPhone, compact]
  );
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/admin/analytics");
      setAnalytics(data.analytics ?? data);
    } catch (e) {
      setError(e?.response?.data?.error || "Unable to load platform analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAnalytics();
    }, [fetchAnalytics])
  );

  if (loading && !analytics) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <Ionicons name="pulse" size={29} color={colors.violet} />
          </View>
          <ActivityIndicator size="small" color={colors.violet} />
          <Text style={styles.stateTitle}>Preparing the overview</Text>
          <Text style={styles.stateText}>Collecting the latest student and platform activity…</Text>
        </View>
      </Screen>
    );
  }

  if (error && !analytics) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <View style={[styles.stateIcon, { backgroundColor: colors.tomatoSoft }]}>
            <Ionicons name="cloud-offline-outline" size={29} color={colors.tomato} />
          </View>
          <Text style={styles.stateTitle}>Overview unavailable</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable onPress={() => fetchAnalytics()} style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const activeRate = analytics?.totalUsers
    ? Math.round(((analytics.activeUsers || 0) / analytics.totalUsers) * 100)
    : 0;
  const weeklyTrend = Array.isArray(analytics?.last7Days) ? analytics.last7Days : [];
  const weeklyMax = Math.max(1, ...weeklyTrend.map((day) => Number(day.minutes) || 0));
  const weeklyMinutes = weeklyTrend.reduce((sum, day) => sum + (Number(day.minutes) || 0), 0);
  const activeUsers = Array.isArray(analytics?.mostActiveUsers) ? analytics.mostActiveUsers : [];

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchAnalytics({ refresh: true })}
            tintColor={colors.violet}
            colors={[colors.violet]}
          />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>ADMIN WORKSPACE</Text>
            <Text style={styles.title}>Platform overview</Text>
            <Text style={styles.subtitle}>Monitor student engagement, learning activity, and system health.</Text>
          </View>
          <Pressable
            onPress={() => fetchAnalytics({ refresh: true })}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh analytics"
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

        <View style={styles.summaryCard}>
          <View style={styles.simpleCardHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>AT A GLANCE</Text>
              <Text style={styles.sectionTitle}>Platform summary</Text>
            </View>
            <View style={styles.activeRateBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.activeRateText}>{activeRate}% active</Text>
            </View>
          </View>
          <View style={styles.summaryGrid}>
            {[
              ["Students", analytics?.students || 0, "school-outline", colors.violet],
              ["Active accounts", analytics?.activeUsers || 0, "checkmark-circle-outline", colors.mint],
              ["Focus sessions", analytics?.totalFocusSessions ?? analytics?.totalSessions ?? 0, "timer-outline", colors.amber],
              ["Total study time", formatDuration(analytics?.totalStudyMinutes), "time-outline", colors.tomato],
            ].map(([label, value, icon, color], index) => (
              <View key={label} style={[styles.summaryItem, index < 3 && styles.summaryItemBorder]}>
                <Ionicons name={icon} size={17} color={color} />
                <Text style={styles.summaryValue}>{value}</Text>
                <Text style={styles.summaryLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.simpleCardHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>LAST 7 DAYS</Text>
              <Text style={styles.sectionTitle}>Focus activity</Text>
            </View>
            <View style={styles.weekTotal}>
              <Text style={styles.weekTotalValue}>{formatDuration(weeklyMinutes)}</Text>
              <Text style={styles.weekTotalLabel}>combined</Text>
            </View>
          </View>
          {weeklyTrend.length > 0 ? (
            <View style={styles.chart}>
              {weeklyTrend.map((day) => {
                const minutes = Number(day.minutes) || 0;
                const height = minutes ? Math.max(7, Math.round((minutes / weeklyMax) * 100)) : 2;
                return (
                  <View key={day.date} style={styles.chartColumn}>
                    <Text style={styles.chartValue}>{minutes ? formatDuration(minutes) : "—"}</Text>
                    <View style={styles.chartTrack}>
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height: `${height}%`,
                            backgroundColor: minutes ? colors.violet : colors.border,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.chartDay}>
                      {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: compact ? "narrow" : "short" })}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.chartEmpty}>
              <Ionicons name="bar-chart-outline" size={25} color={colors.textMuted} />
              <Text style={styles.chartEmptyText}>No focus activity recorded yet.</Text>
            </View>
          )}
        </View>

        <View style={styles.simpleGrid}>
          <View style={styles.rankingCard}>
            <View style={styles.simpleCardHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>STUDENTS</Text>
                <Text style={styles.sectionTitle}>Most active</Text>
              </View>
              <Ionicons name="trophy-outline" size={20} color={colors.amber} />
            </View>
            {activeUsers.length > 0 ? (
              activeUsers.map((student, index) => (
                <View
                  key={`${student.name}-${index}`}
                  style={[styles.rankingRow, index === activeUsers.length - 1 && styles.rankingRowLast]}
                >
                  <View style={[styles.rankBadge, index === 0 && styles.rankBadgeFirst]}>
                    <Text style={[styles.rankText, index === 0 && styles.rankTextFirst]}>#{index + 1}</Text>
                  </View>
                  <View style={styles.studentCopy}>
                    <Text style={styles.studentName} numberOfLines={1}>{student.name || "Student"}</Text>
                    <Text style={styles.studentMeta}>Focus time</Text>
                  </View>
                  <Text style={styles.studentMinutes}>{formatDuration(student.minutes)}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyRanking}>
                <View style={styles.emptyRankingIcon}>
                  <Ionicons name="people-outline" size={22} color={colors.violet} />
                </View>
                <View style={styles.emptyRankingCopy}>
                  <Text style={styles.emptyRankingTitle}>No activity yet</Text>
                  <Text style={styles.emptyRankingText}>Student focus sessions will appear here.</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.learningCard}>
            <View style={styles.simpleCardHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>LEARNING</Text>
                <Text style={styles.sectionTitle}>Performance snapshot</Text>
              </View>
              <Ionicons name="analytics-outline" size={20} color={colors.violet} />
            </View>
            {[
              ["Task completion", analytics?.taskCompletionRate ?? analytics?.completionRate ?? 0, colors.mint],
              ["Average quiz score", analytics?.averageQuizScore || 0, colors.amber],
            ].map(([label, value, color]) => (
              <View key={label} style={styles.metricRow}>
                <View style={styles.metricTop}>
                  <Text style={styles.metricLabel}>{label}</Text>
                  <Text style={styles.metricValue}>{value}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, value)}%`, backgroundColor: color }]} />
                </View>
              </View>
            ))}
            <View style={styles.contentSummary}>
              {[
                ["Materials", analytics?.totalMaterials || 0],
                ["Quizzes", analytics?.totalQuizzes || 0],
                ["Tasks done", analytics?.totalCompletedTasks || 0],
              ].map(([label, value]) => (
                <View key={label} style={styles.contentItem}>
                  <Text style={styles.contentValue}>{value}</Text>
                  <Text style={styles.contentLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, isDesktop, isTablet, isPhone, compact) =>
  StyleSheet.create({
    page: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingTop: SPACING.md, paddingBottom: 100 },
    pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
    stateIcon: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft, marginBottom: 16 },
    stateTitle: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 13, textAlign: "center" },
    stateText: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 5, textAlign: "center", maxWidth: 340 },
    retryBtn: { backgroundColor: colors.tomato, borderRadius: RADIUS.md, paddingVertical: 11, paddingHorizontal: 20, marginTop: 18 },
    retryText: { color: "#fff", fontSize: 12.5, fontWeight: "900" },
    header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: SPACING.lg },
    eyebrow: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
    title: { color: colors.text, fontSize: compact ? 25 : 30, lineHeight: compact ? 31 : 36, fontWeight: "900", letterSpacing: -0.7 },
    subtitle: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4, maxWidth: 600 },
    refreshBtn: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft, flexShrink: 0 },
    warning: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.tomatoSoft, borderRadius: RADIUS.md, padding: 11, marginBottom: 12 },
    warningText: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 16 },
    summaryCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? 13 : 17,
      marginBottom: 12,
    },
    simpleCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 15,
    },
    summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: isDesktop ? 0 : 8 },
    summaryItem: {
      flexBasis: isDesktop ? "25%" : "47%",
      flexGrow: 1,
      minWidth: 0,
      paddingVertical: compact ? 10 : 12,
      paddingHorizontal: compact ? 8 : 13,
      backgroundColor: isDesktop ? "transparent" : colors.bg,
      borderRadius: isDesktop ? 0 : RADIUS.md,
    },
    summaryItemBorder: {
      borderRightWidth: isDesktop ? 1 : 0,
      borderRightColor: colors.border,
    },
    summaryValue: { color: colors.text, fontSize: compact ? 17 : 20, fontWeight: "900", marginTop: 7 },
    summaryLabel: { color: colors.textMuted, fontSize: compact ? 9 : 10.5, fontWeight: "700", marginTop: 2 },
    simpleGrid: {
      flexDirection: isTablet ? "row" : "column",
      alignItems: "stretch",
      gap: 12,
      marginTop: 12,
    },
    learningCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: compact ? 13 : 16,
    },
    metricRow: { marginBottom: 15 },
    metricTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    metricLabel: { color: colors.text, fontSize: 11.5, fontWeight: "700" },
    metricValue: { color: colors.text, fontSize: 13, fontWeight: "900" },
    contentSummary: {
      flexDirection: "row",
      gap: 7,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 13,
    },
    contentItem: {
      flex: 1,
      alignItems: "center",
      backgroundColor: colors.bg,
      borderRadius: RADIUS.md,
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    contentValue: { color: colors.text, fontSize: 15, fontWeight: "900" },
    contentLabel: { color: colors.textMuted, fontSize: compact ? 8 : 9.5, fontWeight: "700", marginTop: 2 },
    quickActions: { flexDirection: "row", gap: 8, marginBottom: 10 },
    quickAction: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 5 : 7,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingVertical: 8,
      paddingHorizontal: compact ? 7 : 9,
    },
    quickActionIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    quickActionText: { flex: 1, color: colors.text, fontSize: 10.5, fontWeight: "800" },
    heroGrid: { flexDirection: isTablet ? "row" : "column", alignItems: "stretch", gap: 10 },
    mobileHeroCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 8 : 11,
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.violet,
      borderRadius: RADIUS.lg,
      padding: compact ? 11 : 13,
    },
    mobileHeroIcon: {
      width: compact ? 38 : 42,
      height: compact ? 38 : 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      flexShrink: 0,
    },
    mobileHeroStat: { flex: 1, minWidth: 0 },
    mobileHeroValue: { color: colors.text, fontSize: compact ? 18 : 21, fontWeight: "900" },
    mobileHeroLabel: { color: colors.textMuted, fontSize: compact ? 8.5 : 9.5, fontWeight: "700", marginTop: 1 },
    mobileHeroDivider: { width: 1, height: 34, backgroundColor: colors.border },
    heroCard: {
      width: isTablet ? 240 : "100%",
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.violet,
      borderRadius: RADIUS.xl,
      padding: compact ? 15 : 18,
    },
    heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heroIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surface, borderRadius: RADIUS.pill, paddingVertical: 5, paddingHorizontal: 8 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.mint },
    liveText: { color: colors.mint, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
    heroValue: { color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 18 },
    heroLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 1 },
    heroDivider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
    heroFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    heroFooterValue: { color: colors.text, fontSize: 17, fontWeight: "900" },
    heroFooterLabel: { color: colors.textMuted, fontSize: 9.5, fontWeight: "600", marginTop: 1 },
    activeRateBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.mintSoft, borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 8 },
    activeRateText: { color: colors.mint, fontSize: 9.5, fontWeight: "900" },
    kpiGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 },
    kpiCard: {
      flexBasis: isDesktop ? "31%" : "47%",
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: compact ? 11 : 13,
      minWidth: 0,
    },
    kpiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
    kpiValue: { color: colors.text, fontSize: compact ? 17 : 20, fontWeight: "900" },
    kpiLabel: { color: colors.textMuted, fontSize: compact ? 9.5 : 10.5, fontWeight: "700", marginTop: 2 },
    dashboardGrid: { flexDirection: isDesktop ? "row" : "column", alignItems: "flex-start", gap: 16, marginTop: 5 },
    mainColumn: { flex: 1.6, width: isDesktop ? undefined : "100%", minWidth: 0 },
    sideColumn: { flex: 1, width: isDesktop ? undefined : "100%", minWidth: 0 },
    sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: isPhone ? 15 : 20, marginBottom: 9, paddingHorizontal: 2 },
    sectionEyebrow: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 0.8, marginBottom: 2 },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
    weekTotal: { alignItems: "flex-end" },
    weekTotalValue: { color: colors.text, fontSize: 14, fontWeight: "900" },
    weekTotalLabel: { color: colors.textMuted, fontSize: 8.5, fontWeight: "600" },
    chartCard: { minHeight: 210, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.xl, padding: compact ? 12 : 17 },
    chart: { height: 174, flexDirection: "row", alignItems: "flex-end", gap: compact ? 5 : 9 },
    chartColumn: { flex: 1, height: "100%", alignItems: "center" },
    chartValue: { height: 20, color: colors.textMuted, fontSize: compact ? 7 : 9, fontWeight: "700" },
    chartTrack: { flex: 1, width: "65%", minWidth: 15, maxWidth: 38, borderRadius: 8, backgroundColor: colors.bg, overflow: "hidden", justifyContent: "flex-end" },
    chartBar: { width: "100%", borderRadius: 8 },
    chartDay: { height: 19, color: colors.textMuted, fontSize: compact ? 8 : 9.5, fontWeight: "800", marginTop: 5 },
    chartEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    chartEmptyText: { color: colors.textMuted, fontSize: 11.5 },
    outcomeGrid: { flexDirection: isTablet || !compact ? "row" : "column", flexWrap: "wrap", gap: 8 },
    outcomeCard: {
      flexBasis: isTablet ? "30%" : compact ? "100%" : "47%",
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: isPhone ? 12 : 14,
      minWidth: 0,
    },
    outcomeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 11 },
    outcomeLabel: { color: colors.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
    outcomeValue: { color: colors.text, fontSize: 23, fontWeight: "900", marginTop: 3 },
    outcomeMeta: { color: colors.textMuted, fontSize: 9.5, lineHeight: 14, fontWeight: "600", marginTop: 2 },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden", marginTop: 12 },
    progressFill: { height: "100%", borderRadius: 3 },
    rankingCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: compact ? 13 : 16,
    },
    rankingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    rankingRowLast: { borderBottomWidth: 0 },
    rankBadge: { width: 29, height: 29, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
    rankBadgeFirst: { backgroundColor: colors.amberSoft },
    rankText: { color: colors.textMuted, fontSize: 9.5, fontWeight: "900" },
    rankTextFirst: { color: colors.amber },
    studentAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft },
    studentInitial: { color: colors.violet, fontSize: 14, fontWeight: "900" },
    studentCopy: { flex: 1, minWidth: 0 },
    studentName: { color: colors.text, fontSize: 11.5, fontWeight: "800" },
    studentMeta: { color: colors.textMuted, fontSize: 8.5, marginTop: 2 },
    studentMinutes: { color: colors.violet, fontSize: 10.5, fontWeight: "900" },
    emptyRanking: {
      flexDirection: isPhone ? "row" : "column",
      alignItems: "center",
      justifyContent: isPhone ? "flex-start" : "center",
      gap: isPhone ? 11 : 0,
      paddingVertical: isPhone ? 16 : 28,
      paddingHorizontal: isPhone ? 4 : 16,
    },
    emptyRankingIcon: { width: isPhone ? 42 : 48, height: isPhone ? 42 : 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft, flexShrink: 0 },
    emptyRankingCopy: { flex: isPhone ? 1 : undefined, minWidth: 0, alignItems: isPhone ? "flex-start" : "center" },
    emptyRankingTitle: { color: colors.text, fontSize: 13.5, fontWeight: "900", marginTop: isPhone ? 0 : 10 },
    emptyRankingText: { color: colors.textMuted, fontSize: 10.5, textAlign: isPhone ? "left" : "center", marginTop: 3 },
    healthCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: isPhone ? 12 : 14, marginTop: 10 },
    healthHeader: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 },
    healthIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.mintSoft },
    healthTitle: { color: colors.text, fontSize: 12.5, fontWeight: "900" },
    healthSubtitle: { color: colors.textMuted, fontSize: 9.5, marginTop: 1 },
    healthMetrics: { flexDirection: isPhone ? "row" : "column", gap: isPhone ? 7 : 0 },
    healthRow: {
      flex: isPhone ? 1 : undefined,
      flexDirection: isPhone ? "column" : "row",
      alignItems: isPhone ? "flex-start" : "center",
      justifyContent: isPhone ? "center" : "space-between",
      gap: isPhone ? 2 : 8,
      minHeight: isPhone ? 58 : undefined,
      paddingVertical: isPhone ? 8 : 10,
      paddingHorizontal: isPhone ? 9 : 0,
      borderBottomWidth: isPhone ? 0 : 1,
      borderBottomColor: colors.border,
      borderRadius: isPhone ? RADIUS.md : 0,
      backgroundColor: isPhone ? colors.bg : "transparent",
    },
    healthRowLast: { borderBottomWidth: 0 },
    healthLabel: { color: colors.textMuted, fontSize: isPhone ? 9 : 10.5, fontWeight: "700" },
    healthValue: { color: colors.text, fontSize: isPhone ? 16 : 12, fontWeight: "900" },
  });
