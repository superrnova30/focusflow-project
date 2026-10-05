import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import HeaderWallet from "../components/HeaderWallet";
import NotificationBell from "../components/NotificationBell";
import UserAvatar from "../components/UserAvatar";
import { VisibilityBadge } from "../components/VisibilityPicker";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { deckAccent } from "../lib/deckColors";
import { RADIUS, SPACING } from "../theme/theme";

const SECTIONS = [
  { key: "mine", label: "My Decks", icon: "folder-outline" },
  { key: "public", label: "Public Decks", icon: "globe-outline" },
];

const KINDS = [
  { key: "flashcards", label: "Flashcards", icon: "layers-outline" },
  { key: "notes", label: "Notes", icon: "document-text-outline" },
];

function notePreview(note) {
  const blocks = Array.isArray(note?.contentJson) ? note.contentJson : [];
  for (const block of blocks) {
    const text = String(block?.text || "").replace(/\*\*/g, "").trim();
    if (text) return text.length > 90 ? `${text.slice(0, 87)}…` : text;
  }
  return note?.aiSummary || "No preview yet";
}

export default function FilesScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const [section, setSection] = useState(route.params?.section === "public" ? "public" : "mine");
  const [kind, setKind] = useState(route.params?.kind === "notes" ? "notes" : "flashcards");
  const [decks, setDecks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const scope = section === "public" ? "?scope=public" : "";
      if (kind === "flashcards") {
        const { data } = await client.get(`/flashcards/collections${scope}`);
        setDecks(data.collections || []);
      } else {
        const { data } = await client.get(`/notes${scope}`);
        setNotes(data.notes || []);
      }
    } catch {
      if (kind === "flashcards") setDecks([]);
      else setNotes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [section, kind]);

  useEffect(() => {
    if (route.params?.section === "public" || route.params?.section === "mine") {
      setSection(route.params.section);
    }
    if (route.params?.kind === "notes" || route.params?.kind === "flashcards") {
      setKind(route.params.kind);
    }
  }, [route.params?.section, route.params?.kind]);

  useFocusEffect(
    useCallback(() => {
      load({ silent: true });
    }, [load])
  );

  const items = kind === "flashcards" ? decks : notes;
  const isMine = section === "mine";
  const isOwnPublicItem = (item) => item?.userId === user?.id;

  const authorSuffix = (item) => {
    if (isMine) return "";
    if (isOwnPublicItem(item)) return " · You";
    return ` · ${item.user?.name || "Student"}`;
  };

  const openDeck = (deck) => {
    navigation.navigate("FlashcardCollection", {
      collection: deck,
      readOnly: !isMine && !isOwnPublicItem(deck),
    });
  };

  const openNote = (note) => {
    navigation.navigate("NoteView", {
      note,
      readOnly: !isMine && !isOwnPublicItem(note),
    });
  };

  const createItem = () => {
    if (kind === "flashcards") navigation.navigate("FlashcardEdit", {});
    else navigation.navigate("NoteEdit", {});
  };

  const renderDeck = ({ item }) => {
    const accent = deckAccent(item.color, colors);
    const count = item._count?.flashcards || 0;
    return (
      <Pressable
        onPress={() => openDeck(item)}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={[styles.accent, { backgroundColor: accent.color }]} />
        <View style={[styles.iconBox, { backgroundColor: accent.soft }]}>
          <Ionicons name={accent.icon} size={18} color={accent.color} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>{item.name || "Untitled deck"}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {count} {count === 1 ? "card" : "cards"}
            {authorSuffix(item)}
          </Text>
        </View>
        {isMine || isOwnPublicItem(item) ? (
          <VisibilityBadge isPublic={item.isPublic} colors={colors} />
        ) : (
          <UserAvatar user={item.user} size={28} />
        )}
      </Pressable>
    );
  };

  const renderNote = ({ item }) => {
    const isAi = item.source === "ai";
    return (
      <Pressable
        onPress={() => openNote(item)}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={[styles.accent, { backgroundColor: isAi ? colors.violet : colors.amber }]} />
        <View style={[styles.iconBox, { backgroundColor: isAi ? colors.violetSoft : colors.amberSoft }]}>
          <Ionicons name={isAi ? "sparkles" : "document-text-outline"} size={18} color={isAi ? colors.violet : colors.amber} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>{item.title || "Untitled note"}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {isMine ? notePreview(item) : isOwnPublicItem(item) ? "Your public note" : item.user?.name || "Student"}
          </Text>
        </View>
        {isMine || isOwnPublicItem(item) ? (
          <VisibilityBadge isPublic={item.isPublic} colors={colors} />
        ) : (
          <UserAvatar user={item.user} size={28} />
        )}
      </Pressable>
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Files</Text>
        <View style={styles.headerActions}>
          <HeaderWallet compact={compact} showFriends={false} />
          <NotificationBell />
        </View>
      </View>

      <View style={styles.sectionTabs}>
        {SECTIONS.map((item) => {
          const on = section === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setSection(item.key)}
              style={[styles.sectionTab, on && styles.sectionTabOn]}
            >
              <Ionicons name={item.icon} size={15} color={on ? "#fff" : colors.textMuted} />
              <Text style={[styles.sectionTabText, on && styles.sectionTabTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.kindRow}>
        {KINDS.map((item) => {
          const on = kind === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setKind(item.key)}
              style={[styles.kindTab, on && styles.kindTabOn]}
            >
              <Ionicons name={item.icon} size={14} color={on ? colors.violet : colors.textMuted} />
              <Text style={[styles.kindText, on && styles.kindTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
        {isMine ? (
          <Pressable onPress={createItem} style={styles.addBtn} accessibilityLabel={kind === "flashcards" ? "New deck" : "New note"}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addText}>{kind === "flashcards" ? "New" : "New"}</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.hint}>
        {isMine
          ? kind === "flashcards"
            ? "Your flashcard decks"
            : "Your notes"
          : kind === "flashcards"
            ? "Public flashcard decks from you and other students"
            : "Public notes from you and other students"}
      </Text>

      {loading && !refreshing ? (
        <ActivityIndicator color={colors.violet} style={{ marginTop: 28 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={kind === "flashcards" ? renderDeck : renderNote}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load({ silent: true });
              }}
              tintColor={colors.violet}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name={kind === "flashcards" ? "layers-outline" : "document-text-outline"}
                size={22}
                color={colors.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {isMine
                  ? kind === "flashcards"
                    ? "No decks yet"
                    : "No notes yet"
                  : "Nothing public here yet"}
              </Text>
              <Text style={styles.emptyText}>
                {isMine
                  ? "Create one to start studying."
                  : "Mark a deck or note as Public to share it here, or browse when classmates share theirs."}
              </Text>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingTop: SPACING.md,
      marginBottom: 12,
    },
    headerTitle: { color: colors.text, fontSize: compact ? 20 : 22, fontWeight: "800" },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    sectionTabs: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 4,
      marginBottom: 10,
    },
    sectionTab: {
      flex: 1,
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 11,
    },
    sectionTabOn: { backgroundColor: colors.tomato },
    sectionTabText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
    sectionTabTextOn: { color: "#fff" },
    kindRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    kindTab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      minHeight: 34,
      paddingHorizontal: 11,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    kindTabOn: {
      borderColor: colors.violet,
      backgroundColor: colors.violetSoft,
    },
    kindText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    kindTextOn: { color: colors.violet },
    addBtn: {
      marginLeft: "auto",
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.tomato,
    },
    addText: { color: "#fff", fontSize: 12, fontWeight: "800" },
    hint: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 8,
    },
    list: { paddingBottom: 28, gap: 8 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      overflow: "hidden",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 11,
      paddingRight: 12,
      paddingLeft: 10,
    },
    accent: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    iconBox: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4,
    },
    copy: { flex: 1, minWidth: 0 },
    title: { color: colors.text, fontSize: 14, fontWeight: "800" },
    meta: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
    empty: {
      alignItems: "center",
      paddingVertical: 36,
      paddingHorizontal: 20,
    },
    emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 10 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 4, maxWidth: 280 },
    pressed: { opacity: 0.82 },
  });
