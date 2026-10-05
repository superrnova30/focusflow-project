import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CoinIcon from "./CoinIcon";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SPACING } from "../theme/theme";
import {
  HEART_COIN_COST,
  MAX_HEARTS,
  formatRefillClock,
  formatRefillCountdown,
  refillReady,
  useRefillCountdown,
} from "../lib/hearts";

export function HeartsLockBanner({ coins = 0, refillAt, onPress }) {
  const { colors } = useTheme();
  const countdown = useRefillCountdown(refillAt);
  const ready = refillReady(refillAt);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        bannerStyles.wrap,
        { backgroundColor: colors.tomatoSoft, borderColor: colors.tomato, opacity: pressed ? 0.88 : 1 },
      ]}
    >
      <Ionicons name="heart-dislike" size={20} color="#FF5A76" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[bannerStyles.title, { color: colors.text }]}>Quizzes locked — out of hearts</Text>
        <Text style={[bannerStyles.meta, { color: colors.textMuted }]}>
          {ready
            ? "Hearts are ready to restore now"
            : `Refills in ${countdown || "24 hours"} · ${coins} coins available`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const bannerStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  title: { fontSize: 14, fontWeight: "800" },
  meta: { fontSize: 12, fontWeight: "600", marginTop: 2 },
});

export default function HeartsBlockedPanel({
  coins = 0,
  hearts = 0,
  refillAt,
  title = "Out of hearts",
  message = "You answered too many questions incorrectly. Quizzes stay locked until your hearts refill.",
  summary,
  buying = null,
  onRevive,
  onRefillAll,
  onCheckAgain,
  onBack,
  onUpgrade,
  continueLabel = "Continue quiz",
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const [countdown, setCountdown] = useState(() => formatRefillCountdown(refillAt));
  const ready = refillReady(refillAt);
  const autoChecked = useRef(false);
  const missing = Math.max(1, MAX_HEARTS - hearts);
  const refillAllCost = missing * HEART_COIN_COST;
  const canRevive = coins >= HEART_COIN_COST;
  const canRefillAll = coins >= refillAllCost;

  useEffect(() => {
    const tick = () => setCountdown(formatRefillCountdown(refillAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [refillAt]);

  useEffect(() => {
    if (ready && onCheckAgain && !autoChecked.current) {
      autoChecked.current = true;
      onCheckAgain();
    }
  }, [ready, onCheckAgain]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: colors.tomatoSoft }]}>
        <Ionicons name="heart-dislike" size={34} color="#FF5A76" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      <View style={styles.heartRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Ionicons
            key={i}
            name={i < hearts ? "heart" : "heart-outline"}
            size={22}
            color={i < hearts ? "#FF5A76" : colors.border}
          />
        ))}
      </View>

      <View style={[styles.timerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.timerIcon, { backgroundColor: ready ? colors.mintSoft : colors.amberSoft }]}>
          <Ionicons name={ready ? "checkmark-circle" : "time-outline"} size={20} color={ready ? colors.mint : colors.amber} />
        </View>
        <View style={styles.timerCopy}>
          <Text style={styles.timerLabel}>{ready ? "Hearts are ready" : "Automatic refill in"}</Text>
          <Text style={[styles.timerValue, { color: ready ? colors.mint : colors.amber }]}>
            {ready ? "All 5 hearts will restore now" : countdown || "24 hours"}
          </Text>
          {!ready && !!formatRefillClock(refillAt) && (
            <Text style={styles.timerMeta}>Available {formatRefillClock(refillAt)}</Text>
          )}
        </View>
      </View>

      <View style={[styles.walletCard, { backgroundColor: colors.surface, borderColor: "#F5B942" }]}>
        <CoinIcon size={18} />
        <Text style={styles.walletText}>{coins} coins available</Text>
      </View>

      {summary}

      <Pressable
        onPress={() => onRevive?.(1)}
        disabled={buying != null || !canRevive}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.tomato },
          (!canRevive || buying) && styles.disabled,
          pressed && canRevive && styles.pressed,
        ]}
      >
        {buying === "heart" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Ionicons name="heart" size={18} color="#fff" />
        )}
        <Text style={styles.primaryBtnText}>
          {hearts > 0 ? continueLabel : "Revive 1 Heart"} · {HEART_COIN_COST} coins
        </Text>
      </Pressable>
      {!canRevive ? (
        <Text style={styles.warn}>
          You need {HEART_COIN_COST} coins to revive a heart. Earn coins from 2 correct answers in a row, or restore hearts with Go Unlimited.
        </Text>
      ) : null}

      {missing > 1 && onRefillAll ? (
        <Pressable
          onPress={() => onRefillAll(missing)}
          disabled={buying != null || !canRefillAll}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: colors.amber, backgroundColor: colors.surface },
            (!canRefillAll || buying) && styles.disabled,
            pressed && canRefillAll && styles.pressed,
          ]}
        >
          {buying === "hearts" ? (
            <ActivityIndicator color={colors.amber} />
          ) : (
            <Ionicons name="heart-circle-outline" size={18} color={colors.amber} />
          )}
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
            Refill all {missing} hearts · {refillAllCost} coins
          </Text>
        </Pressable>
      ) : null}

      {ready && onCheckAgain ? (
        <Pressable
          onPress={onCheckAgain}
          style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.mint, backgroundColor: colors.mintSoft }, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={16} color={colors.mint} />
          <Text style={[styles.secondaryBtnText, { color: colors.mint }]}>Restore hearts now</Text>
        </Pressable>
      ) : null}

      {onUpgrade ? (
        <Pressable
          onPress={onUpgrade}
          style={({ pressed }) => [
            canRevive ? styles.secondaryBtn : styles.primaryBtn,
            canRevive
              ? { borderColor: colors.violet, backgroundColor: colors.surface }
              : { backgroundColor: colors.violet },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="star" size={16} color={canRevive ? colors.violet : "#fff"} />
          <Text style={canRevive ? [styles.secondaryBtnText, { color: colors.violet }] : styles.primaryBtnText}>
            {canRevive ? "Go Unlimited for unlimited hearts" : "Restore hearts with Go Unlimited"}
          </Text>
        </Pressable>
      ) : null}

      {onBack ? (
        <Pressable onPress={onBack} style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}>
          <Text style={styles.linkText}>Back</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    wrap: {
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
      alignItems: "center",
      paddingHorizontal: SPACING.md,
    },
    iconWrap: {
      width: 76,
      height: 76,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.md,
    },
    title: {
      color: colors.text,
      fontSize: compact ? 24 : 26,
      fontWeight: "900",
      textAlign: "center",
      marginBottom: 8,
    },
    message: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginBottom: SPACING.md,
    },
    heartRow: { flexDirection: "row", gap: 6, marginBottom: SPACING.lg },
    timerCard: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: 10,
    },
    timerIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    timerCopy: { flex: 1, minWidth: 0 },
    timerLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
    timerValue: { fontSize: compact ? 18 : 20, fontWeight: "900", marginTop: 2 },
    timerMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "600" },
    walletCard: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingVertical: 10,
      marginBottom: SPACING.md,
    },
    walletText: { color: colors.text, fontSize: 14, fontWeight: "800" },
    warn: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
      marginBottom: SPACING.sm,
    },
    primaryBtn: {
      width: "100%",
      minHeight: 50,
      borderRadius: RADIUS.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 10,
      paddingHorizontal: 16,
    },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    secondaryBtn: {
      width: "100%",
      minHeight: 46,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 10,
      paddingHorizontal: 16,
    },
    secondaryBtnText: { fontSize: 14, fontWeight: "800" },
    linkBtn: { paddingVertical: 8 },
    linkText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.85 },
  });
