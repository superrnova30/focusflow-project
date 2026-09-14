import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function CoachScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savingNote, setSavingNote] = useState(false);

  // Turn the generated insight into a study note the student can keep/review.
  const saveInsightToNotes = async () => {
    if (!insight || savingNote) return;
    setSavingNote(true);
    try {
      const blocks = [];
      const push = (level, text) => blocks.push({ type: "heading", level, text });
      const para = (text) => text && blocks.push({ type: "text", text: String(text), marks: [] });
      const bulletList = (label, arr) => {
        if (!Array.isArray(arr) || !arr.length) return;
        push(2, label);
        arr.forEach((item) => blocks.push({ type: "bullet", text: String(item) }));
      };

      push(2, "Coach Summary");
      para(insight.summary);
      bulletList("Strengths", insight.strengths);
      bulletList("Areas to Improve", insight.improvementAreas);
      if (insight.focusTrend) { push(2, "Focus Trend"); para(insight.focusTrend); }
      bulletList("Recommendations", insight.recommendations);
      bulletList("Study Tips", insight.studyTips);
      if (insight.bestStudyTime) { push(2, "Best Study Time"); para(insight.bestStudyTime); }
      bulletList("Subject Focus", insight.subjectFocus);
      if (insight.weeklySummary) { push(2, "Weekly Summary"); para(insight.weeklySummary); }

      const { data } = await client.post("/notes", {
        title: `AI Coach Insight — ${new Date().toLocaleDateString()}`,
        contentJson: blocks,
        source: "ai",
        aiSummary: insight.summary || "",
      });
      Alert.alert("Saved to Notes", "Your coach insight was saved as a note.", [
        { text: "View Notes", onPress: () => navigation.navigate("Notes") },
        { text: "OK", style: "cancel" },
      ]);
      return data;
    } catch (e) {
      Alert.alert("Error", e.message || "Could not save the insight to notes.");
    } finally {
      setSavingNote(false);
    }
  };

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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: 40,
          maxWidth: isWide ? 760 : undefined,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Text style={styles.header}>AI Study Coach</Text>
        <Text style={styles.subtitle}>Get personalized feedback on your recent study habits and weekly progress.</Text>

        {!insight && !error && !loading && (
          <Card style={{ alignItems: "center", paddingVertical: 24 }}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name="sparkles" size={26} color={colors.violet} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Your personal study coach</Text>
            <Text style={[styles.muted, { textAlign: "center", marginTop: 6 }]}>Tap the button below and your coach will analyze your focus sessions, tasks, and study trends.</Text>
          </Card>
        )}

        {loading && (
          <Card style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={colors.violet} />
            <Text style={[styles.muted, { marginTop: 12 }]}>Analyzing your study habits…</Text>
          </Card>
        )}

        {error ? (
          <Card style={{ borderColor: colors.tomato, marginBottom: 12 }}>
            <Text style={[styles.error, { marginBottom: 0 }]}>{error}</Text>
          </Card>
        ) : null}

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

        {insight && (
          <Pressable
            onPress={saveInsightToNotes}
            disabled={savingNote}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed || savingNote ? 0.8 : 1 },
            ]}
          >
            {savingNote ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="bookmark-outline" size={17} color={colors.text} />
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Save to Notes</Text>
              </>
            )}
          </Pressable>
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
    muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
    error: { color: colors.tomato, fontSize: 13, marginBottom: 12 },
    emptyIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    emptyTitle: { fontSize: 15.5, fontWeight: "700", marginTop: 12 },
    button: {
      backgroundColor: colors.violet, borderRadius: 14, paddingVertical: 14,
      alignItems: "center", marginTop: 8,
    },
    buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    secondaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 13,
      marginTop: 8,
    },
    secondaryBtnText: { fontWeight: "700", fontSize: 14.5 },
  });
