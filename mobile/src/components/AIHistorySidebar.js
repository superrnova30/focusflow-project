import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  Modal,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useAIChat } from "../context/AIChatContext";
import { useAIHistory, relativeTime } from "../context/AIHistoryContext";
import { studyType, loadStudyFonts } from "../theme/studyType";

const INTENT_META = {
  study: { icon: "school-outline", tone: "violet" },
  casual: { icon: "chatbubbles-outline", tone: "mint" },
  other: { icon: "sparkles-outline", tone: "amber" },
};

function intentStyle(intent, colors) {
  if (intent === "casual") return { icon: INTENT_META.casual.icon, color: colors.mint, soft: colors.mintSoft };
  if (intent === "study") return { icon: INTENT_META.study.icon, color: colors.violet, soft: colors.violetSoft };
  return { icon: INTENT_META.other.icon, color: colors.amber, soft: colors.amberSoft };
}

export function AIHistorySidebar({ navigation, onClose, variant = "docked" }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, variant, isDark), [colors, variant, isDark]);
  useEffect(() => {
    loadStudyFonts();
  }, []);
  const { clear: startNewChat } = useAIChat();
  const { conversations, stats, loading, search, runSearch, load } = useAIHistory();
  const [query, setQuery] = useState(search || "");

  useFocusEffect(
    useCallback(() => {
      load({ mode: "initial" });
    }, [load])
  );

  const openConversation = (conversation) => {
    onClose?.();
    navigation.navigate("AIHistoryDetail", {
      conversationId: conversation.id,
      title: conversation.title,
    });
  };

  const startChat = () => {
    startNewChat();
    onClose?.();
    navigation.navigate("StudyChat");
  };

  const openAll = () => {
    onClose?.();
    navigation.navigate("AIHistory");
  };

  return (
    <View style={styles.panel} accessibilityRole="none" accessibilityLabel="AI History sidebar">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={styles.headerBadge}>
            <Ionicons name="time" size={16} color={colors.violet} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eyebrow}>History</Text>
            <Text style={styles.title}>AI chats</Text>
            <Text style={styles.subtitle}>
              {stats.totalConversations || 0} saved conversation{(stats.totalConversations || 0) === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={startChat}
            accessibilityRole="button"
            accessibilityLabel="Start a new AI conversation"
            style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={16} color="#fff" />
          </Pressable>
          {onClose ? (
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close AI History"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={15} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            runSearch(value);
          }}
          placeholder="Search conversations"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search AI History"
        />
        {query ? (
          <Pressable
            onPress={() => {
              setQuery("");
              runSearch("");
            }}
            hitSlop={8}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {loading && conversations.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.violet} />
          <Text style={styles.emptyText}>Loading your conversations…</Text>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.violet} />
          </View>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyText}>Ask FocusFlow AI a question and it will show up here.</Text>
          <Pressable onPress={startChat} style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}>
            <Text style={styles.emptyCtaText}>Start a chat</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const info = intentStyle(item.intent, colors);
            return (
              <Pressable
                onPress={() => openConversation(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title || "Untitled conversation"}, updated ${relativeTime(item.updatedAt)}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={[styles.rowIcon, { backgroundColor: info.soft }]}>
                  <Ionicons name={item.pinned ? "pin" : info.icon} size={15} color={info.color} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title || "Untitled conversation"}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {relativeTime(item.updatedAt)}
                    {item.messageCount ? ` · ${item.messageCount} messages` : ""}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={openAll}
        accessibilityRole="button"
        accessibilityLabel="Open full AI History"
        style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}
      >
        <Text style={styles.footerText}>See all conversations</Text>
        <Ionicons name="arrow-forward" size={15} color={colors.violet} />
      </Pressable>
    </View>
  );
}

export function AIHistoryDrawer({ visible, onClose, navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(360, Math.max(292, width * 0.88));
  const translateX = React.useRef(new Animated.Value(-panelWidth)).current;
  const backdrop = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      translateX.setValue(-panelWidth);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateX.setValue(-panelWidth);
      backdrop.setValue(0);
    }
  }, [visible, panelWidth, translateX, backdrop]);

  const close = () => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -panelWidth,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => onClose?.());
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(8,10,18,0.46)", opacity: backdrop },
            ]}
          />
        </Pressable>
        <Animated.View
          style={{
            width: panelWidth,
            height: "100%",
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 10,
            paddingHorizontal: 12,
            transform: [{ translateX }],
          }}
        >
          <AIHistorySidebar navigation={navigation} onClose={close} variant="drawer" />
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors, variant, isDark) => {
  const type = (extra) => studyType.text(extra);
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.06)";
  return StyleSheet.create({
    panel: {
      flex: 1,
      backgroundColor: isDark ? colors.surfaceRaised : colors.surface,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 22,
      padding: variant === "drawer" ? 16 : 14,
      minHeight: 0,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 12,
    },
    headerCopy: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
    headerBadge: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    eyebrow: type({
      color: colors.violet,
      fontSize: 11,
      fontWeight: "600",
      marginBottom: 2,
    }),
    title: type({ color: colors.text, fontSize: 18, fontWeight: "700" }),
    subtitle: type({ color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "500" }),
    headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
    newBtn: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : colors.bg,
      borderRadius: 16,
      paddingHorizontal: 12,
      height: 42,
      marginBottom: 10,
    },
    searchInput: type({ flex: 1, color: colors.text, fontSize: 14, fontWeight: "500", paddingVertical: 0 }),
    listContent: { paddingBottom: 8, gap: 6 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 16,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : colors.bg,
    },
    rowIcon: {
      width: 32,
      height: 32,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: type({ color: colors.text, fontSize: 14, fontWeight: "700" }),
    rowMeta: type({ color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "500" }),
    empty: { alignItems: "center", paddingVertical: 14, paddingHorizontal: 10, gap: 6 },
    emptyIcon: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
    emptyTitle: type({ color: colors.text, fontSize: 15, fontWeight: "700" }),
    emptyText: type({ color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19, fontWeight: "500" }),
    emptyCta: {
      marginTop: 6,
      backgroundColor: colors.tomato,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    emptyCtaText: type({ color: "#fff", fontSize: 13, fontWeight: "700" }),
    footerBtn: {
      marginTop: "auto",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 42,
      borderRadius: 16,
      backgroundColor: colors.violetSoft,
    },
    footerText: type({ color: colors.violet, fontSize: 13, fontWeight: "700" }),
    pressed: { opacity: 0.78 },
  });
};
