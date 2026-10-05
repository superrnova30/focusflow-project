import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Alert, Image, Pressable, useWindowDimensions, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { usePremium } from "../context/PremiumContext";
import { RADIUS, SPACING } from "../theme/theme";
import { registerForPushNotifications, unregisterPushNotifications, sendTestPush, getSavedPushToken } from "../lib/push";
import { ALARM_SOUNDS, loadAlarmPrefs, saveAlarmPrefs } from "../lib/alarmPrefs";
import { previewAlarm } from "../lib/alarmPlayer";
import client from "../api/client";
import HeaderWallet from "../components/HeaderWallet";

const GOLD = "#FFC15E";

const THEME_OPTIONS = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "System" },
];

function InstantBadge({ colors, styles }) {
  return (
    <View style={[styles.instantBadge, { backgroundColor: colors.mintSoft }]}>
      <Ionicons name="flash-outline" size={10} color={colors.mint} />
      <Text style={[styles.instantBadgeText, { color: colors.mint }]}>Instant</Text>
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const { colors, scheme, setScheme } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);
  const { user, logout, refreshUser } = useAuth();
  const { isPremium, premium } = usePremium();

  const [name, setName] = useState(user?.name || "");
  const [studentId, setStudentId] = useState(user?.studentId || "");
  const [course, setCourse] = useState(user?.course || "");
  const [school, setSchool] = useState(user?.school || "");
  const [yearLevel, setYearLevel] = useState(user?.yearLevel || "");
  const [section, setSection] = useState(user?.section || "");
  const [profilePicture, setProfilePicture] = useState(user?.profilePicture || "");
  const [dailyGoal, setDailyGoal] = useState(String(user?.dailyGoalMinutes ?? 120));
  const [focusMinutes, setFocusMinutes] = useState(String(user?.focusMinutes ?? 25));
  const [shortBreak, setShortBreak] = useState(String(user?.shortBreakMinutes ?? 5));
  const [longBreak, setLongBreak] = useState(String(user?.longBreakMinutes ?? 15));
  const [sessionsBeforeLong, setSessionsBeforeLong] = useState(String(user?.sessionsBeforeLongBreak ?? 4));
  const [pomodoroExpanded, setPomodoroExpanded] = useState(false);
  const [reminderTime, setReminderTime] = useState(user?.reminderTime || "18:00");
  const [reminders, setReminders] = useState(user?.remindersEnabled ?? true);
  const [saving, setSaving] = useState(false);

  const [changeOpen, setChangeOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const isExpoGo = Constants.appOwnership === "expo";

  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [alarmSoundId, setAlarmSoundId] = useState("chime");
  const [alarmVolume, setAlarmVolume] = useState(0.8);
  const alarmPrefsReady = useRef(false);

  useEffect(() => {
    getSavedPushToken()
      .then((token) => setPushEnabled(!!token))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAlarmPrefs()
      .then((prefs) => {
        setAlarmEnabled(prefs.enabled);
        setAlarmSoundId(prefs.soundId);
        setAlarmVolume(prefs.volume);
        alarmPrefsReady.current = true;
      })
      .catch(() => {
        alarmPrefsReady.current = true;
      });
  }, []);

  useEffect(() => {
    if (!alarmPrefsReady.current) return undefined;
    const timer = setTimeout(() => {
      saveAlarmPrefs({ enabled: alarmEnabled, soundId: alarmSoundId, volume: alarmVolume }).catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [alarmEnabled, alarmSoundId, alarmVolume]);

  useEffect(() => {
    setName(user?.name || "");
    setStudentId(user?.studentId || "");
    setCourse(user?.course || "");
    setSchool(user?.school || "");
    setYearLevel(user?.yearLevel || "");
    setSection(user?.section || "");
    setProfilePicture(user?.profilePicture || "");
    setDailyGoal(String(user?.dailyGoalMinutes ?? 120));
    setFocusMinutes(String(user?.focusMinutes ?? 25));
    setShortBreak(String(user?.shortBreakMinutes ?? 5));
    setLongBreak(String(user?.longBreakMinutes ?? 15));
    setSessionsBeforeLong(String(user?.sessionsBeforeLongBreak ?? 4));
    setReminderTime(user?.reminderTime || "18:00");
    setReminders(user?.remindersEnabled ?? true);
  }, [user]);

  const savedProfile = useMemo(
    () => ({
      name: (user?.name || "").trim(),
      studentId: (user?.studentId || "").trim(),
      course: (user?.course || "").trim(),
      school: (user?.school || "").trim(),
      yearLevel: (user?.yearLevel || "").trim(),
      section: (user?.section || "").trim(),
      profilePicture: user?.profilePicture || "",
      dailyGoal: String(user?.dailyGoalMinutes ?? 120),
      focusMinutes: String(user?.focusMinutes ?? 25),
      shortBreak: String(user?.shortBreakMinutes ?? 5),
      longBreak: String(user?.longBreakMinutes ?? 15),
      sessionsBeforeLong: String(user?.sessionsBeforeLongBreak ?? 4),
      reminderTime: user?.reminderTime || "18:00",
      reminders: user?.remindersEnabled ?? true,
    }),
    [user]
  );

  const hasUnsavedChanges = useMemo(
    () =>
      name.trim() !== savedProfile.name ||
      studentId.trim() !== savedProfile.studentId ||
      course.trim() !== savedProfile.course ||
      school.trim() !== savedProfile.school ||
      yearLevel.trim() !== savedProfile.yearLevel ||
      section.trim() !== savedProfile.section ||
      profilePicture !== savedProfile.profilePicture ||
      dailyGoal !== savedProfile.dailyGoal ||
      focusMinutes !== savedProfile.focusMinutes ||
      shortBreak !== savedProfile.shortBreak ||
      longBreak !== savedProfile.longBreak ||
      sessionsBeforeLong !== savedProfile.sessionsBeforeLong ||
      reminderTime.trim() !== savedProfile.reminderTime ||
      reminders !== savedProfile.reminders,
    [
      name,
      studentId,
      course,
      school,
      yearLevel,
      section,
      profilePicture,
      dailyGoal,
      focusMinutes,
      shortBreak,
      longBreak,
      sessionsBeforeLong,
      reminderTime,
      reminders,
      savedProfile,
    ]
  );

  const togglePush = async (value) => {
    setPushBusy(true);
    try {
      if (value) {
        await registerForPushNotifications();
        setPushEnabled(true);
        Alert.alert("Push enabled", "Background notifications are registered for this device.");
      } else {
        await unregisterPushNotifications();
        setPushEnabled(false);
      }
    } catch (e) {
      setPushEnabled(false);
      Alert.alert("Push unavailable", e.message || "This device could not be registered.");
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    setPushBusy(true);
    try {
      const result = await sendTestPush();
      Alert.alert(
        "Notification queued",
        `Expo accepted the test notification for ${result?.result?.accepted || 1} device${result?.result?.accepted === 1 ? "" : "s"}.`
      );
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

  const saveProfile = async () => {
    const numberValue = (value, min, max) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
    };
    const nextDailyGoal = numberValue(dailyGoal, 1, 1440);
    const nextFocus = numberValue(focusMinutes, 1, 180);
    const nextShortBreak = numberValue(shortBreak, 1, 60);
    const nextLongBreak = numberValue(longBreak, 1, 120);
    const nextSessions = numberValue(sessionsBeforeLong, 1, 12);

    if (!name.trim()) {
      Alert.alert("Name required", "Please enter your name before saving.");
      return;
    }
    if ([nextDailyGoal, nextFocus, nextShortBreak, nextLongBreak, nextSessions].some((value) => value === null)) {
      Alert.alert("Check timer values", "Enter valid positive values for your study goal and timer routine.");
      return;
    }
    if (reminders && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime.trim())) {
      Alert.alert("Invalid reminder time", "Use 24-hour HH:MM format, such as 18:00.");
      return;
    }

    setSaving(true);
    try {
      await client.patch("/auth/me", {
        name: name.trim(),
        studentId: studentId.trim(),
        course: course.trim(),
        school: school.trim(),
        yearLevel: yearLevel.trim(),
        section: section.trim(),
        profilePicture,
        dailyGoalMinutes: nextDailyGoal,
        focusMinutes: nextFocus,
        shortBreakMinutes: nextShortBreak,
        longBreakMinutes: nextLongBreak,
        sessionsBeforeLongBreak: nextSessions,
        reminderTime: reminderTime.trim(),
        remindersEnabled: reminders,
      });
      await refreshUser();
      Alert.alert("Saved", "Your profile and study preferences were updated.");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = useCallback(() => {
    setName(savedProfile.name);
    setStudentId(savedProfile.studentId);
    setCourse(savedProfile.course);
    setSchool(savedProfile.school);
    setYearLevel(savedProfile.yearLevel);
    setSection(savedProfile.section);
    setProfilePicture(savedProfile.profilePicture);
    setDailyGoal(savedProfile.dailyGoal);
    setFocusMinutes(savedProfile.focusMinutes);
    setShortBreak(savedProfile.shortBreak);
    setLongBreak(savedProfile.longBreak);
    setSessionsBeforeLong(savedProfile.sessionsBeforeLong);
    setReminderTime(savedProfile.reminderTime);
    setReminders(savedProfile.reminders);
  }, [savedProfile]);

  const changePassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert("Password too short", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords do not match", "Enter the same password in both fields.");
      return;
    }
    setChanging(true);
    try {
      await client.patch("/auth/me/password", { newPassword });
      await refreshUser();
      Alert.alert("Password updated", "Your password was changed successfully.");
      setNewPassword("");
      setConfirmPassword("");
      setChangeOpen(false);
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to change password");
    } finally {
      setChanging(false);
    }
  };

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      const confirmed = typeof window !== "undefined" && window.confirm ? window.confirm("Log out of FocusFlow?") : true;
      if (confirmed) logout();
      return;
    }
    Alert.alert("Log out?", "You'll need to sign in again to access your study space.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);
  };

  const renderCardHeading = (icon, iconBg, iconColor, title, subtitle, instant = false) => (
    <View style={styles.cardHeading}>
      <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <View style={styles.cardHeadingCopy}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {instant ? <InstantBadge colors={colors} styles={styles} /> : null}
        </View>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );

  return (
    <Screen>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={[styles.page, hasUnsavedChanges && styles.pageWithStickyBar]}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {navigation?.canGoBack?.() ? (
              <Pressable
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginRight: 8 }, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={18} color={colors.text} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>ACCOUNT</Text>
              <Text style={styles.headerTitle}>Settings</Text>
            </View>
            <HeaderWallet compact={compact} />
          </View>
          <Text style={styles.headerSubtitle}>
            Profile and study preferences save together. Theme, push, and alarm settings apply instantly.
          </Text>
        </View>

        <Card style={styles.accountHero}>
          <Pressable
            onPress={pickImage}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
            style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}
          >
            {profilePicture ? (
              <Image source={{ uri: profilePicture }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(name || "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={13} color="#fff" />
            </View>
          </Pressable>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName} numberOfLines={1}>{name || user?.name || "Student"}</Text>
            <Text style={styles.accountEmail} numberOfLines={1}>{user?.email}</Text>
            <View style={styles.accountBadges}>
              <View style={styles.studentBadge}><Text style={styles.studentBadgeText}>STUDENT</Text></View>
              <View style={[styles.planBadge, isPremium && styles.planBadgePremium]}>
                <Ionicons name={isPremium ? "star" : "person-outline"} size={11} color={isPremium ? GOLD : colors.textMuted} />
                <Text style={[styles.planBadgeText, isPremium && { color: GOLD }]}>
                  {isPremium ? "Unlimited" : "Basic"}
                </Text>
              </View>
            </View>
            {user?.id ? (
              <Pressable
                onPress={() => navigation.navigate("ProfileHome")}
                style={({ pressed }) => [styles.publicProfileLink, pressed && styles.pressed]}
              >
                <Ionicons name="globe-outline" size={13} color={colors.violet} />
                <Text style={styles.publicProfileLinkText}>View public profile</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={confirmLogout} style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed]}>
            <Ionicons name="log-out-outline" size={18} color={colors.tomato} />
            {!compact && <Text style={styles.logoutText}>Log out</Text>}
          </Pressable>
        </Card>

        <Pressable
          onPress={() => navigation.navigate("Study", { screen: "Premium" })}
          style={({ pressed }) => [styles.subscriptionRow, isPremium && styles.subscriptionActive, pressed && styles.pressed]}
        >
          <View style={styles.subscriptionIcon}>
            <Ionicons name={isPremium ? "star" : "sparkles"} size={22} color={isPremium ? colors.mint : GOLD} />
          </View>
          <View style={styles.subscriptionCopy}>
            <Text style={styles.subscriptionTitle}>{isPremium ? "Go Unlimited is active" : "Unlock Go Unlimited"}</Text>
            <Text style={styles.subscriptionMeta} numberOfLines={2}>
              {isPremium
                ? `${premium.daysRemaining} day${premium.daysRemaining === 1 ? "" : "s"} remaining on your plan`
                : "Unlimited cards, hearts, AI tutoring, hints, and prompts."}
            </Text>
          </View>
          {!compact && (
            <View style={[styles.subscriptionBadge, isPremium && styles.subscriptionBadgeActive]}>
              <Text style={[styles.subscriptionBadgeText, isPremium && { color: "#fff" }]}>
                {isPremium ? "ACTIVE" : "VIEW PLAN"}
              </Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </Pressable>

        <View style={styles.settingsGrid}>
          <View style={styles.settingsColumn}>
            <Card style={styles.settingsCard}>
              {renderCardHeading(
                "person-outline",
                colors.violetSoft,
                colors.violet,
                "Profile",
                "Your name and academic details."
              )}
              <View style={styles.formRow}>
                <Input label="Full name" value={name} onChangeText={setName} placeholder="Your full name" />
                <Input label="Student ID" value={studentId} onChangeText={setStudentId} placeholder="Student ID" autoCapitalize="characters" />
              </View>
              <Input label="Course" value={course} onChangeText={setCourse} placeholder="e.g. BS Computer Science" />
              <Input label="School" value={school} onChangeText={setSchool} placeholder="e.g. FocusFlow University" />
              <View style={styles.formRow}>
                <Input label="Year level" value={yearLevel} onChangeText={setYearLevel} placeholder="e.g. 2nd Year" />
                <Input label="Section" value={section} onChangeText={setSection} placeholder="Optional" />
              </View>
            </Card>

            <Card style={styles.settingsCard}>
              {renderCardHeading(
                "timer-outline",
                colors.amberSoft,
                colors.amber,
                "Study setup",
                "Daily goal and Pomodoro timer defaults."
              )}
              <Input label="Daily study goal (minutes)" value={dailyGoal} onChangeText={setDailyGoal} placeholder="120" keyboardType="number-pad" />
              <Pressable
                style={({ pressed }) => [styles.dropdownHeader, pressed && styles.pressed]}
                onPress={() => setPomodoroExpanded((value) => !value)}
                accessibilityRole="button"
                accessibilityState={{ expanded: pomodoroExpanded }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownTitle}>Pomodoro schedule</Text>
                  <Text style={styles.dropdownSummary}>{`${focusMinutes}m focus · ${shortBreak}m short · ${longBreak}m long`}</Text>
                </View>
                <View style={styles.dropdownChevron}>
                  <Ionicons name={pomodoroExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.violet} />
                </View>
              </Pressable>
              {pomodoroExpanded && (
                <View style={styles.expandedFields}>
                  <View style={styles.formRow}>
                    <Input label="Focus minutes" value={focusMinutes} onChangeText={setFocusMinutes} placeholder="25" keyboardType="number-pad" />
                    <Input label="Short break" value={shortBreak} onChangeText={setShortBreak} placeholder="5" keyboardType="number-pad" />
                  </View>
                  <View style={styles.formRow}>
                    <Input label="Long break" value={longBreak} onChangeText={setLongBreak} placeholder="15" keyboardType="number-pad" />
                    <Input label="Sessions per cycle" value={sessionsBeforeLong} onChangeText={setSessionsBeforeLong} placeholder="4" keyboardType="number-pad" />
                  </View>
                </View>
              )}
            </Card>

            <Card style={styles.settingsCard}>
              {renderCardHeading(
                "calendar-outline",
                colors.mintSoft,
                colors.mint,
                "Study reminders",
                "Saved with your profile when you tap Save changes."
              )}
              <View style={styles.preferenceRow}>
                <View style={styles.preferenceCopy}>
                  <Text style={styles.preferenceTitle}>Daily reminder</Text>
                  <Text style={styles.preferenceSubtitle}>Get a nudge at your chosen time.</Text>
                </View>
                <Switch value={reminders} onValueChange={setReminders} trackColor={{ false: colors.border, true: colors.tomato }} />
              </View>
              {reminders && (
                <Input label="Reminder time (24-hour)" value={reminderTime} onChangeText={setReminderTime} placeholder="18:00" />
              )}
            </Card>

            <Card style={styles.settingsCard}>
              {renderCardHeading(
                "shield-checkmark-outline",
                colors.tomatoSoft,
                colors.tomato,
                "Security",
                "Password changes are separate from profile settings."
              )}
              {!changeOpen ? (
                <Pressable onPress={() => setChangeOpen(true)} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
                  <View style={styles.actionIcon}><Ionicons name="key-outline" size={18} color={colors.violet} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionTitle}>Change password</Text>
                    <Text style={styles.actionSubtitle}>Use at least 8 characters.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                </Pressable>
              ) : (
                <>
                  <Input label="New password" value={newPassword} onChangeText={setNewPassword} placeholder="At least 8 characters" secureTextEntry />
                  <Input label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat new password" secureTextEntry />
                  <View style={styles.passwordActions}>
                    <Button title="Update password" onPress={changePassword} loading={changing} style={styles.passwordSaveBtn} />
                    <Button
                      title="Cancel"
                      onPress={() => { setChangeOpen(false); setNewPassword(""); setConfirmPassword(""); }}
                      variant="secondary"
                      style={styles.cancelPasswordBtn}
                    />
                  </View>
                </>
              )}
            </Card>
          </View>

          <View style={styles.settingsColumn}>
            <Card style={styles.settingsCard}>
              {renderCardHeading(
                "color-palette-outline",
                colors.violetSoft,
                colors.violet,
                "Appearance",
                "Theme updates apply right away.",
                true
              )}
              <View style={styles.themeRow}>
                {THEME_OPTIONS.map((option) => {
                  const selected = scheme === option.key;
                  const icon = option.key === "light" ? "sunny-outline" : option.key === "dark" ? "moon-outline" : "phone-portrait-outline";
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setScheme(option.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [styles.themeChip, selected && styles.themeChipSelected, pressed && styles.pressed]}
                    >
                      <Ionicons name={icon} size={18} color={selected ? colors.violet : colors.textMuted} />
                      <Text style={[styles.themeChipText, selected && styles.themeChipTextSelected]}>{option.label}</Text>
                      {selected && <Ionicons name="checkmark-circle" size={15} color={colors.violet} />}
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            <Card style={styles.settingsCard}>
              {renderCardHeading(
                "notifications-outline",
                colors.mintSoft,
                colors.mint,
                "Push notifications",
                "Device permission and delivery settings.",
                true
              )}
              <View style={styles.preferenceRow}>
                <View style={styles.preferenceCopy}>
                  <Text style={styles.preferenceTitle}>Push notifications</Text>
                  <Text style={styles.preferenceSubtitle}>Receive reminders when the app is closed.</Text>
                </View>
                <Switch
                  value={pushEnabled}
                  onValueChange={togglePush}
                  disabled={pushBusy || isExpoGo}
                  trackColor={{ false: colors.border, true: colors.tomato }}
                />
              </View>
              <Text style={styles.hint}>
                {isExpoGo
                  ? "Push notifications require a custom development build."
                  : "Turning this on or off takes effect immediately."}
              </Text>
              {!isExpoGo && pushEnabled && (
                <Button title="Send test notification" onPress={handleTestPush} loading={pushBusy} variant="secondary" style={{ marginTop: 12 }} />
              )}
            </Card>

            <Card style={styles.settingsCard}>
              {renderCardHeading(
                "musical-notes-outline",
                colors.tomatoSoft,
                colors.tomato,
                "Focus alarm",
                "Sound and volume save automatically.",
                true
              )}
              <View style={styles.preferenceRow}>
                <View style={styles.preferenceCopy}>
                  <Text style={styles.preferenceTitle}>Play completion alarm</Text>
                  <Text style={styles.preferenceSubtitle}>Preview a sound by selecting it below.</Text>
                </View>
                <Switch value={alarmEnabled} onValueChange={setAlarmEnabled} trackColor={{ false: colors.border, true: colors.tomato }} />
              </View>
              {alarmEnabled && (
                <>
                  <Text style={styles.subLabel}>ALARM SOUND</Text>
                  <View style={styles.soundRow}>
                    {ALARM_SOUNDS.map((sound) => {
                      const selected = alarmSoundId === sound.id;
                      return (
                        <Pressable
                          key={sound.id}
                          onPress={() => { setAlarmSoundId(sound.id); previewAlarm(sound.id, alarmVolume); }}
                          style={({ pressed }) => [styles.soundChip, selected && styles.soundChipSelected, pressed && styles.pressed]}
                        >
                          <Ionicons name={selected ? "volume-high" : "musical-note"} size={14} color={selected ? colors.tomato : colors.textMuted} />
                          <Text style={[styles.soundChipText, selected && styles.soundChipTextSelected]}>{sound.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.subLabel}>VOLUME</Text>
                  <View style={styles.volumeRow}>
                    <Pressable
                      onPress={() => setAlarmVolume((value) => Math.max(0, Math.round((value - 0.1) * 10) / 10))}
                      style={({ pressed }) => [styles.volumeBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="remove" size={17} color={colors.text} />
                    </Pressable>
                    <View style={styles.volumeTrack}>
                      <View style={[styles.volumeFill, { width: `${alarmVolume * 100}%` }]} />
                    </View>
                    <Pressable
                      onPress={() => setAlarmVolume((value) => Math.min(1, Math.round((value + 0.1) * 10) / 10))}
                      style={({ pressed }) => [styles.volumeBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="add" size={17} color={colors.text} />
                    </Pressable>
                    <Text style={styles.volumePct}>{Math.round(alarmVolume * 100)}%</Text>
                  </View>
                </>
              )}
            </Card>
          </View>
        </View>
      </ScrollView>

      {hasUnsavedChanges && (
        <View style={[styles.stickyBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={styles.stickyCopy}>
            <View style={[styles.unsavedDot, { backgroundColor: colors.amber }]} />
            <Text style={styles.stickyText}>Unsaved profile & study changes</Text>
          </View>
          <View style={styles.stickyActions}>
            <Pressable onPress={discardChanges} disabled={saving} style={({ pressed }) => [styles.discardBtn, pressed && styles.pressed]}>
              <Text style={styles.discardText}>Discard</Text>
            </Pressable>
            <Pressable
              onPress={saveProfile}
              disabled={saving}
              style={({ pressed }) => [styles.saveChangesBtn, { backgroundColor: colors.tomato }, (pressed || saving) && styles.pressed]}
            >
              <Text style={styles.saveChangesText}>{saving ? "Saving…" : "Save changes"}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    page: {
      width: "100%",
      maxWidth: 1120,
      alignSelf: "center",
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
    },
    pageWithStickyBar: {
      paddingBottom: 96,
    },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    header: { marginBottom: SPACING.lg },
    headerTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    eyebrow: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
    headerTitle: {
      color: colors.text,
      fontSize: compact ? 25 : 30,
      lineHeight: compact ? 31 : 36,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    headerSubtitle: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4, maxWidth: 620 },
    accountHero: {
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 10 : 14,
      borderRadius: RADIUS.xl,
      marginBottom: 10,
      padding: compact ? 13 : 17,
    },
    avatarWrap: { position: "relative", flexShrink: 0 },
    avatar: {
      width: compact ? 58 : 70,
      height: compact ? 58 : 70,
      borderRadius: compact ? 19 : 23,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft },
    avatarInitial: { color: colors.violet, fontSize: compact ? 21 : 26, fontWeight: "900" },
    cameraBadge: {
      position: "absolute",
      right: -4,
      bottom: -4,
      width: 25,
      height: 25,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violet,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    accountCopy: { flex: 1, minWidth: 0 },
    publicProfileLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 8,
      alignSelf: "flex-start",
    },
    publicProfileLinkText: { color: colors.violet, fontSize: 12, fontWeight: "800" },
    accountName: { color: colors.text, fontSize: compact ? 15 : 18, fontWeight: "900" },
    accountEmail: { color: colors.textMuted, fontSize: compact ? 10.5 : 12, marginTop: 2 },
    accountBadges: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
    studentBadge: { backgroundColor: colors.violetSoft, borderRadius: RADIUS.pill, paddingVertical: 4, paddingHorizontal: 8 },
    studentBadgeText: { color: colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
    planBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingVertical: 3,
      paddingHorizontal: 7,
    },
    planBadgePremium: { borderColor: GOLD + "77", backgroundColor: GOLD + "14" },
    planBadgeText: { color: colors.textMuted, fontSize: 8.5, fontWeight: "800" },
    logoutBtn: {
      height: 39,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: compact ? 10 : 12,
      flexShrink: 0,
    },
    logoutText: { color: colors.tomato, fontSize: 11.5, fontWeight: "800" },
    subscriptionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 8 : 11,
      borderWidth: 1,
      borderColor: GOLD + "66",
      backgroundColor: colors.amberSoft,
      borderRadius: RADIUS.lg,
      padding: compact ? 11 : 13,
      marginBottom: 12,
    },
    subscriptionActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft },
    subscriptionIcon: {
      width: compact ? 38 : 43,
      height: compact ? 38 : 43,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      flexShrink: 0,
    },
    subscriptionCopy: { flex: 1, minWidth: 0 },
    subscriptionTitle: { color: colors.text, fontSize: compact ? 12.5 : 14, fontWeight: "900" },
    subscriptionMeta: { color: colors.textMuted, fontSize: compact ? 10 : 11.5, lineHeight: 16, marginTop: 2 },
    subscriptionBadge: {
      backgroundColor: GOLD,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    subscriptionBadgeActive: { backgroundColor: colors.mint },
    subscriptionBadgeText: { color: "#1A1400", fontSize: 8.5, fontWeight: "900", letterSpacing: 0.5 },
    settingsGrid: { flexDirection: isWide ? "row" : "column", alignItems: "flex-start", gap: 12 },
    settingsColumn: {
      flexGrow: isWide ? 1 : 0,
      flexShrink: isWide ? 1 : 0,
      flexBasis: isWide ? 0 : "auto",
      width: isWide ? undefined : "100%",
      minWidth: 0,
      gap: 12,
    },
    settingsCard: { width: "100%", borderRadius: RADIUS.lg, marginBottom: 0, padding: compact ? 13 : 16 },
    cardHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 15 },
    cardIcon: { width: 39, height: 39, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    cardHeadingCopy: { flex: 1, minWidth: 0 },
    cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    cardTitle: { color: colors.text, fontSize: 14.5, fontWeight: "900" },
    cardSubtitle: { color: colors.textMuted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },
    instantBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    instantBadgeText: { fontSize: 8.5, fontWeight: "900", letterSpacing: 0.3 },
    formRow: { flexDirection: compact ? "column" : "row", gap: compact ? 0 : 9, alignItems: "flex-start" },
    dropdownHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 13,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      marginTop: 4,
    },
    dropdownTitle: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    dropdownSummary: { color: colors.textMuted, fontSize: 10.5, marginTop: 3 },
    dropdownChevron: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft },
    expandedFields: { marginTop: 14 },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: RADIUS.md,
      padding: 11,
    },
    actionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.violetSoft },
    actionTitle: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    actionSubtitle: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },
    passwordActions: { flexDirection: compact ? "column" : "row", gap: 8, marginTop: 3 },
    passwordSaveBtn: { flex: compact ? undefined : 1, width: compact ? "100%" : undefined },
    cancelPasswordBtn: { width: compact ? "100%" : 115 },
    themeRow: { flexDirection: compact ? "column" : "row", gap: 7 },
    themeChip: {
      flex: 1,
      flexDirection: compact ? "row" : "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: compact ? 44 : 76,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      paddingHorizontal: 8,
    },
    themeChipSelected: { borderColor: colors.violet, backgroundColor: colors.violetSoft },
    themeChipText: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800" },
    themeChipTextSelected: { color: colors.violet },
    preferenceRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
    preferenceCopy: { flex: 1, minWidth: 0 },
    preferenceTitle: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    preferenceSubtitle: { color: colors.textMuted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },
    hint: { color: colors.textMuted, fontSize: 10.5, lineHeight: 16, marginTop: 7 },
    subLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7, marginTop: 15, marginBottom: 8 },
    soundRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    soundChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 8,
      paddingHorizontal: 11,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    soundChipSelected: { borderColor: colors.tomato, backgroundColor: colors.tomatoSoft },
    soundChipText: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800" },
    soundChipTextSelected: { color: colors.tomato },
    volumeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    volumeBtn: {
      width: 34,
      height: 34,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    volumeTrack: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    volumeFill: { height: "100%", borderRadius: 4, backgroundColor: colors.tomato },
    volumePct: { color: colors.textMuted, fontSize: 12, fontWeight: "700", width: 40, textAlign: "right" },
    stickyBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      borderTopWidth: 1,
      paddingHorizontal: SPACING.md,
      paddingTop: 12,
      paddingBottom: Platform.OS === "ios" ? 28 : 16,
      flexDirection: compact ? "column" : "row",
      alignItems: compact ? "stretch" : "center",
      gap: 10,
    },
    stickyCopy: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
    unsavedDot: { width: 8, height: 8, borderRadius: 4 },
    stickyText: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    stickyActions: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: compact ? "stretch" : "flex-end" },
    discardBtn: {
      minHeight: 42,
      paddingHorizontal: 14,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      flex: compact ? 1 : undefined,
    },
    discardText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "800" },
    saveChangesBtn: {
      minHeight: 42,
      minWidth: compact ? undefined : 132,
      paddingHorizontal: 18,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      flex: compact ? 1 : undefined,
    },
    saveChangesText: { color: "#fff", fontSize: 12.5, fontWeight: "900" },
  });
