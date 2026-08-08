import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function AdminLogsScreen() {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const { data } = await client.get(`/admin/logs${q}`);
      setLogs(data.logs);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [fetchLogs])
  );

  const formatAction = (a) =>
    a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Screen>
      <Text style={styles.header}>Activity Logs</Text>
      <Input value={search} onChangeText={setSearch} placeholder="Search logs..." />

      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        style={{ marginTop: 8 }}
        refreshing={loading}
        onRefresh={fetchLogs}
        ListEmptyComponent={!loading && <Text style={styles.muted}>No logs found.</Text>}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 8 }}>
            <View style={styles.logRow}>
              <Text style={styles.logAction}>{formatAction(item.action)}</Text>
              <Text style={styles.logMeta}>
                {item.user?.name || "Unknown"} · {new Date(item.createdAt).toLocaleString()}
              </Text>
            </View>
            {item.meta && Object.keys(item.meta).length > 0 && (
              <Text style={styles.logMeta}>{JSON.stringify(item.meta)}</Text>
            )}
          </Card>
        )}
      />
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700", marginTop: 12, marginBottom: 16 },
    muted: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 20 },
    logRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    logAction: { color: colors.text, fontSize: 13, fontWeight: "700" },
    logMeta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  });
