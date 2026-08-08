import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Dimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { VictoryChart, VictoryLine, VictoryAxis, VictoryTheme } from "victory-native";
import { Screen, Card } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

const screenWidth = Dimensions.get("window").width;

export default function StatsScreen() {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const [stats, setStats] = useState(null);

  useFocusEffect(
    useCallback(() => {
      client.get("/sessions/stats").then(({ data }) => setStats(data)).catch(() => {});
    }, [])
  );

  if (!stats) {
    return (
      <Screen>
        <Text style={styles.mutedText}>Loading stats…</Text>
      </Screen>
    );
  }

  const chartData = stats.last7Days.map((d) => ({
    x: new Date(d.date).toLocaleDateString(undefined, { weekday: "short" }),
    y: d.minutes,
  }));

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>Stats</Text>

        <View style={styles.statRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>Sessions</Text>
            <Text style={styles.statValue}>{stats.totalFocusSessions}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>Study Time</Text>
            <Text style={styles.statValue}>
              {Math.floor(stats.totalStudyMinutes / 60)}h {stats.totalStudyMinutes % 60}m
            </Text>
          </Card>
        </View>

        <Text style={styles.sectionLabel}>LAST 7 DAYS (minutes)</Text>
        <Card>
          <VictoryChart width={screenWidth - 64} height={180} theme={VictoryTheme.material} padding={{ left: 40, right: 20, top: 10, bottom: 30 }}>
<VictoryAxis style={{ tickLabels: { fill: colors.textMuted, fontSize: 10 }, axis: { stroke: colors.border }, grid: { stroke: "none" } }} />
            <VictoryAxis dependentAxis style={{ tickLabels: { fill: colors.textMuted, fontSize: 10 }, axis: { stroke: "none" }, grid: { stroke: colors.border, strokeDasharray: "3,3" } }} />
            <VictoryLine data={chartData} style={{ data: { stroke: colors.tomato, strokeWidth: 2.5 } }} />
          </VictoryChart>
        </Card>

        <Text style={styles.sectionLabel}>TIME BY SUBJECT</Text>
        {Object.keys(stats.subjectTotals).length === 0 ? (
          <Text style={styles.mutedText}>No subject data yet.</Text>
        ) : (
          Object.entries(stats.subjectTotals).map(([name, minutes]) => (
            <Card key={name} style={{ marginBottom: 8, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.subjectName}>{name}</Text>
              <Text style={styles.subjectMinutes}>{minutes}m</Text>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 16 },
    statRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    statCard: { flex: 1 },
    statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 4 },
    statValue: { color: colors.text, fontSize: 20, fontWeight: "700" },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8 },
    mutedText: { color: colors.textMuted, fontSize: 13 },
    subjectName: { color: colors.text, fontSize: 13, fontWeight: "600" },
    subjectMinutes: { color: colors.textMuted, fontSize: 13 },
  });
