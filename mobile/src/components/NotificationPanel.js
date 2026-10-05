import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useNotifications } from "../context/NotificationContext";
import UserAvatar from "./UserAvatar";
import {
  formatWhen,
  getNotificationDisplay,
  navigateFromNotification,
  notificationIcon,
  notificationIsNavigable,
  notificationTypeLabel,
} from "../lib/notifications";
import { RADIUS } from "../theme/theme";

function NotificationRow({ item, expanded, onPress, colors, compact, actionable, timeTick }) {
  const icon = notificationIcon(item.type);
  const typeLabel = notificationTypeLabel(item.type);
  const display = getNotificationDisplay(item);
  void timeTick;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={display.accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        item.unread && styles.rowUnread,
        expanded && styles.rowOpen,
        pressed && styles.pressed,
      ]}
    >
      {item.unread ? <View style={[styles.unreadBar, { backgroundColor: colors.tomato }]} /> : null}
      <View style={styles.rowInner}>
        <View style={styles.media}>
          {item.actor ? (
            <UserAvatar user={item.actor} size={compact ? 36 : 38} />
          ) : (
            <View style={[styles.iconWrap, { backgroundColor: `${icon.color}18` }]}>
              <Ionicons name={icon.name} size={16} color={icon.color} />
            </View>
          )}
        </View>
        <View style={styles.copy}>
          <Text
            style={[styles.message, { color: colors.text, fontWeight: item.unread ? "800" : "600" }]}
            numberOfLines={expanded ? 6 : 3}
          >
            {display.mode === "actor" ? (
              <>
                <Text style={styles.nameEmphasis}>{display.name}</Text>
                <Text>{` ${display.activity}`}</Text>
                {display.when ? (
                  <Text style={{ color: colors.textMuted, fontWeight: "600" }}>{` — ${display.when}`}</Text>
                ) : null}
              </>
            ) : (
              <>
                <Text>{display.title}</Text>
                {display.when ? (
                  <Text style={{ color: colors.textMuted, fontWeight: "600" }}>{` — ${display.when}`}</Text>
                ) : null}
              </>
            )}
          </Text>
          {!expanded && display.mode === "title" && display.body ? (
            <Text style={[styles.preview, { color: colors.textMuted }]} numberOfLines={2}>
              {display.body}
            </Text>
          ) : null}
          {expanded ? (
            <View style={styles.detail}>
              <Text style={[styles.type, { color: colors.violet, backgroundColor: colors.violetSoft }]}>
                {typeLabel}
              </Text>
              {item.body ? (
                <Text style={[styles.body, { color: colors.textMuted }]}>{item.body}</Text>
              ) : null}
              <Text style={[styles.meta, { color: colors.textMuted }]}>{formatWhen(item.createdAt)}</Text>
            </View>
          ) : null}
        </View>
        {actionable ? (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
        ) : null}
      </View>
    </Pressable>
  );
}

export default function NotificationPanel() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isWide = width >= 720;
  const compact = width < 380;
  const {
    items,
    unreadCount,
    loading,
    panelOpen,
    selectedId,
    closePanel,
    selectNotification,
    markAllRead,
    markRead,
  } = useNotifications();

  const handleRowPress = (item) => {
    if (!item?.id) return;
    if (item.unread) markRead(item.id);
    if (navigateFromNotification(item)) {
      closePanel();
      return;
    }
    selectNotification(item);
  };

  const opacity = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(isWide ? -12 : 24)).current;
  const [timeTick, setTimeTick] = useState(0);

  useEffect(() => {
    if (!panelOpen) return undefined;
    setTimeTick((t) => t + 1);
    const interval = setInterval(() => setTimeTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, [panelOpen]);

  useEffect(() => {
    if (panelOpen) {
      opacity.setValue(0);
      shift.setValue(isWide ? -12 : 28);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(shift, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [panelOpen, isWide, opacity, shift]);

  const panelStyle = isWide
    ? {
        top: Math.max(insets.top, 12) + 8,
        right: 16,
        width: Math.min(400, width - 32),
        maxHeight: Math.min(height * 0.78, 640),
      }
    : {
        left: 12,
        right: 12,
        bottom: Math.max(insets.bottom, 12) + 8,
        maxHeight: height * 0.78,
      };

  return (
    <Modal visible={panelOpen} transparent animationType="none" statusBarTranslucent onRequestClose={closePanel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closePanel} accessibilityLabel="Close notifications" />
        <Animated.View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              ...panelStyle,
              opacity,
              transform: [{ translateY: shift }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.heading, { color: colors.text }]}>Notifications</Text>
              <Text style={[styles.subhead, { color: colors.textMuted }]}>
                {unreadCount ? `${unreadCount} new` : "You're all caught up"}
              </Text>
            </View>
            {unreadCount > 0 ? (
              <Pressable onPress={markAllRead} style={[styles.markBtn, { backgroundColor: colors.violetSoft }]}>
                <Text style={[styles.markText, { color: colors.violet }]}>Mark all read</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={closePanel}
              style={[styles.closeBtn, { backgroundColor: colors.bg, borderColor: colors.border }]}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {loading && !items.length ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.violet} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.violetSoft }]}>
                <Ionicons name="notifications-outline" size={22} color={colors.violet} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications yet</Text>
              <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>
                Follows, likes, quizzes, and important updates will show up here.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.groupCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                {items.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                    <NotificationRow
                      item={item}
                      expanded={selectedId === item.id}
                      onPress={() => handleRowPress(item)}
                      colors={colors}
                      compact={compact}
                      actionable={notificationIsNavigable(item)}
                      timeTick={timeTick}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(14, 18, 32, 0.38)" },
  panel: {
    position: "absolute",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  heading: { fontSize: 17, fontWeight: "800" },
  subhead: { fontSize: 12, marginTop: 1 },
  markBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { fontSize: 11, fontWeight: "800" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 12, paddingBottom: 14 },
  groupCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  row: { position: "relative" },
  rowUnread: {},
  rowOpen: {},
  pressed: { opacity: 0.82 },
  unreadBar: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  media: { width: 38 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  message: { fontSize: 13.5, lineHeight: 19 },
  nameEmphasis: { fontWeight: "800" },
  detail: { marginTop: 8, gap: 6 },
  type: {
    alignSelf: "flex-start",
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  body: { fontSize: 13, lineHeight: 18 },
  preview: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  meta: { fontSize: 11, fontWeight: "600" },
  chevron: { marginTop: 10, flexShrink: 0 },
  center: { paddingVertical: 48, alignItems: "center" },
  empty: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 36 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptyCopy: { fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: 6, maxWidth: 240 },
});
