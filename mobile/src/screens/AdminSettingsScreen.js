import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from "react-native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function AdminSettingsScreen() {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [allowSignups, setAllowSignups] = useState(true);
  const [defaultDailyGoal, setDefaultDailyGoal] = useState("120");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client
      .get("/admin/system")
      .then(({ data }) => {
        const s = data.settings;
        setMaintenanceMode(s.maintenanceMode);
        setAllowSignups(s.allowSignups);
        setDefaultDailyGoal(String(s.defaultDailyGoal ?? 120));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await client.patch("/admin/system", {
        maintenanceMode,
        allowSignups,
        defaultDailyGoal: Number(defaultDailyGoal) || 120,
      });
      Alert.alert("Saved", "System settings updated.");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>System Settings</Text>

        <Card style={{ marginBottom: 14 }}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Maintenance mode</Text>
<Switch value={maintenanceMode} onValueChange={setMaintenanceMode} trackColor={{ true: colors.tomato }} />
          </View>
          <Text style={styles.hint}>Blocks all users from accessing the app when enabled.</Text>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Allow new signups</Text>
            <Switch value={allowSignups} onValueChange={setAllowSignups} trackColor={{ true: colors.mint }} />
          </View>
          <Text style={styles.hint}>Controls whether the public signup screen accepts new STUDENT accounts.</Text>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.toggleLabel}>Default daily goal (minutes)</Text>
          <Input
            value={defaultDailyGoal}
            onChangeText={setDefaultDailyGoal}
            placeholder="120"
            keyboardType="number-pad"
            style={{ marginTop: 4 }}
          />
        </Card>

        <Button title="Save settings" onPress={save} loading={saving} />
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 16 },
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    toggleLabel: { color: colors.text, fontSize: 14 },
    hint: { color: colors.textMuted, fontSize: 11.5, marginTop: 6 },
  });
