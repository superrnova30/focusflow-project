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

      <View style={styles.searchField}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Search logs..."
          compact
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={fetchLogs}
        ListEmptyComponent={!loading && <Text style={styles.muted}>No logs found.</Text>}
        renderItem={({ item }) => (
          <Card style={styles.logCard}>
            <View style={styles.logRow}>
              <Text style={styles.logAction}>{formatAction(item.action)}</Text>
              <Text style={styles.logMetaInline}>
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
    header: { color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.6, marginTop: 16, marginBottom: 14 },
    searchField: { flex: 0, flexGrow: 0, flexShrink: 0 },
    searchInput: { marginTop: 0, marginBottom: 0, height: 40 },
    list: { marginTop: 24, flex: 1 },
    listContent: { paddingBottom: 18 },
    muted: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 0 },
    logCard: {
      marginBottom: 8,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    logRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
    logAction: { color: colors.text, fontSize: 14, fontWeight: "700", flexShrink: 1 },
    logMetaInline: { color: colors.textMuted, fontSize: 11, flexShrink: 1, textAlign: "right" },
    logMeta: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
  });
