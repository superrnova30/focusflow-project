import React, { useMemo, useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Screen";
import { useTheme } from "../context/ThemeContext";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getActivityLevel(day) {
  if (!day || !day.active) return 0;
  const total = (day.sessions || 0) + (day.quizzes || 0) + (day.xpEarned > 0 ? 1 : 0);
  if (total >= 4) return 4;
  if (total === 3) return 3;
  if (total === 2) return 2;
  return 1;
}

/**
 * A self-contained, themed monthly calendar grid.
 * `days` is an array of { date, active, focusMinutes, sessions, quizzes,
 * xpEarned, correct, wrong } objects for the currently-viewed month.
 * `viewMonth` is a Date pointing at the first of the displayed month.
 */
export default function Calendar({ days = [], viewMonth, onPrev, onNext, selectedDate, onSelectDate }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);

  const [anim] = useState(() => new Animated.Value(0));

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  const todayKeyStr = dayKey(new Date());
  const selectedKey = selectedDate || todayKeyStr;

  const dayByKey = useMemo(() => {
    const map = {};
    (days || []).forEach((d) => {
      map[d.date] = d;
    });
    return map;
  }, [days]);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [viewMonth, anim]);

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ blank: true, key: `b-${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dayKey(new Date(year, month, d));
    cells.push({ day: d, key });
  }

  const fmt = (d) => {
    const [yyyy, mm, dd] = d.split("-");
    return `${MONTHS[Number(mm) - 1].slice(0, 3)} ${Number(dd)}, ${yyyy}`;
  };

  const selectedInfo = dayByKey[selectedKey];

  return (
    <Card style={styles.card}>
      {/* Month navigation header */}
      <View style={styles.header}>
        <Pressable
          onPress={onPrev}
          hitSlop={10}
          style={({ pressed }) => [styles.navBtn, { backgroundColor: colors.bg, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.monthTitle}>
          {MONTHS[month]} {year}
        </Text>
        <Pressable
          onPress={onNext}
          hitSlop={10}
          style={({ pressed }) => [styles.navBtn, { backgroundColor: colors.bg, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      {/* Weekday labels */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={[styles.weekLabel, (i === 0 || i === 6) && { color: colors.textMuted }]}>
            {w}
          </Text>
        ))}
      </View>

      {/* Day grid */}
      <Animated.View style={{ opacity: anim }}>
        <View style={styles.grid}>
          {cells.map((c) => {
            if (c.blank) return <View key={c.key} style={styles.cell} />;
            const info = dayByKey[c.key];
            const level = getActivityLevel(info);
            const isToday = c.key === todayKeyStr;
            const isSelected = c.key === selectedKey;
            const hasActivity = !!info && info.active;

            return (
              <Pressable
                key={c.key}
                onPress={() => onSelectDate && onSelectDate(c.key)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.dayCircle,
                    hasActivity && level >= 1 && { backgroundColor: colors.mintSoft },
                    isSelected && { backgroundColor: colors.tomato },
                    isToday && !isSelected && { borderColor: colors.tomato, borderWidth: 1.5 },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && { color: "#fff", fontWeight: "800" },
                      isToday && !isSelected && { color: colors.tomato, fontWeight: "800" },
                      !hasActivity && { color: colors.textMuted },
                    ]}
                  >
                    {c.day}
                  </Text>
                </View>
                {/* Activity intensity dots */}
                <View style={styles.dotRow}>
                  {[1, 2, 3, 4].map((lv) => (
                    <View
                      key={lv}
                      style={[
                        styles.dot,
                        { backgroundColor: lv <= level ? colors.mint : "transparent" },
                      ]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* Selected day detail */}
      <View style={styles.detailBox}>
        <View style={styles.detailHeader}>
          <Ionicons name="calendar" size={16} color={colors.mint} />
          <Text style={styles.detailDate}>{fmt(selectedKey)}</Text>
        </View>
        {!selectedInfo || !selectedInfo.active ? (
          <Text style={styles.detailEmpty}>No study activity recorded this day.</Text>
        ) : (
          <View style={styles.detailStats}>
            <Stat icon="time-outline" color={colors.tomato} value={`${selectedInfo.focusMinutes || 0}m`} label="Focus" />
            <Stat icon="layers-outline" color={colors.mint} value={selectedInfo.sessions || 0} label="Sessions" />
            <Stat icon="checkbox-outline" color={colors.violet} value={selectedInfo.quizzes || 0} label="Quizzes" />
            <Stat icon="flash" color={colors.amber} value={`+${selectedInfo.xpEarned || 0}`} label="XP" />
          </View>
        )}
      </View>
    </Card>
  );
}

function Stat({ icon, color, value, label }) {
  const { colors } = useTheme();
  const styles = StatStyles(colors);
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const StatStyles = (colors) =>
  StyleSheet.create({
    stat: { flex: 1, alignItems: "center", gap: 2 },
    statValue: { color: colors.text, fontSize: 14, fontWeight: "800" },
    statLabel: { color: colors.textMuted, fontSize: 10 },
  });

const useStyles = (colors) =>
  StyleSheet.create({
    card: { padding: 14 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    monthTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
    navBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    weekRow: { flexDirection: "row", marginBottom: 6 },
    weekLabel: {
      flex: 1,
      textAlign: "center",
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: {
      width: `${100 / 7}%`,
      alignItems: "center",
      marginVertical: 4,
    },
    dayCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    dayText: { color: colors.text, fontSize: 13, fontWeight: "600" },
    dotRow: { flexDirection: "row", gap: 2, marginTop: 3 },
    dot: { width: 4, height: 4, borderRadius: 2 },
    detailBox: {
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 12,
    },
    detailHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
    detailDate: { color: colors.text, fontSize: 13, fontWeight: "700" },
    detailEmpty: { color: colors.textMuted, fontSize: 12.5 },
    detailStats: { flexDirection: "row", marginTop: 4 },
  });
