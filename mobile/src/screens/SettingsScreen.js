import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Alert, Image, Pressable } from "react-native";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { ALARM_SOUNDS, loadAlarmPrefs, saveAlarmPrefs } from "../lib/alarmPrefs";
import { previewAlarm } from "../lib/alarmPlayer";
import { registerForPushNotifications, unregisterPushNotifications, sendTestPush, getSavedPushToken } from "../lib/push";
import client from "../api/client";

const THEME_OPTIONS = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "System" },
];

export default function SettingsScreen() {
  const { colors, scheme, setScheme } = useTheme();
  const styles = useStyles(colors);
  const { user, logout, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [studentId, setStudentId] = useState(user?.studentId || "");
  const [course, setCourse] = useState(user?.course || "");
  const [yearLevel, setYearLevel] = useState(user?.yearLevel || "");
  const [section, setSection] = useState(user?.section || "");
  const [profilePicture, setProfilePicture] = useState(user?.profilePicture || "");
  const [dailyGoal, setDailyGoal] = useState(String(user?.dailyGoalMinutes ?? 120));
  const [focusMinutes, setFocusMinutes] = useState(String(user?.focusMinutes ?? 25));
  const [shortBreak, setShortBreak] = useState(String(user?.shortBreakMinutes ?? 5));
  const [longBreak, setLongBreak] = useState(String(user?.longBreakMinutes ?? 15));
  const [sessionsBeforeLong, setSessionsBeforeLong] = useState(String(user?.sessionsBeforeLongBreak ?? 4));
  const [reminderTime, setReminderTime] = useState(user?.reminderTime || "18:00");
  const [reminders, setReminders] = useState(user?.remindersEnabled ?? true);
  const [saving, setSaving] = useState(false);

  // Alarm settings
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [alarmSoundId, setAlarmSoundId] = useState("chime");
  const [alarmVolume, setAlarmVolume] = useState(0.8);

  // Push notification settings
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const isExpoGo = Constants.appOwnership === "expo";

  useEffect(() => {
    getSavedPushToken()
      .then((token) => setPushEnabled(!!token))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAlarmPrefs().then((prefs) => {
      setAlarmEnabled(prefs.enabled);
      setAlarmSoundId(prefs.soundId);
      setAlarmVolume(prefs.volume);
    });
  }, []);

  const togglePush = async (value) => {
    setPushBusy(true);
    try {
      if (value) {
        const token = await registerForPushNotifications();
        if (!token) {
          Alert.alert("Push unavailable", "Permission was denied or this device can't receive push notifications.");
          setPushEnabled(false);
          return;
        }
        setPushEnabled(true);
        Alert.alert("Push enabled", "You'll get study reminders on this device.");
      } else {
        await unregisterPushNotifications();
        setPushEnabled(false);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    setPushBusy(true);
    try {
      await sendTestPush();
      Alert.alert("Sent", "A test notification was sent to this device.");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setPushBusy(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to choose a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      setProfilePicture(uri);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await client.patch("/auth/me", {
        name,
        studentId,
        course,
        yearLevel,
        section,
        profilePicture,
        dailyGoalMinutes: Number(dailyGoal) || 120,
        focusMinutes: Number(focusMinutes) || 25,
        shortBreakMinutes: Number(shortBreak) || 5,
        longBreakMinutes: Number(longBreak) || 15,
        sessionsBeforeLongBreak: Number(sessionsBeforeLong) || 4,
        reminderTime,
        remindersEnabled: reminders,
      });
      await saveAlarmPrefs({ enabled: alarmEnabled, soundId: alarmSoundId, volume: alarmVolume });
      await refreshUser();
      Alert.alert("Saved", "Your settings have been updated.");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const changeSound = (id) => {
    setAlarmSoundId(id);
    previewAlarm(id, alarmVolume);
  };

  const adjustVolume = (delta) => {
    setAlarmVolume((v) => Math.max(0, Math.min(1, Math.round((v + delta) * 10) / 10)));
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Text style={styles.header}>Settings</Text>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <Text style={styles.accountName}>{user?.name}</Text>
          <Text style={styles.accountEmail}>{user?.email}</Text>
          <Button title="Log out" onPress={logout} variant="secondary" />
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.sectionLabel}>APPEARANCE</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const selected = scheme === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setScheme(opt.key)}
                  style={[styles.themeChip, selected && { borderColor: colors.violet, backgroundColor: colors.violetSoft }]}
                >
                  <Text style={[styles.themeChipText, selected && { color: colors.violet }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>Choose a light, dark, or system-following appearance.</Text>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.sectionLabel}>ALARM</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Play alarm when focus ends</Text>
            <Switch value={alarmEnabled} onValueChange={setAlarmEnabled} trackColor={{ true: colors.tomato }} />
          </View>

          <Text style={styles.subLabel}>SOUND</Text>
          <View style={styles.soundRow}>
            {ALARM_SOUNDS.map((s) => {
              const selected = alarmSoundId === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => changeSound(s.id)}
                  style={[styles.soundChip, selected && { borderColor: colors.tomato, backgroundColor: colors.tomatoSoft }]}
                >
                  <Text style={[styles.soundChipText, selected && { color: colors.tomato }]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.subLabel}>VOLUME</Text>
          <View style={styles.volumeRow}>
            <Pressable onPress={() => adjustVolume(-0.1)} style={styles.volumeBtn}>
              <Text style={styles.volumeBtnText}>−</Text>
            </Pressable>
            <View style={styles.volumeTrack}>
              <View style={[styles.volumeFill, { width: `${alarmVolume * 100}%`, backgroundColor: colors.tomato }]} />
            </View>
            <Pressable onPress={() => adjustVolume(0.1)} style={styles.volumeBtn}>
              <Text style={styles.volumeBtnText}>+</Text>
            </Pressable>
            <Text style={styles.volumePct}>{Math.round(alarmVolume * 100)}%</Text>
          </View>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.sectionLabel}>PROFILE PICTURE</Text>
          <Pressable onPress={pickImage} style={styles.avatarWrap}>
            {profilePicture ? (
              <Image source={{ uri: profilePicture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.violetSoft }]}>
                <Text style={[styles.avatarInitial, { color: colors.violet }]}>{(name || "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.avatarHint}>Tap to change photo</Text>
          </Pressable>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.sectionLabel}>PROFILE</Text>
          <Input value={name} onChangeText={setName} placeholder="Full name" />
          <Input value={studentId} onChangeText={setStudentId} placeholder="Student ID" autoCapitalize="characters" />
          <Input value={course} onChangeText={setCourse} placeholder="Course (e.g. BS Computer Science)" />
          <Input value={yearLevel} onChangeText={setYearLevel} placeholder="Year Level (e.g. 2nd Year)" />
          <Input value={section} onChangeText={setSection} placeholder="Section (optional)" />
          <Input value={dailyGoal} onChangeText={setDailyGoal} placeholder="Daily goal (minutes)" keyboardType="number-pad" />
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.sectionLabel}>POMODORO TIMER</Text>
          <Input value={focusMinutes} onChangeText={setFocusMinutes} placeholder="Focus length (minutes)" keyboardType="number-pad" />
          <Input value={shortBreak} onChangeText={setShortBreak} placeholder="Short break (minutes)" keyboardType="number-pad" />
          <Input value={longBreak} onChangeText={setLongBreak} placeholder="Long break (minutes)" keyboardType="number-pad" />
          <Input value={sessionsBeforeLong} onChangeText={setSessionsBeforeLong} placeholder="Sessions before long break" keyboardType="number-pad" />
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.sectionLabel}>REMINDERS</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Reminders enabled</Text>
            <Switch value={reminders} onValueChange={setReminders} trackColor={{ true: colors.tomato }} />
          </View>
          <Input value={reminderTime} onChangeText={setReminderTime} placeholder="Reminder time (HH:MM)" style={{ marginTop: 12 }} />
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.sectionLabel}>PUSH NOTIFICATIONS</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Study reminders on this device</Text>
            <Switch
              value={pushEnabled}
              onValueChange={togglePush}
              disabled={pushBusy}
              trackColor={{ true: colors.tomato }}
            />
          </View>
          <Text style={styles.hint}>
            {isExpoGo
              ? "Remote push notifications are not supported in Expo Go. Use a custom development build to enable them."
              : "Push lets the server send you daily study reminders even when the app is closed."}
          </Text>
          {!isExpoGo && (
            <Button
              title="Send test notification"
              onPress={handleTestPush}
              loading={pushBusy}
              variant="secondary"
              style={{ marginTop: 12 }}
            />
          )}
        </Card>

        <Button title={saving ? "Saving…" : "Save changes"} onPress={save} loading={saving} />
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 16 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 10 },
    accountName: { color: colors.text, fontSize: 14, fontWeight: "600" },
    accountEmail: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    toggleLabel: { color: colors.text, fontSize: 14 },
    hint: { color: colors.textMuted, fontSize: 11.5, marginTop: 6 },
    subLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 8, marginBottom: 6 },
    themeRow: { flexDirection: "row", gap: 8 },
    themeChip: {
      flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.bg, alignItems: "center",
    },
    themeChipText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    soundRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    soundChip: {
      paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.bg,
    },
    soundChipText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    volumeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    volumeBtn: {
      width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.bg, alignItems: "center", justifyContent: "center",
    },
    volumeBtnText: { color: colors.text, fontSize: 18, fontWeight: "700" },
    volumeTrack: {
      flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden",
    },
    volumeFill: { height: "100%", borderRadius: 4 },
    volumePct: { color: colors.textMuted, fontSize: 12, fontWeight: "700", width: 40, textAlign: "right" },
    avatarWrap: { alignItems: "center", marginBottom: 4 },
    avatar: { width: 88, height: 88, borderRadius: 44 },
    avatarFallback: { alignItems: "center", justifyContent: "center" },
    avatarInitial: { fontSize: 34, fontWeight: "700" },
    avatarHint: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  });
