import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Share,
  Platform,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import UserAvatar from "../components/UserAvatar";
import StudentCard from "../components/StudentCard";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { RADIUS } from "../theme/theme";
import { startDeckQuiz, startNoteQuiz } from "../lib/publicStudy";
import StatsScreen from "./StatsScreen";
import NotificationBell from "../components/NotificationBell";
import { refreshFriends } from "../lib/friends";
import { VisibilityBadge } from "../components/VisibilityPicker";
import SchoolLogo from "../components/SchoolLogo";
import { useScrollToTopOnFocus } from "../hooks/useScrollToTopOnFocus";

const DECKS_KINDS = [
  { key: "notes", label: "Notes", icon: "document-text-outline" },
  { key: "cards", label: "Cards", icon: "layers-outline" },
];

const TABS = [
  { key: "feed", label: "Feed", icon: "newspaper-outline" },
  { key: "stats", label: "Stats", icon: "stats-chart-outline" },
  { key: "decks", label: "Decks", icon: "albums-outline" },
  { key: "school", label: "School", icon: "school-outline" },
];

function timeAgo(value) {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function StudentProfileScreen({ route, navigation }) {
  const { user: me } = useAuth();
  const userId = route?.params?.userId || me?.id;
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isPhone = width < 560;
  const compact = width < 390;
  const headerHeight = useHeaderHeight();
  const styles = useMemo(
    () => createStyles(colors, isWide, isPhone, compact, headerHeight > 0),
    [colors, isWide, isPhone, compact, headerHeight]
  );
  const scrollRef = useScrollToTopOnFocus();

  const [tab, setTab] = useState(route?.params?.tab || "feed");
  const [profile, setProfile] = useState(null);
  const [publicNotes, setPublicNotes] = useState([]);
  const [publicCollections, setPublicCollections] = useState([]);
  const [ownNotes, setOwnNotes] = useState([]);
  const [ownCollections, setOwnCollections] = useState([]);
  const [decksKind, setDecksKind] = useState("notes");
  const [decksLoading, setDecksLoading] = useState(false);
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [suggestBusy, setSuggestBusy] = useState(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const [{ data: profileData }, { data: feedData }] = await Promise.all([
        client.get(`/students/${userId}/profile`),
        client.get(`/students/${userId}/feed`),
      ]);
      setProfile(profileData.profile);
      setPublicNotes(profileData.publicNotes || []);
      setPublicCollections(profileData.publicCollections || []);
      setFeed(feedData);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load profile.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const loadOwnLibrary = useCallback(async () => {
    if (!userId || userId !== me?.id) return;
    setDecksLoading(true);
    try {
      const [{ data: notesData }, { data: decksData }] = await Promise.all([
        client.get("/notes"),
        client.get("/flashcards/collections"),
      ]);
      setOwnNotes(notesData.notes || []);
      setOwnCollections(decksData.collections || []);
    } catch {
      setOwnNotes([]);
      setOwnCollections([]);
    } finally {
      setDecksLoading(false);
    }
  }, [userId, me?.id]);

  useFocusEffect(useCallback(() => { fetchAll(true); }, [fetchAll]));

  useEffect(() => {
    if (tab === "decks" && userId === me?.id) {
      loadOwnLibrary();
    }
  }, [tab, userId, me?.id, loadOwnLibrary]);

  const isOwnProfile = profile?.id === me?.id;
  const showInlineBack =
    !isOwnProfile && Boolean(navigation.canGoBack?.()) && headerHeight < 1;

  const shareProfile = async () => {
    const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "https://focusflow.app";
    const url = `${origin}/?profile=${profile.id}`;
    const message = `Follow ${profile.name} on PomodAI\n${url}`;
    try {
      await Share.share({ message, url, title: profile.name });
    } catch {
      Alert.alert("Profile link", url);
    }
  };

  const toggleFollow = async () => {
    if (!profile || isOwnProfile) return;
    setFollowBusy(true);
    try {
      const { data } = profile.isFollowing
        ? await client.delete(`/students/${profile.id}/follow`)
        : await client.post(`/students/${profile.id}/follow`);
      setProfile((current) => ({
        ...current,
        isFollowing: Boolean(data.isFollowing),
        followers: data.followers ?? current.followers,
        following: data.following ?? current.following,
      }));
      if (me?.id) refreshFriends(me.id).catch(() => {});
    } catch (e) {
      Alert.alert("Follow failed", e?.response?.data?.error || e.message);
    } finally {
      setFollowBusy(false);
    }
  };

  const reactToActivity = async (activity) => {
    try {
      const { data } = await client.post(`/students/activities/${activity.id}/react`);
      setFeed((current) => ({
        ...current,
        activities: (current?.activities || []).map((row) =>
          row.id === activity.id ? { ...row, heartCount: data.heartCount, reactedByMe: data.reactedByMe } : row
        ),
      }));
    } catch {
      // ignore
    }
  };

  const followSuggestion = async (student) => {
    setSuggestBusy(student.id);
    try {
      if (student.isFollowing) await client.delete(`/students/${student.id}/follow`);
      else await client.post(`/students/${student.id}/follow`);
      setFeed((current) => ({
        ...current,
        suggestions: (current?.suggestions || []).map((row) =>
          row.id === student.id ? { ...row, isFollowing: !row.isFollowing } : row
        ),
        schoolmates: (current?.schoolmates || []).map((row) =>
          row.id === student.id ? { ...row, isFollowing: !row.isFollowing } : row
        ),
      }));
      if (me?.id) refreshFriends(me.id).catch(() => {});
      if (isOwnProfile) fetchAll(true);
    } finally {
      setSuggestBusy(null);
    }
  };

  const go = (screen, params) => {
    const names = navigation.getState?.()?.routeNames || [];
    if (names.includes(screen)) {
      navigation.navigate(screen, params);
      return;
    }
    navigation.navigate("Profile", { screen, params });
  };

  const openStudent = (student) => {
    if (navigation.push && (navigation.getState?.()?.routeNames || []).includes("StudentProfile")) {
      navigation.push("StudentProfile", { userId: student.id, name: student.name });
      return;
    }
    go("StudentProfile", { userId: student.id, name: student.name });
  };

  const openSchool = () => {
    const schoolRecord = profile?.schoolRecord || feed?.schoolRecord;
    const school = schoolRecord?.name || profile?.school || feed?.school;
    if (!school && isOwnProfile) {
      go("Settings");
      return;
    }
    if (school || schoolRecord?.id) {
      go("SchoolHub", { school, schoolId: schoolRecord?.id || profile?.schoolId });
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAll(true);
    if (userId === me?.id) loadOwnLibrary();
  };

  if (loading && !profile) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.violet} size="large" />
          <Text style={styles.centerText}>Loading profile…</Text>
        </View>
      </Screen>
    );
  }

  if (error && !profile) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="person-outline" size={28} color={colors.violet} />
          </View>
          <Text style={styles.errorTitle}>{error}</Text>
          <Pressable onPress={() => fetchAll()} style={styles.retryBtn}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const renderEmpty = (icon, title, copy) => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color={colors.violet} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );

  const renderSection = (title, children, extra, icon) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          {icon ? <Ionicons name={icon} size={14} color={colors.violet} /> : null}
          <Text style={styles.sectionLabel}>{title}</Text>
        </View>
        {extra}
      </View>
      {children}
    </View>
  );

  const renderFeed = () => {
    const friends = feed?.friendsLeaderboard || [];
    const activities = feed?.activities || [];
    return (
      <View style={styles.tabBody}>
        {friends.length ? renderSection(
          "Friends leaderboard",
          friends.slice(0, 5).map((student) => (
            <StudentCard nested key={student.id} student={student} colors={colors} rank={student.rank} onPress={() => openStudent(student)} />
          )),
          null,
          "trophy-outline"
        ) : null}

        {renderSection(
          "Activity",
          activities.length ? activities.map((activity) => (
            <View key={activity.id} style={styles.activityCard}>
              <View style={[styles.blockIcon, { backgroundColor: activity.type === "streak" ? colors.amberSoft : colors.violetSoft }]}>
                <Ionicons
                  name={activity.type === "streak" ? "flame" : "sparkles-outline"}
                  size={16}
                  color={activity.type === "streak" ? colors.amber : colors.violet}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.blockTitle} numberOfLines={2}>{activity.title}</Text>
                <Text style={styles.timeAgo}>{timeAgo(activity.createdAt)}</Text>
              </View>
              <Pressable onPress={() => reactToActivity(activity)} style={styles.heartBtn} accessibilityLabel="React to activity">
                <Ionicons name={activity.reactedByMe ? "heart" : "heart-outline"} size={17} color="#FF5A76" />
                <Text style={styles.heartCount}>{activity.heartCount || 0}</Text>
              </Pressable>
            </View>
          )) : renderEmpty(
            "sparkles-outline",
            "No activity yet",
            isOwnProfile
              ? "Your study streaks and wins will appear here for friends to see."
              : "This student has not posted any study activity yet."
          ),
          null,
          "pulse-outline"
        )}
      </View>
    );
  };

  const openStudyDeck = (deck, readOnly = false) => {
    navigation.navigate("Study", {
      screen: "FlashcardCollection",
      params: { collection: deck, readOnly },
    });
  };

  const openStudyNote = (noteId, readOnly = false) => {
    navigation.navigate("Study", {
      screen: "NoteView",
      params: { noteId, readOnly },
    });
  };

  const renderDeckRow = (data, { keyPrefix = "deck", readOnly = false, showVisibility = false }) => (
    <Pressable
      key={`${keyPrefix}-${data.id}`}
      onPress={() => openStudyDeck(data, readOnly)}
      style={styles.contentCard}
    >
      <View style={[styles.blockIcon, { backgroundColor: colors.mintSoft }]}>
        <Ionicons name="layers-outline" size={16} color={colors.mint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.blockTitle} numberOfLines={1}>{data.name || "Untitled deck"}</Text>
        <Text style={styles.blockMeta}>{`${data._count?.flashcards || 0} cards`}</Text>
      </View>
      {showVisibility ? <VisibilityBadge isPublic={data.isPublic} colors={colors} /> : null}
      <Pressable
        onPress={() =>
          startDeckQuiz(navigation, data, {
            onStart: (id) => setBusyId(`deck:${id}`),
            onFinish: () => setBusyId(null),
          })
        }
        style={styles.quizBtn}
        accessibilityLabel="Start quiz from deck"
      >
        {busyId === `deck:${data.id}` ? (
          <ActivityIndicator size="small" color={colors.tomato} />
        ) : (
          <Ionicons name="play" size={14} color={colors.tomato} />
        )}
      </Pressable>
    </Pressable>
  );

  const renderNoteRow = (data, { keyPrefix = "note", readOnly = false, showVisibility = false }) => {
    const isAi = data.source === "ai";
    return (
      <Pressable
        key={`${keyPrefix}-${data.id}`}
        onPress={() => openStudyNote(data.id, readOnly)}
        style={styles.contentCard}
      >
        <View style={[styles.blockIcon, { backgroundColor: isAi ? colors.violetSoft : colors.amberSoft }]}>
          <Ionicons
            name={isAi ? "sparkles" : "document-text-outline"}
            size={16}
            color={isAi ? colors.violet : colors.amber}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.blockTitle} numberOfLines={1}>{data.title || "Untitled note"}</Text>
          <Text style={styles.blockMeta}>{isAi ? "AI note" : "Note"}</Text>
        </View>
        {showVisibility ? <VisibilityBadge isPublic={data.isPublic} colors={colors} /> : null}
        <Pressable
          onPress={() =>
            startNoteQuiz(navigation, data, {
              onStart: (id) => setBusyId(`note:${id}`),
              onFinish: () => setBusyId(null),
            })
          }
          style={styles.quizBtn}
          accessibilityLabel="Start quiz from note"
        >
          {busyId === `note:${data.id}` ? (
            <ActivityIndicator size="small" color={colors.tomato} />
          ) : (
            <Ionicons name="play" size={14} color={colors.tomato} />
          )}
        </Pressable>
      </Pressable>
    );
  };

  const renderDecks = () => {
    if (isOwnProfile) {
      const notes = ownNotes;
      const cards = ownCollections;
      const activeList = decksKind === "notes" ? notes : cards;
      return (
        <View style={styles.tabBody}>
          <View style={styles.decksKindTabs}>
            {DECKS_KINDS.map((item) => {
              const on = decksKind === item.key;
              const count = item.key === "notes" ? notes.length : cards.length;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setDecksKind(item.key)}
                  style={[styles.decksKindTab, on && styles.decksKindTabOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Ionicons name={item.icon} size={15} color={on ? colors.violet : colors.textMuted} />
                  <Text style={[styles.decksKindText, on && styles.decksKindTextOn]}>{item.label}</Text>
                  <View style={[styles.countPill, on && styles.countPillOn]}>
                    <Text style={[styles.countPillText, on && styles.countPillTextOn]}>{count}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {decksLoading && !activeList.length ? (
            <ActivityIndicator color={colors.violet} style={{ marginVertical: 16 }} />
          ) : (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHead}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons
                    name={decksKind === "notes" ? "document-text-outline" : "layers-outline"}
                    size={14}
                    color={colors.violet}
                  />
                  <Text style={styles.sectionLabel}>
                    {decksKind === "notes" ? "Your notes" : "Your flashcard decks"}
                  </Text>
                </View>
              </View>
              {activeList.length ? (
                decksKind === "notes"
                  ? notes.map((note) => renderNoteRow(note, { showVisibility: true }))
                  : cards.map((deck) => renderDeckRow(deck, { showVisibility: true }))
              ) : renderEmpty(
                decksKind === "notes" ? "document-text-outline" : "albums-outline",
                decksKind === "notes" ? "No notes yet" : "No decks yet",
                decksKind === "notes"
                  ? "Create a note from Study or Files and it will show up here."
                  : "Create a flashcard deck from Study or Files and it will show up here."
              )}
            </View>
          )}
        </View>
      );
    }

    const items = [
      ...publicCollections.map((deck) => ({ kind: "deck", data: deck })),
      ...publicNotes.map((note) => ({ kind: "note", data: note })),
    ];
    return (
      <View style={styles.tabBody}>
        {renderSection(
          "Public study",
          items.length ? items.map((item) => (
            item.kind === "deck"
              ? renderDeckRow(item.data, { keyPrefix: "public-deck", readOnly: true })
              : renderNoteRow(item.data, { keyPrefix: "public-note", readOnly: true })
          )) : renderEmpty(
            "book-outline",
            "Nothing public yet",
            "No public study materials have been shared on this profile."
          ),
          null,
          "book-outline"
        )}
      </View>
    );
  };

  const renderSchool = () => {
    const selfId = me?.id || userId;
    const people = [...(feed?.suggestions || []), ...(feed?.schoolmates || [])]
      .filter((student) => student?.id && student.id !== selfId)
      .filter((student) => !student.isFollowing)
      .filter((student, index, list) => list.findIndex((row) => row.id === student.id) === index)
      .slice(0, 6);
    const schoolRecord = profile?.schoolRecord || feed?.schoolRecord;
    const schoolName = schoolRecord?.name || profile?.school || "Add your school";
    return (
      <View style={styles.tabBody}>
        <Pressable onPress={openSchool} style={styles.schoolHero}>
          <SchoolLogo school={schoolRecord} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>{schoolRecord?.name || profile?.school ? "Your campus" : "Set up school"}</Text>
            <Text style={styles.schoolHeroTitle} numberOfLines={1}>{schoolName}</Text>
            <Text style={styles.schoolHeroMeta} numberOfLines={2}>
              {[
                schoolRecord?.location && !/^unknown( location)?$/i.test(String(schoolRecord.location).trim())
                  ? schoolRecord.location
                  : null,
                schoolRecord?.typeLabel,
                profile?.course,
              ].filter(Boolean).join(" · ")
                || (schoolRecord?.name || profile?.school
                  ? "Browse decks and classmates"
                  : "Add school in Settings to find classmates")}
            </Text>
          </View>
          <View style={styles.schoolCta}>
            <Text style={styles.viewAll}>{schoolRecord?.name || profile?.school ? "Open" : "Set up"}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.violet} />
          </View>
        </Pressable>

        {(feed?.schoolDecks || []).length ? renderSection(
          "School decks",
          feed.schoolDecks.slice(0, 4).map((deck) => (
            <Pressable
              key={deck.id}
              onPress={() => navigation.navigate("Study", { screen: "FlashcardCollection", params: { collection: deck, readOnly: true } })}
              style={styles.contentCard}
            >
              <View style={[styles.blockIcon, { backgroundColor: colors.mintSoft }]}>
                <Ionicons name="layers-outline" size={16} color={colors.mint} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.blockTitle} numberOfLines={1}>{deck.name}</Text>
                <Text style={styles.blockMeta} numberOfLines={1}>{deck.user?.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          )),
          <Pressable onPress={openSchool} hitSlop={8} style={styles.sectionLink}>
            <Text style={styles.viewAll}>View all</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.violet} />
          </Pressable>,
          "layers-outline"
        ) : null}

        {renderSection(
          "People to follow",
          people.length ? people.map((student) => (
            <StudentCard
              nested
              key={student.id}
              student={student}
              colors={colors}
              following={student.isFollowing}
              followBusy={suggestBusy === student.id}
              onFollow={() => followSuggestion(student)}
              onPress={() => openStudent(student)}
            />
          )) : renderEmpty(
            "people-outline",
            "No classmates yet",
            "Students from the same school will show up here."
          ),
          null,
          "people-outline"
        )}
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <View style={styles.heroBanner} />
          <View style={styles.heroTop}>
            {showInlineBack ? (
              <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Go back">
                <Ionicons name="chevron-back" size={18} color={colors.text} />
              </Pressable>
            ) : (
              <View style={styles.heroTopSpacer} />
            )}
            <View style={styles.heroActions}>
              {isOwnProfile ? <NotificationBell /> : null}
              <Pressable onPress={shareProfile} style={styles.iconBtn} accessibilityLabel="Share profile">
                <Ionicons name="share-outline" size={16} color={colors.text} />
              </Pressable>
              {isOwnProfile ? (
                <Pressable onPress={() => go("Settings")} style={styles.iconBtn} accessibilityLabel="Open settings">
                  <Ionicons name="settings-outline" size={18} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.identityRow}>
            <View style={styles.avatarRing}>
              <UserAvatar user={profile} size={compact ? 64 : 72} ringColor={colors.violet} />
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.name} numberOfLines={1}>{profile?.name || "Student"}</Text>
              <View style={styles.schoolLineRow}>
                <SchoolLogo school={profile?.schoolRecord} size={18} />
                <Text style={styles.schoolLine} numberOfLines={1}>
                  {[profile?.schoolRecord?.name || profile?.school, profile?.course].filter(Boolean).join(" · ") || "Add school and course"}
                </Text>
              </View>
              <View style={styles.counts}>
                <Pressable onPress={() => go("FollowList", { userId: profile.id, mode: "followers", name: profile.name })} style={styles.countChip}>
                  <Text style={styles.countValue}>{profile?.followers || 0}</Text>
                  <Text style={styles.countLabel}>Followers</Text>
                </Pressable>
                <Pressable onPress={() => go("FollowList", { userId: profile.id, mode: "following", name: profile.name })} style={styles.countChip}>
                  <Text style={styles.countValue}>{profile?.following || 0}</Text>
                  <Text style={styles.countLabel}>Following</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.actionRow}>
            {isOwnProfile ? (
              <Pressable onPress={() => go("FindFriends")} style={[styles.primaryBtn, styles.actionBtn]}>
                <Ionicons name="person-add-outline" size={15} color="#fff" />
                <Text style={styles.primaryBtnText}>Find friends</Text>
              </Pressable>
            ) : (
              <Pressable onPress={toggleFollow} disabled={followBusy} style={[profile?.isFollowing ? styles.secondaryBtn : styles.primaryBtn, styles.actionBtn]}>
                <Ionicons
                  name={profile?.isFollowing ? "checkmark" : "person-add-outline"}
                  size={15}
                  color={profile?.isFollowing ? colors.text : "#fff"}
                />
                <Text style={profile?.isFollowing ? styles.secondaryText : styles.primaryBtnText}>
                  {followBusy ? "…" : profile?.isFollowing ? "Following" : "Follow"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.tabs}>
          {TABS.map((item) => {
            const on = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={item.icon} size={compact ? 15 : 16} color={on ? colors.violet : colors.textMuted} />
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "stats" ? (
          <View style={styles.statsPane}>
            <StatsScreen
              embedded
              userId={isOwnProfile ? null : userId}
              subjectName={profile?.name}
            />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.contentScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={styles.page}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.violet}
              />
            }
          >
            {tab === "feed" ? renderFeed() : null}
            {tab === "decks" ? renderDecks() : null}
            {tab === "school" ? renderSchool() : null}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const createStyles = (colors, isWide, isPhone, compact, stackHeaderVisible) =>
  StyleSheet.create({
    shell: {
      flex: 1,
      minHeight: 0,
      width: "100%",
      maxWidth: isWide ? 880 : 720,
      alignSelf: "center",
    },
    contentScroll: { flex: 1, minHeight: 0 },
    statsPane: { flex: 1, minHeight: 0 },
    page: {
      width: "100%",
      paddingTop: 4,
      paddingBottom: 40,
    },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24 },
    centerText: { color: colors.textMuted },
    errorTitle: { color: colors.text, fontWeight: "800", textAlign: "center" },
    hero: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: compact ? 12 : 14,
      marginTop: stackHeaderVisible ? 4 : 8,
      marginBottom: 10,
      overflow: "hidden",
    },
    heroBanner: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: compact ? 44 : 52,
      backgroundColor: colors.violetSoft,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: compact ? 10 : 14,
      minHeight: 36,
    },
    heroTopSpacer: { width: 36, height: 36 },
    heroActions: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    identityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    avatarRing: {
      padding: 3,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.violet,
    },
    identityCopy: { flex: 1, minWidth: 0 },
    name: { color: colors.text, fontSize: compact ? 19 : 22, fontWeight: "800" },
    schoolLineRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    schoolLine: { color: colors.textMuted, fontSize: 12.5, flex: 1 },
    counts: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" },
    countChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    countValue: { color: colors.text, fontSize: 13, fontWeight: "800" },
    countLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    actionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
    actionBtn: { flex: 1 },
    retryBtn: {
      minHeight: 42,
      borderRadius: 12,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    primaryBtn: {
      minHeight: 42,
      borderRadius: 12,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
    },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
    secondaryBtn: {
      minHeight: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
    },
    secondaryText: { color: colors.text, fontWeight: "800", fontSize: 13 },
    tabs: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 4,
      marginBottom: 10,
      gap: 2,
      flexShrink: 0,
    },
    tab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      paddingVertical: compact ? 7 : 8,
      borderRadius: 11,
    },
    tabOn: { backgroundColor: colors.violetSoft },
    tabText: { color: colors.textMuted, fontSize: isPhone ? 10.5 : 12, fontWeight: "800" },
    tabTextOn: { color: colors.violet },
    tabBody: { gap: 10 },
    decksKindTabs: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 4,
      gap: 4,
    },
    decksKindTab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 9,
      borderRadius: 11,
    },
    decksKindTabOn: { backgroundColor: colors.violetSoft },
    decksKindText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "800" },
    decksKindTextOn: { color: colors.violet },
    countPill: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    countPillOn: { backgroundColor: colors.surface },
    countPillText: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800" },
    countPillTextOn: { color: colors.violet },
    sectionCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 12,
      gap: 8,
    },
    sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
    sectionLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
    sectionLink: { flexDirection: "row", alignItems: "center", gap: 4 },
    viewAll: { color: colors.violet, fontSize: 12, fontWeight: "800" },
    emptyState: { alignItems: "center", paddingVertical: 18, paddingHorizontal: 12, gap: 6 },
    emptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "800", textAlign: "center" },
    emptyCopy: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, textAlign: "center", maxWidth: 320 },
    schoolHero: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.violetSoft,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 76,
    },
    schoolHeroIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    kicker: { color: colors.violet, fontSize: 11, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
    schoolHeroTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 2 },
    schoolHeroMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 2, lineHeight: 16, fontWeight: "600" },
    schoolCta: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 },
    blockIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    blockTitle: { color: colors.text, fontSize: 13.5, fontWeight: "800" },
    blockMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
    contentCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.bg,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },
    activityCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.bg,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },
    timeAgo: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    heartBtn: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: 36,
      minHeight: 36,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    heartCount: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginTop: 1 },
    quizBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.tomatoSoft, alignItems: "center", justifyContent: "center" },
  });
