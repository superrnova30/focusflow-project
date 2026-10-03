import React, { useEffect, useState, useMemo, useLayoutEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { handleLimitError } from "../lib/upgradePrompt";
import { RADIUS, SPACING } from "../theme/theme";

function BulletList({ items, colors, styles }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <Text style={styles.emptySection}>No items yet.</Text>;
  }
  return items.map((item, i) => (
    <View key={`${item}-${i}`} style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: colors.violet }]} />
      <Text style={styles.bodyText}>{item}</Text>
    </View>
  ));
}

function InsightSection({ icon, title, accentColor, accentSoft, colors, styles, children, wide }) {
  return (
    <View style={[styles.sectionCard, wide && styles.sectionCardWide, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: accentSoft }]}>
          <Ionicons name={icon} size={18} color={accentColor} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function StatTile({ label, value, suffix, icon, color, soft, colors, styles }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>
        {value}
        {suffix ? <Text style={styles.statSuffix}>{suffix}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function CoachScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const [insight, setInsight] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "Study Coach",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Back",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await client.get("/sessions/stats");
      setStats(data);
    } catch (e) {
      // Stats preview is optional — coach can still run without it.
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadCachedInsight = async () => {
      try {
        const cached = await AsyncStorage.getItem("focusflow_coach_insight");
        if (cached) setInsight(JSON.parse(cached));
      } catch (e) {
        console.warn(e);
      }
    };
    loadCachedInsight();
    loadStats();
  }, [loadStats]);

  const getInsight = async () => {
    setLoading(true);
    setError(null);
    try {
      let statsPayload = stats;
      if (!statsPayload) {
        const { data } = await client.get("/sessions/stats");
        statsPayload = data;
        setStats(data);
      }
      const { data } = await client.post(
        "/materials/coach",
        {
          todayMinutes: statsPayload.todayMinutes,
          last7Days: statsPayload.last7Days,
          totalFocusSessions: statsPayload.totalFocusSessions,
          totalStudyMinutes: statsPayload.totalStudyMinutes,
          subjectTotals: statsPayload.subjectTotals,
          totalTasks: statsPayload.totalTasks,
          completedTasks: statsPayload.completedTasks,
          completionRate: statsPayload.completionRate,
        },
        { timeout: 120000 }
      );
      const nextInsight = data.insight;
      setInsight(nextInsight);
      await AsyncStorage.setItem("focusflow_coach_insight", JSON.stringify(nextInsight));
    } catch (e) {
      if (handleLimitError(navigation, e)) return;
      setError(e?.response?.data?.error || e.message || "Could not generate your coach insight.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    if (insight) {
      await getInsight();
    } else {
      setRefreshing(false);
    }
  };

  const todayMinutes = stats?.todayMinutes ?? 0;
  const completionRate = stats?.completionRate ?? 0;
  const streak = stats?.streak ?? 0;
  const weekMinutes = Array.isArray(stats?.last7Days)
    ? stats.last7Days.reduce((sum, d) => sum + (d.minutes || 0), 0)
    : 0;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.violet} colors={[colors.violet]} />
        }
      >
        <View style={styles.page}>
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name="fitness-outline" size={26} color={colors.violet} />
            </View>
            <Text style={styles.title}>AI Study Coach</Text>
            <Text style={styles.subtitle}>
              Personalized feedback on your focus sessions, tasks, and weekly study trends.
            </Text>
          </View>

          <View style={[styles.statsRow, isWide && styles.statsRowWide]}>
            <StatTile
              label="Today"
              value={todayMinutes}
              suffix="m"
              icon="today-outline"
              color={colors.violet}
              soft={colors.violetSoft}
              colors={colors}
              styles={styles}
            />
            <StatTile
              label="This week"
              value={weekMinutes}
              suffix="m"
              icon="calendar-outline"
              color={colors.mint}
              soft={colors.mintSoft}
              colors={colors}
              styles={styles}
            />
            <StatTile
              label="Task rate"
              value={completionRate}
              suffix="%"
              icon="checkmark-done-outline"
              color={colors.amber}
              soft={colors.amberSoft}
              colors={colors}
              styles={styles}
            />
            <StatTile
              label="Streak"
              value={streak}
              suffix="d"
              icon="flame-outline"
              color={colors.tomato}
              soft={colors.tomatoSoft}
              colors={colors}
              styles={styles}
            />
          </View>

          {statsLoading && !stats && (
            <View style={styles.statsLoading}>
              <ActivityIndicator color={colors.textMuted} size="small" />
              <Text style={styles.statsLoadingText}>Loading your activity…</Text>
            </View>
          )}

          <Pressable
            onPress={getInsight}
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.tomato, opacity: loading ? 0.65 : pressed ? 0.88 : 1 },
            ]}
          >
            {loading ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.primaryBtnText}>Analyzing your habits…</Text>
              </>
            ) : (
              <>
                <Ionicons name={insight ? "refresh" : "sparkles"} size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{insight ? "Refresh insight" : "Analyze my study habits"}</Text>
              </>
            )}
          </Pressable>

          {!insight && !loading && !error && (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.mintSoft }]}>
                <Ionicons name="analytics-outline" size={28} color={colors.mint} />
              </View>
              <Text style={styles.emptyTitle}>Ready when you are</Text>
              <Text style={styles.emptyText}>
                Your coach reviews focus time, task completion, and subject balance to suggest what to do next.
              </Text>
            </View>
          )}

          {loading && (
            <View style={[styles.loadingCard, { backgroundColor: colors.violetSoft, borderColor: colors.violet }]}>
              <ActivityIndicator color={colors.violet} size="large" />
              <Text style={[styles.loadingTitle, { color: colors.violet }]}>Building your insight</Text>
              <Text style={styles.loadingText}>
                Reviewing sessions, tasks, and trends — this usually takes a few seconds.
              </Text>
            </View>
          )}

          {!!error && (
            <View style={[styles.errorCard, { backgroundColor: colors.tomatoSoft, borderColor: colors.tomato }]}>
              <View style={styles.errorHeader}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.tomato} />
                <Text style={[styles.errorTitle, { color: colors.tomato }]}>Could not generate insight</Text>
              </View>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                onPress={getInsight}
                style={({ pressed }) => [styles.retryBtn, { borderColor: colors.tomato }, pressed && styles.pressed]}
              >
                <Text style={[styles.retryBtnText, { color: colors.tomato }]}>Try again</Text>
              </Pressable>
            </View>
          )}

          {insight && !loading && (
            <>
              {!!insight.motivation && (
                <View style={[styles.motivationBanner, { backgroundColor: colors.mintSoft, borderColor: colors.mint }]}>
                  <Ionicons name="heart" size={18} color={colors.mint} />
                  <Text style={[styles.motivationText, { color: colors.text }]}>{insight.motivation}</Text>
                </View>
              )}

              <InsightSection
                icon="document-text-outline"
                title="Summary"
                accentColor={colors.violet}
                accentSoft={colors.violetSoft}
                colors={colors}
                styles={styles}
              >
                <Text style={styles.bodyText}>{insight.summary}</Text>
              </InsightSection>

              <View style={[styles.sectionGrid, isWide && styles.sectionGridWide]}>
                <InsightSection
                  icon="trophy-outline"
                  title="Strengths"
                  accentColor={colors.mint}
                  accentSoft={colors.mintSoft}
                  colors={colors}
                  styles={styles}
                  wide={isWide}
                >
                  <BulletList items={insight.strengths} colors={colors} styles={styles} />
                </InsightSection>

                <InsightSection
                  icon="trending-up-outline"
                  title="Areas to improve"
                  accentColor={colors.amber}
                  accentSoft={colors.amberSoft}
                  colors={colors}
                  styles={styles}
                  wide={isWide}
                >
                  <BulletList items={insight.improvementAreas} colors={colors} styles={styles} />
                </InsightSection>
              </View>

              <View style={[styles.sectionGrid, isWide && styles.sectionGridWide]}>
                <InsightSection
                  icon="pulse-outline"
                  title="Focus trend"
                  accentColor={colors.tomato}
                  accentSoft={colors.tomatoSoft}
                  colors={colors}
                  styles={styles}
                  wide={isWide}
                >
                  <Text style={styles.bodyText}>{insight.focusTrend || "—"}</Text>
                </InsightSection>

                <InsightSection
                  icon="time-outline"
                  title="Best study time"
                  accentColor={colors.amber}
                  accentSoft={colors.amberSoft}
                  colors={colors}
                  styles={styles}
                  wide={isWide}
                >
                  <Text style={styles.bodyText}>{insight.bestStudyTime || "—"}</Text>
                </InsightSection>
              </View>

              <InsightSection
                icon="book-outline"
                title="Subject focus"
                accentColor={colors.violet}
                accentSoft={colors.violetSoft}
                colors={colors}
                styles={styles}
              >
                <BulletList items={insight.subjectFocus} colors={colors} styles={styles} />
              </InsightSection>

              <InsightSection
                icon="calendar-outline"
                title="Weekly summary"
                accentColor={colors.mint}
                accentSoft={colors.mintSoft}
                colors={colors}
                styles={styles}
              >
                <Text style={styles.bodyText}>{insight.weeklySummary || "—"}</Text>
              </InsightSection>

              <View style={[styles.sectionGrid, isWide && styles.sectionGridWide]}>
                <InsightSection
                  icon="bulb-outline"
                  title="Recommendations"
                  accentColor={colors.violet}
                  accentSoft={colors.violetSoft}
                  colors={colors}
                  styles={styles}
                  wide={isWide}
                >
                  <BulletList items={insight.recommendations} colors={colors} styles={styles} />
                </InsightSection>

                <InsightSection
                  icon="school-outline"
                  title="Study tips"
                  accentColor={colors.mint}
                  accentSoft={colors.mintSoft}
                  colors={colors}
                  styles={styles}
                  wide={isWide}
                >
                  <BulletList items={insight.studyTips} colors={colors} styles={styles} />
                </InsightSection>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    scroll: {
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xl * 2,
    },
    page: {
      width: "100%",
      maxWidth: isWide ? 860 : 520,
      alignSelf: "center",
    },
    hero: { marginBottom: SPACING.lg },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: RADIUS.lg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.md,
    },
    title: {
      color: colors.text,
      fontSize: compact ? 24 : 26,
      fontWeight: "900",
      letterSpacing: -0.3,
      marginBottom: 6,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 20,
      maxWidth: 520,
    },
    statsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    statsRowWide: {
      flexWrap: "nowrap",
    },
    statCard: {
      flexGrow: 1,
      flexBasis: compact ? "47%" : "22%",
      minWidth: compact ? "47%" : 100,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
    },
    statIcon: {
      width: 32,
      height: 32,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    statValue: {
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.5,
    },
    statSuffix: {
      fontSize: 14,
      fontWeight: "700",
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
      marginTop: 2,
    },
    statsLoading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: SPACING.md,
    },
    statsLoadingText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    primaryBtn: {
      height: 50,
      borderRadius: RADIUS.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: SPACING.lg,
    },
    primaryBtnText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 15,
    },
    emptyCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.xl,
      alignItems: "center",
      marginBottom: SPACING.lg,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.md,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "800",
      marginBottom: 8,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      maxWidth: 320,
    },
    loadingCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.xl,
      alignItems: "center",
      marginBottom: SPACING.lg,
    },
    loadingTitle: {
      fontSize: 15,
      fontWeight: "800",
      marginTop: SPACING.md,
      marginBottom: 6,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      maxWidth: 300,
    },
    errorCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    errorHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    errorTitle: {
      fontSize: 14,
      fontWeight: "800",
    },
    errorText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: SPACING.md,
    },
    retryBtn: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderRadius: RADIUS.sm,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    retryBtnText: {
      fontWeight: "800",
      fontSize: 13,
    },
    motivationBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    motivationText: {
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 21,
    },
    sectionGrid: {
      gap: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    sectionGridWide: {
      flexDirection: "row",
      alignItems: "stretch",
    },
    sectionCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    sectionCardWide: {
      flex: 1,
      marginBottom: 0,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: SPACING.md,
    },
    sectionIcon: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "800",
    },
    bodyText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 22,
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 8,
      marginRight: 10,
    },
    emptySection: {
      color: colors.textMuted,
      fontSize: 13,
      fontStyle: "italic",
    },
    pressed: {
      opacity: 0.82,
    },
  });
