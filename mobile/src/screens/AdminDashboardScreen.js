import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

function Stat({ label, value }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.statCard}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </Card>
  );
}

export default function AdminDashboardScreen() {
  const { colors } = useTheme();
  const [analytics, setAnalytics] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      const { data } = await client.get("/admin/analytics");
      setAnalytics(data.analytics ?? data);
    } catch (e) {
      setAnalytics(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAnalytics();
    }, [fetchAnalytics])
  );

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
        <Text style={[styles.title, { color: colors.text }]}>System Console</Text>

        {!analytics ? (
          <Text style={[styles.muted, { color: colors.textMuted }]}>Loading analytics…</Text>
        ) : (
          <>
            <View style={styles.grid}>
              <Stat label="Total Users" value={analytics.totalUsers} />
              <Stat label="Active Users" value={analytics.activeUsers} />
              <Stat label="Students" value={analytics.students} />
              <Stat label="Materials" value={analytics.totalMaterials} />
              <Stat label="Quizzes" value={analytics.totalQuizzes} />
              <Stat label="Sessions" value={analytics.totalFocusSessions ?? analytics.totalSessions} />
              <Stat label="Study Time" value={`${Math.floor((analytics.totalStudyMinutes ?? 0) / 60)}h ${((analytics.totalStudyMinutes ?? 0) % 60)}m`} />
              <Stat label="Task Completion" value={`${analytics.taskCompletionRate ?? analytics.completionRate ?? 0}%`} />
              <Stat label="Quiz Avg" value={`${analytics.averageQuizScore ?? 0}%`} />
              <Stat label="Avg Study/Student" value={`${analytics.avgStudyMinutes ?? analytics.averageStudyMinutes ?? 0}m`} />
            </View>

            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MOST ACTIVE USERS</Text>
            {Array.isArray(analytics.mostActiveUsers) && analytics.mostActiveUsers.length > 0 ? (
              analytics.mostActiveUsers.map((u, i) => (
                <Card key={i} style={{ marginBottom: 8, flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[styles.userName, { color: colors.text }]}>{u.name}</Text>
                  <Text style={[styles.userMinutes, { color: colors.textMuted }]}>{Math.floor(u.minutes / 60)}h {u.minutes % 60}m</Text>
                </Card>
              ))
            ) : (
              <Text style={[styles.muted, { color: colors.textMuted }]}>No study data yet.</Text>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 19, fontWeight: "700", marginBottom: 20 },
  muted: { fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "47%" },
  statLabel: { fontSize: 10.5, fontWeight: "600", marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "700" },
  sectionLabel: { fontSize: 12, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  userName: { fontSize: 13, fontWeight: "600" },
  userMinutes: { fontSize: 13 },
});
