import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Animated,
  useWindowDimensions,
} from "react-native";
import { useNavigationState } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";
import { useFocusTimer } from "../context/FocusTimerContext";

const BUBBLE_W = 76;
const BUBBLE_H = 86;
const EDGE_GAP = 12;
const DIM_OPACITY = 0.42;
const IDLE_MS = 3000;
const RING_SIZE = 40;

function fmtClock(secs) {
  const total = Math.max(0, Math.floor(secs));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = Math.floor(total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getActiveRouteName(state) {
  if (!state) return null;
  const route = state.routes[state.index];
  if (route?.state) return getActiveRouteName(route.state);
  return route?.name || null;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function MiniTimerRing({ size, progress, color, trackColor, paused, done }) {
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - normalized);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={done ? color : color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
          opacity={paused && !done ? 0.55 : 1}
        />
      </Svg>
      {done || paused ? (
        <Text
          style={{
            fontSize: done ? 12 : 8,
            fontWeight: "900",
            color: done ? color : trackColor,
          }}
        >
          {done ? "✓" : "II"}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Floating focus bubble — shares FocusTimerContext countdown (no separate timer).
 * Auto-dims after idle; circular ring shows remaining time.
 */
export default function FloatingFocusBubble() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const {
    showFloatingBubble,
    secondsLeft,
    totalSeconds,
    running,
    goToTimerScreen,
    mode,
    activeTimerColor,
    timerModeColorHex,
  } = useFocusTimer();

  const activeRoute = useNavigationState((state) => getActiveRouteName(state));
  const onTimerScreen = activeRoute === "Timer";

  const bounds = useMemo(() => {
    const minX = EDGE_GAP + insets.left;
    const maxX = Math.max(minX, width - BUBBLE_W - EDGE_GAP - insets.right);
    const minY = insets.top + 56;
    const maxY = Math.max(minY, height - insets.bottom - BUBBLE_H - 72);
    return { minX, maxX, minY, maxY };
  }, [width, height, insets.top, insets.bottom, insets.left, insets.right]);

  const defaultPos = useMemo(
    () => ({
      x: bounds.maxX,
      y: clamp(height * 0.3, bounds.minY, bounds.maxY),
    }),
    [bounds.maxX, bounds.minY, bounds.maxY, height]
  );

  const pos = useRef(new Animated.ValueXY(defaultPos)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const currentRef = useRef(defaultPos);
  const draggingRef = useRef(false);
  const startRef = useRef(defaultPos);
  const boundsRef = useRef(bounds);
  const idleTimerRef = useRef(null);
  boundsRef.current = bounds;

  const bumpActivity = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    }).start();
    idleTimerRef.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: DIM_OPACITY,
        duration: 420,
        useNativeDriver: false,
      }).start();
    }, IDLE_MS);
  }, [opacity]);

  useEffect(() => {
    bumpActivity();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [bumpActivity, showFloatingBubble, onTimerScreen]);

  useEffect(() => {
    if (draggingRef.current) return;
    const next = {
      x: clamp(currentRef.current.x, bounds.minX, bounds.maxX),
      y: clamp(currentRef.current.y, bounds.minY, bounds.maxY),
    };
    currentRef.current = next;
    pos.setValue(next);
  }, [bounds, pos]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          draggingRef.current = true;
          bumpActivity();
          startRef.current = { ...currentRef.current };
          Animated.spring(scale, {
            toValue: 1.06,
            friction: 7,
            tension: 120,
            useNativeDriver: false,
          }).start();
        },
        onPanResponderMove: (_, g) => {
          bumpActivity();
          const b = boundsRef.current;
          const nextX = clamp(startRef.current.x + g.dx, b.minX, b.maxX);
          const nextY = clamp(startRef.current.y + g.dy, b.minY, b.maxY);
          currentRef.current = { x: nextX, y: nextY };
          pos.setValue({ x: nextX, y: nextY });
        },
        onPanResponderRelease: (_, g) => {
          draggingRef.current = false;
          bumpActivity();
          const b = boundsRef.current;
          const releaseX = clamp(startRef.current.x + g.dx, b.minX, b.maxX);
          const releaseY = clamp(startRef.current.y + g.dy, b.minY, b.maxY);
          const snapX = releaseX + BUBBLE_W / 2 < width / 2 ? b.minX : b.maxX;
          currentRef.current = { x: snapX, y: releaseY };
          Animated.parallel([
            Animated.spring(pos, {
              toValue: { x: snapX, y: releaseY },
              friction: 7,
              tension: 90,
              useNativeDriver: false,
            }),
            Animated.spring(scale, {
              toValue: 1,
              friction: 7,
              tension: 120,
              useNativeDriver: false,
            }),
          ]).start();
        },
        onPanResponderTerminate: () => {
          draggingRef.current = false;
          bumpActivity();
          Animated.spring(scale, {
            toValue: 1,
            friction: 7,
            tension: 120,
            useNativeDriver: false,
          }).start();
        },
      }),
    [pos, scale, width, bumpActivity]
  );

  if (!showFloatingBubble || onTimerScreen) return null;

  const accent =
    activeTimerColor ||
    timerModeColorHex?.[mode] ||
    (mode === "focus" ? colors.tomato : colors.mint);
  const remainingProgress = secondsLeft / Math.max(1, totalSeconds);
  const done = secondsLeft <= 0;
  const statusLabel = done ? "Done" : running ? (mode === "focus" ? "Focus" : "Break") : "Paused";

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 80, elevation: 80 }]}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bubbleWrap,
          {
            transform: [...pos.getTranslateTransform(), { scale }],
            opacity,
            shadowColor: accent,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            bumpActivity();
            goToTimerScreen();
          }}
          onPressIn={bumpActivity}
          accessibilityRole="button"
          accessibilityLabel={`Focus timer ${fmtClock(secondsLeft)}. Open Timer.`}
          style={({ pressed }) => [
            styles.bubble,
            {
              backgroundColor: colors.surface,
              borderColor: accent,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <MiniTimerRing
            size={RING_SIZE}
            progress={done ? 1 : remainingProgress}
            color={accent}
            trackColor={colors.border}
            paused={!running && !done}
            done={done}
          />
          <Text style={[styles.time, { color: colors.text }]}>{fmtClock(secondsLeft)}</Text>
          <Text style={[styles.hint, { color: accent }]}>{statusLabel}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: BUBBLE_W,
    height: BUBBLE_H,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  bubble: {
    width: BUBBLE_W,
    height: BUBBLE_H,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 6,
    gap: 2,
  },
  time: {
    fontSize: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
    marginTop: 1,
  },
  hint: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
