import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function CoachScreen() {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
  }, []);

  const getInsight = async () => {
    setLoading(true);
    setError(null);
    try {
const { data: stats } = await client.get("/sessions/stats");
      // Give the LLM-backed coach call a long timeout — generating a
      // personalized analysis can take a while.
      const { data } = await client.post(
        "/materials/coach",
        {
          todayMinutes: stats.todayMinutes,
          last7Days: stats.last7Days,
          totalFocusSessions: stats.totalFocusSessions,
          totalStudyMinutes: stats.totalStudyMinutes,
          subjectTotals: stats.subjectTotals,
          totalTasks: stats.totalTasks,
          completedTasks: stats.completedTasks,
          completionRate: stats.completionRate,
        },
        { timeout: 120000 }
      );
      const nextInsight = data.insight;
      setInsight(nextInsight);
      await AsyncStorage.setItem("focusflow_coach_insight", JSON.stringify(nextInsight));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>AI Study Coach</Text>
        <Text style={styles.subtitle}>Get personalized feedback on your recent study habits and weekly progress.</Text>

        {!insight && !error && (
          <Card>
            <Text style={styles.muted}>Your coach will analyze your focus sessions, tasks, and study trends.</Text>
          </Card>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {insight && (
          <>
            <Card style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>SUMMARY</Text>
              <Text style={styles.body}>{insight.summary}</Text>
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>STRENGTHS</Text>
              {Array.isArray(insight.strengths) && insight.strengths.map((item, i) => <Text key={`strength-${i}`} style={styles.body}>• {item}</Text>)}
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>AREAS TO IMPROVE</Text>
              {Array.isArray(insight.improvementAreas) && insight.improvementAreas.map((item, i) => <Text key={`improve-${i}`} style={styles.body}>• {item}</Text>)}
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>FOCUS TREND</Text>
              <Text style={styles.body}>{insight.focusTrend}</Text>
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>SUBJECT FOCUS</Text>
              {Array.isArray(insight.subjectFocus) && insight.subjectFocus.map((item, i) => <Text key={`subject-${i}`} style={styles.body}>• {item}</Text>)}
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>WEEKLY SUMMARY</Text>
              <Text style={styles.body}>{insight.weeklySummary}</Text>
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>BEST STUDY TIME</Text>
              <Text style={styles.body}>{insight.bestStudyTime}</Text>
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>RECOMMENDATIONS</Text>
              {Array.isArray(insight.recommendations) && insight.recommendations.map((r, i) => <Text key={`rec-${i}`} style={styles.body}>• {r}</Text>)}
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <Text style={styles.sectionLabel}>STUDY TIPS</Text>
              {Array.isArray(insight.studyTips) && insight.studyTips.map((tip, i) => <Text key={`tip-${i}`} style={styles.body}>• {tip}</Text>)}
            </Card>
            {insight.motivation && (
              <Card style={{ backgroundColor: colors.mintSoft, borderColor: colors.mint }}>
                <Text style={[styles.body, { color: colors.mint, textAlign: "center", fontWeight: "700" }]}>
                  {insight.motivation}
                </Text>
              </Card>
            )}
          </>
        )}

        <Pressable onPress={getInsight} disabled={loading} style={[styles.button, loading && { opacity: 0.6 }]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{insight ? "Refresh insight" : "Analyze my study habits"}</Text>}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700" },
    subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 16 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6 },
    body: { color: colors.text, fontSize: 13.5, lineHeight: 20 },
    muted: { color: colors.textMuted, fontSize: 13 },
    error: { color: colors.tomato, fontSize: 13, marginBottom: 12 },
    button: {
      backgroundColor: colors.violet, borderRadius: 14, paddingVertical: 14,
      alignItems: "center", marginTop: 8,
    },
    buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
