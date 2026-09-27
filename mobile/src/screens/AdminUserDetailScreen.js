import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import UserAvatar from "../components/UserAvatar";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

const GOLD = "#FFC15E";
const GOLD_DEEP = "#E8A020";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function relative(value) {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function formatMinutes(total) {
  const mins = Number(total) || 0;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** A labelled row inside an info card. */
function InfoRow({ icon, label, value, colors, last }) {
  return (
    <View
      style={[
        rowStyles.row,
        { borderBottomColor: colors.border },
        last && { borderBottomWidth: 0 },
      ]}
    >
      <View style={rowStyles.iconSlot}>
        <Ionicons name={icon} size={15} color={colors.textMuted} />
      </View>
      <Text style={[rowStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[rowStyles.value, { color: colors.text }]} numberOfLines={3}>
        {value || "—"}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 11,
    borderBottomWidth: 1,
    gap: 10,
  },
  iconSlot: { width: 18, alignItems: "center", paddingTop: 2 },
  label: { fontSize: 12.5, width: 108 },
  value: { fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
});

/** A compact statistic tile. */
function StatTile({ icon, value, label, tone, colors, soft, wide }) {
  return (
    <View
      style={[
        tileStyles.tile,
        { backgroundColor: colors.surface, borderColor: colors.border },
        wide && tileStyles.tileWide,
      ]}
    >
      <View style={[tileStyles.iconWrap, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={15} color={tone} />
      </View>
      <Text style={[tileStyles.value, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[tileStyles.label, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const tileStyles = StyleSheet.create({
  tile: { flex: 1, minWidth: 96, borderWidth: 1, borderRadius: 14, padding: 11, gap: 1 },
  tileWide: { flex: 1 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  value: { fontSize: 17, fontWeight: "800" },
  label: { fontSize: 10.5, fontWeight: "600" },
});

export default function AdminUserDetailScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const s = useStyles(colors, width);

  const paramUser = route?.params?.user || null;
  const userId = route?.params?.userId || (paramUser && paramUser.id);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isWide = width >= 720;
  const isTablet = width >= 560 && width < 720;

  const load = useCallback(async () => {
    if (!userId) {
      setError("No student selected.");
      setLoading(false);
      return;
    }
    try {
      const { data: res } = await client.get(`/admin/users/${userId}`, { timeout: 20000 });
      setData(res);
      setError(null);
    } catch (e) {
      setError(e.message || "Could not load this student's profile.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Prefer the freshly fetched profile, falling back to the list row so the
  // header can render instantly while the detail request is in flight.
  const profile = (data && data.profile) || paramUser || {};
  const activity = (data && data.activity) || null;
  const statistics = (data && data.statistics) || null;
  const premium = (data && data.premium) || (paramUser && paramUser.premium) || { isPremium: false };
  const subscription = data && data.subscription;

  if (loading && !data) {
    return (
      <Screen>
        <View style={s.centerFill}>
          <ActivityIndicator color={colors.violet} />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>Loading profile…</Text>
        </View>
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <View style={s.centerFill}>
          <View style={[s.errorIcon, { backgroundColor: colors.tomatoSoft }]}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.tomato} />
          </View>
          <Text style={[s.errorTitle, { color: colors.text }]}>Could not load profile</Text>
          <Text style={[s.errorBody, { color: colors.textMuted }]}>{error}</Text>
          <Pressable onPress={load} style={[s.retryBtn, { backgroundColor: colors.tomato }]}>
            <Text style={s.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const isActive = profile.status === "ACTIVE";
  const avatarSize = isWide ? 132 : isTablet ? 116 : 96;
  const weeklyTrend = Array.isArray(statistics?.last7Days) ? statistics.last7Days : [];
  const weeklyMax = Math.max(1, ...weeklyTrend.map((day) => Number(day.minutes) || 0));

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: 44,
          maxWidth: isWide ? 880 : undefined,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {/* ---------------- Identity header ---------------- */}
        <View style={[s.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[s.heroInner, isWide && s.heroInnerWide]}>
            {/* Large, clearly visible avatar */}
            <View style={s.avatarWrap}>
              <UserAvatar
                user={profile}
                size={avatarSize}
                ringColor={premium.isPremium ? GOLD : colors.border}
                style={s.avatar}
              />
              {premium.isPremium && (
                <View style={[s.avatarCrown, { backgroundColor: GOLD, borderColor: colors.surface }]}>
                  <Text style={s.avatarCrownEmoji}>👑</Text>
                </View>
              )}
            </View>

            <View style={[s.identity, isWide && s.identityWide]}>
              <Text style={[s.name, { color: colors.text }]} numberOfLines={2}>
                {profile.name || "Unnamed student"}
              </Text>
              <Text style={[s.email, { color: colors.textMuted }]} numberOfLines={1}>
                {profile.email || "—"}
              </Text>

              <View style={s.badgeRow}>
                <View style={[s.badge, { borderColor: colors.violet, backgroundColor: colors.violetSoft }]}>
                  <Text style={[s.badgeText, { color: colors.violet }]}>{profile.role || "STUDENT"}</Text>
                </View>

                <View
                  style={[
                    s.badge,
                    {
                      borderColor: isActive ? colors.mint : colors.tomato,
                      backgroundColor: isActive ? colors.mintSoft : colors.tomatoSoft,
                    },
                  ]}
                >
                  <Text style={[s.badgeText, { color: isActive ? colors.mint : colors.tomato }]}>
                    {isActive ? "Active" : "Disabled"}
                  </Text>
                </View>

                <View
                  style={[
                    s.badge,
                    {
                      borderColor: premium.isPremium ? GOLD : colors.border,
                      backgroundColor: premium.isPremium ? GOLD + "1F" : "transparent",
                    },
                  ]}
                >
                  {premium.isPremium && <Ionicons name="star" size={10} color={GOLD} />}
                  <Text style={[s.badgeText, { color: premium.isPremium ? GOLD_DEEP : colors.textMuted }]}>
                    {premium.isPremium ? "Go Unlimited" : "Basic"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ---------------- Activity snapshot ---------------- */}
        {activity && (
          <>
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>STUDY ACTIVITY</Text>
            <View style={s.tileGrid}>
              <StatTile
                wide={isWide}
                icon="today"
                value={formatMinutes(activity.todayMinutes)}
                label="Focused today"
                tone={colors.violet}
                soft={colors.violetSoft}
                colors={colors}
              />
              <StatTile
                wide={isWide}
                icon="calendar"
                value={formatMinutes(activity.last7Minutes)}
                label={`${activity.activeDaysLast7 || 0}/7 active days`}
                tone={colors.mint}
                soft={colors.mintSoft}
                colors={colors}
              />
              <StatTile
                wide={isWide}
                icon="time"
                value={formatMinutes(activity.totalStudyMinutes)}
                label="Focus time"
                tone={colors.violet}
                soft={colors.violetSoft}
                colors={colors}
              />
              <StatTile
                wide={isWide}
                icon="timer"
                value={activity.focusSessions}
                label="Focus sessions"
                tone={colors.amber}
                soft={colors.amberSoft}
                colors={colors}
              />
              <StatTile
                wide={isWide}
                icon="flame"
                value={activity.streak}
                label="Day streak"
                tone={colors.tomato}
                soft={colors.tomatoSoft}
                colors={colors}
              />
              <StatTile
                wide={isWide}
                icon="flash"
                value={activity.xp}
                label="XP earned"
                tone={colors.amber}
                soft={colors.amberSoft}
                colors={colors}
              />
              <StatTile
                wide={isWide}
                icon="checkbox"
                value={`${activity.completionRate}%`}
                label={`Tasks (${activity.tasksCompleted}/${activity.tasksTotal})`}
                tone={colors.mint}
                soft={colors.mintSoft}
                colors={colors}
              />
              <StatTile
                wide={isWide}
                icon="trophy"
                value={activity.averageQuizScore ? `${activity.averageQuizScore}%` : "—"}
                label={`Quiz avg (${activity.quizAttempts})`}
                tone={colors.violet}
                soft={colors.violetSoft}
                colors={colors}
              />
              <StatTile
                wide={isWide}
                icon="albums"
                value={activity.flashcards}
                label="Flashcards"
                tone={colors.mint}
                soft={colors.mintSoft}
                colors={colors}
              />
            </View>
          </>
        )}

        {statistics && Array.isArray(statistics.subjects) && statistics.subjects.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>SUBJECT BREAKDOWN</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {statistics.subjects.map((subject, index) => (
                <View
                  key={subject.id || subject.name}
                  style={[
                    s.subjectStatRow,
                    { borderBottomColor: colors.border },
                    index === statistics.subjects.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={s.subjectStatTop}>
                    <Text style={[s.subjectStatName, { color: colors.text }]} numberOfLines={1}>
                      {subject.name}
                    </Text>
                    <Text style={[s.subjectStatValue, { color: colors.textMuted }]}>
                      {formatMinutes(subject.minutes)} · {subject.percentage}%
                    </Text>
                  </View>
                  <View style={[s.subjectTrack, { backgroundColor: colors.bg }]}>
                    <View
                      style={[
                        s.subjectFill,
                        {
                          width: `${Math.min(100, subject.percentage || 0)}%`,
                          backgroundColor: colors.violet,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {weeklyTrend.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>LAST 7 DAYS</Text>
            <View style={[s.card, s.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.trendSummary}>
                <View>
                  <Text style={[s.trendTitle, { color: colors.text }]}>Focus activity</Text>
                  <Text style={[s.trendSubtitle, { color: colors.textMuted }]}>
                    {activity?.activeDaysLast7 || 0} active day{activity?.activeDaysLast7 === 1 ? "" : "s"} this week
                  </Text>
                </View>
                <Text style={[s.trendTotal, { color: colors.violet }]}>
                  {formatMinutes(activity?.last7Minutes)}
                </Text>
              </View>
              <View style={s.trendChart}>
                {weeklyTrend.map((day) => {
                  const minutes = Number(day.minutes) || 0;
                  const barHeight = minutes ? Math.max(8, Math.round((minutes / weeklyMax) * 100)) : 3;
                  return (
                    <View key={day.date} style={s.trendColumn}>
                      <Text style={[s.trendMinutes, { color: colors.textMuted }]}>
                        {minutes ? `${minutes}m` : "—"}
                      </Text>
                      <View style={[s.trendTrack, { backgroundColor: colors.bg }]}>
                        <View
                          style={[
                            s.trendBar,
                            {
                              height: `${barHeight}%`,
                              backgroundColor: minutes ? colors.violet : colors.border,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[s.trendDay, { color: colors.textMuted }]}>
                        {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* ---------------- Two-column detail area on wide screens ---------------- */}
        <View style={isWide ? s.columns : null}>
          <View style={isWide ? s.column : null}>
            {/* Academic / profile information */}
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>STUDENT INFORMATION</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <InfoRow icon="id-card-outline" label="Student ID" value={profile.studentId} colors={colors} />
              <InfoRow icon="school-outline" label="Course" value={profile.course} colors={colors} />
              <InfoRow icon="layers-outline" label="Year level" value={profile.yearLevel} colors={colors} />
              <InfoRow icon="people-outline" label="Section" value={profile.section} colors={colors} />
              <InfoRow icon="mail-outline" label="Email" value={profile.email} colors={colors} />
            </View>

            {/* Study preferences */}
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>STUDY PREFERENCES</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <InfoRow
                icon="flag-outline"
                label="Daily goal"
                value={profile.dailyGoalMinutes ? `${profile.dailyGoalMinutes} minutes` : null}
                colors={colors}
              />
              <InfoRow
                icon="timer-outline"
                label="Focus length"
                value={profile.preferredStudyDuration ? `${profile.preferredStudyDuration} minutes` : null}
                colors={colors}
              />
              <InfoRow
                icon="notifications-outline"
                label="Reminders"
                value={
                  profile.remindersEnabled === false
                    ? "Off"
                    : profile.reminderTime
                    ? `On · ${profile.reminderTime}`
                    : "On"
                }
                colors={colors}
                last
              />
            </View>
          </View>

          <View style={isWide ? s.column : null}>
            {/* Subscription */}
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>SUBSCRIPTION</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.statusRow}>
                <View
                  style={[
                    s.statusPill,
                    {
                      borderColor: premium.isPremium ? GOLD : colors.border,
                      backgroundColor: premium.isPremium ? GOLD + "1F" : "transparent",
                    },
                  ]}
                >
                  {premium.isPremium && <Ionicons name="star" size={11} color={GOLD} />}
                  <Text style={[s.statusPillText, { color: premium.isPremium ? GOLD_DEEP : colors.textMuted }]}>
                    {premium.isPremium ? "Go Unlimited" : "Basic"}
                  </Text>
                </View>
                {premium.isPremium && (
                  <Text style={[s.daysLeft, { color: colors.mint }]}>
                    {premium.daysRemaining} day{premium.daysRemaining === 1 ? "" : "s"} left
                  </Text>
                )}
              </View>

              <InfoRow
                icon="calendar-outline"
                label="Member since"
                value={premium.premiumSince ? formatDate(premium.premiumSince) : "—"}
                colors={colors}
              />
              <InfoRow
                icon="refresh-outline"
                label="Renews"
                value={premium.premiumUntil ? formatDate(premium.premiumUntil) : "—"}
                colors={colors}
              />
              <InfoRow
                icon="shield-checkmark-outline"
                label="Plan status"
                value={subscription ? subscription.status : premium.isPremium ? "ACTIVE" : "—"}
                colors={colors}
                last
              />
            </View>

            {/* Account */}
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>ACCOUNT</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <InfoRow icon="person-outline" label="Account type" value={profile.role} colors={colors} />
              <InfoRow
                icon="checkmark-circle-outline"
                label="Status"
                value={isActive ? "Active" : "Disabled"}
                colors={colors}
              />
              <InfoRow icon="calendar-outline" label="Joined" value={formatDate(profile.createdAt)} colors={colors} />
              <InfoRow
                icon="pulse-outline"
                label="Last active"
                value={activity && activity.lastSessionAt ? relative(activity.lastSessionAt) : relative(profile.lastActiveAt)}
                colors={colors}
                last
              />
            </View>
          </View>
        </View>

        {/* Goals — shown only when the student set them */}
        {!!profile.studyGoals && (
          <>
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>STUDY GOALS</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.goals, { color: colors.text }]}>{profile.studyGoals}</Text>
            </View>
          </>
        )}

        {/* AI usage */}
        {activity && (
          <>
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>AI USAGE</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <InfoRow
                icon="chatbubbles-outline"
                label="AI conversations"
                value={String(activity.aiConversations)}
                colors={colors}
              />
              <InfoRow icon="chatbox-outline" label="AI messages" value={String(activity.aiMessages)} colors={colors} />
              <InfoRow icon="document-text-outline" label="Notes" value={String(activity.notes)} colors={colors} last />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors, width) => {
  const compact = width < 400;
  return StyleSheet.create({
    centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
    loadingText: { fontSize: 13, marginTop: 12 },
    errorIcon: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    errorTitle: { fontSize: 16, fontWeight: "800", marginTop: 14 },
    errorBody: { fontSize: 12.5, lineHeight: 19, textAlign: "center", marginTop: 6, maxWidth: 320 },
    retryBtn: { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12, marginTop: 18 },
    retryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13.5 },

    hero: {
      borderWidth: 1,
      borderRadius: 20,
      padding: compact ? 16 : 20,
      marginBottom: 6,
    },
    heroInner: { alignItems: "center" },
    heroInnerWide: { flexDirection: "row", alignItems: "center", gap: 24 },
    avatarWrap: { position: "relative" },
    avatar: {
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    avatarCrown: {
      position: "absolute",
      right: -6,
      bottom: -6,
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarCrownEmoji: { fontSize: 15 },
    identity: { alignItems: "center", marginTop: 14 },
    identityWide: { alignItems: "flex-start", marginTop: 0, flex: 1 },
    name: {
      fontSize: compact ? 20 : 23,
      fontWeight: "800",
      letterSpacing: -0.4,
      textAlign: "center",
    },
    email: { fontSize: 13, marginTop: 4, textAlign: "center" },
    badgeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 12,
      justifyContent: "center",
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgeText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.3 },

    sectionLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.9,
      marginTop: 20,
      marginBottom: 9,
    },
    tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    columns: { flexDirection: "row", gap: 20, alignItems: "flex-start" },
    column: { flex: 1, minWidth: 0 },
    card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 2 },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 12,
      paddingBottom: 8,
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    statusPillText: { fontSize: 11, fontWeight: "800" },
    daysLeft: { fontSize: 11.5, fontWeight: "700" },
    goals: { fontSize: 13.5, lineHeight: 21, paddingVertical: 14 },
    subjectStatRow: { paddingVertical: 12, borderBottomWidth: 1 },
    subjectStatTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    subjectStatName: { flex: 1, fontSize: 12.5, fontWeight: "700" },
    subjectStatValue: { fontSize: 10.5, fontWeight: "700" },
    subjectTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 8 },
    subjectFill: { height: "100%", borderRadius: 3 },
    trendCard: { paddingVertical: 14 },
    trendSummary: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
    trendTitle: { fontSize: 13.5, fontWeight: "800" },
    trendSubtitle: { fontSize: 10.5, fontWeight: "600", marginTop: 3 },
    trendTotal: { fontSize: 17, fontWeight: "900" },
    trendChart: { height: 132, flexDirection: "row", alignItems: "flex-end", gap: compact ? 5 : 9, marginTop: 16 },
    trendColumn: { flex: 1, height: "100%", alignItems: "center" },
    trendMinutes: { height: 17, fontSize: compact ? 7.5 : 9, fontWeight: "700" },
    trendTrack: { flex: 1, width: "65%", minWidth: 13, maxWidth: 28, borderRadius: 7, overflow: "hidden", justifyContent: "flex-end" },
    trendBar: { width: "100%", borderRadius: 7 },
    trendDay: { height: 18, fontSize: 9.5, fontWeight: "800", marginTop: 5 },
  });
};
