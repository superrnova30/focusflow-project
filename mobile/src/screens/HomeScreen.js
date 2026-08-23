import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "react-native";
import { useTheme } from "../context/ThemeContext";

const getFeatures = (c) => [
  {
    key: "timer",
    title: "Pomodoro Timer",
    subtitle: "Focus in 25-min sprints with smart breaks",
    color: c.tomato,
    soft: c.tomatoSoft,
    emoji: "⏱",
  },
  {
    key: "ai",
    title: "AI Study Coach",
    subtitle: "Turn notes into flashcards & quizzes",
    color: c.violet,
    soft: c.violetSoft,
    emoji: "✨",
  },
  {
    key: "tasks",
    title: "Task Tracker",
    subtitle: "Plan tasks and track what gets done",
    color: c.mint,
    soft: c.mintSoft,
    emoji: "✅",
  },
  {
    key: "stats",
    title: "Insights",
    subtitle: "See your study time and progress",
    color: c.amber,
    soft: c.amberSoft,
    emoji: "📊",
  },
];

function LogoMark({ size = 72 }) {
  return <Image source={require("../theme/logo.png")} style={{ width: size, height: size }} resizeMode="contain" />;
}

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const FEATURES = getFeatures(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= 500;

  // Animation values
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(24)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const cardStagger = useRef(
    FEATURES.map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    Animated.timing(heroOpacity, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
    Animated.timing(heroTranslate, {
      toValue: 0,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    Animated.stagger(
      140,
      cardStagger.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();

    return () => pulse.stop();
  }, []);

  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.15],
  });
  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero */}
        <Animated.View
          style={[
            styles.hero,
            { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] },
          ]}
        >
          <View style={styles.logoWrap}>
            <Animated.View
              style={{
                position: "absolute",
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: colors.tomato,
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
              }}
            />
            <LogoMark size={72} />
          </View>

          <Text style={styles.brandLong}>AI Pomodoro Study System</Text>
          <Text style={styles.tagline}>
            Study smarter, stay focused, and crush your goals — all in one place.
          </Text>

          <View style={styles.ctaRow}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={() => navigation.navigate("Signup")}
            >
              <Text style={styles.primaryBtnText}>Get Started</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={() => navigation.navigate("Login")}
            >
              <Text style={styles.secondaryBtnText}>Log in</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Features */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Everything you need to focus</Text>
          <Text style={styles.sectionSubtitle}>
            Built for students who want to study better.
          </Text>
        </View>

        <View style={[styles.grid, isWide && styles.gridWide]}>
          {FEATURES.map((f, idx) => (
            <Animated.View
              key={f.key}
              style={[
                styles.featureCardWrap,
                isWide && styles.featureCardWrapWide,
                {
                  opacity: cardStagger[idx],
                  transform: [
                    {
                      translateY: cardStagger[idx].interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={[styles.featureCard, { borderColor: f.color }]}>
                <View style={[styles.featureIcon, { backgroundColor: f.soft }]}>
                  <Text style={styles.featureEmoji}>{f.emoji}</Text>
                </View>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureSubtitle}>{f.subtitle}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* Bottom CTA */}
        <Pressable
          style={({ pressed }) => [
            styles.bottomCta,
            pressed && styles.btnPressed,
          ]}
          onPress={() => navigation.navigate("Signup")}
        >
          <Text style={styles.bottomCtaText}>
            Start studying free — Create your account
          </Text>
        </Pressable>
        <Text style={styles.footer}>© AI Pomodoro Study System · Make every minute count</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 24 },
    hero: { alignItems: "center", marginTop: 20, marginBottom: 28 },
    logoWrap: {
      width: 96,
      height: 96,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 18,
    },
    logoRing: {
      borderWidth: 3,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    logoDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: "#fff",
    },
    brandLong: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "700",
      letterSpacing: 0.2,
      textAlign: "center",
      maxWidth: 560,
    },
    tagline: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      marginTop: 10,
      maxWidth: 320,
    },
    ctaRow: { flexDirection: "row", gap: 12, marginTop: 26 },
    primaryBtn: {
      backgroundColor: colors.tomato,
      borderRadius: 999,
      paddingVertical: 14,
      paddingHorizontal: 30,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 140,
    },
    primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    secondaryBtn: {
      borderRadius: 999,
      paddingVertical: 14,
      paddingHorizontal: 30,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 140,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryBtnText: { color: colors.text, fontWeight: "700", fontSize: 15 },
    btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    sectionHeader: { marginBottom: 16 },
    sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
    sectionSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
    grid: { flexDirection: "column", gap: 12 },
    gridWide: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
    featureCardWrap: { width: "100%" },
    featureCardWrapWide: { width: "48.5%" },
    featureCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
    },
    featureIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    featureEmoji: { fontSize: 22 },
    featureTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
    featureSubtitle: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 18,
      marginTop: 4,
    },
    bottomCta: {
      marginTop: 22,
      backgroundColor: colors.violetSoft,
      borderRadius: 14,
      paddingVertical: 15,
      paddingHorizontal: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.violet,
    },
    bottomCtaText: { color: colors.violet, fontWeight: "700", fontSize: 14 },
    footer: { color: colors.textMuted, fontSize: 11, textAlign: "center", marginTop: 18 },
  });
