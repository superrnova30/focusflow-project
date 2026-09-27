import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  useWindowDimensions,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SPACING } from "../theme/theme";

const FEATURE_DEFINITIONS = [
  {
    key: "focus",
    icon: "timer-outline",
    title: "Smart focus sessions",
    description: "Stay on track with flexible Pomodoro timers, breaks, and daily focus goals.",
    colorKey: "violet",
    softKey: "violetSoft",
  },
  {
    key: "ai",
    icon: "sparkles-outline",
    title: "AI study coach",
    description: "Ask questions, simplify difficult topics, and get help whenever you feel stuck.",
    colorKey: "amber",
    softKey: "amberSoft",
  },
  {
    key: "materials",
    icon: "layers-outline",
    title: "Instant study materials",
    description: "Turn notes and files into flashcards, quizzes, summaries, and study packs.",
    colorKey: "mint",
    softKey: "mintSoft",
  },
  {
    key: "progress",
    icon: "trending-up-outline",
    title: "Progress that motivates",
    description: "See study time, streaks, activity, and milestones in one clear dashboard.",
    colorKey: "tomato",
    softKey: "tomatoSoft",
  },
];

const STEPS = [
  {
    number: "01",
    icon: "person-add-outline",
    title: "Create your space",
    description: "Set your goals and personalize how you study.",
  },
  {
    number: "02",
    icon: "book-outline",
    title: "Add what you're learning",
    description: "Upload notes, create tasks, or ask your AI coach.",
  },
  {
    number: "03",
    icon: "rocket-outline",
    title: "Focus and improve",
    description: "Complete sessions, review results, and build momentum.",
  },
];

function LogoMark({ size = 42 }) {
  return (
    <Image
      source={require("../theme/logo.png")}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

function ActionButton({ title, icon, variant = "primary", onPress, styles }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        variant === "primary" ? styles.primaryButton : styles.secondaryButton,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text
        style={
          variant === "primary" ? styles.primaryButtonText : styles.secondaryButtonText
        }
      >
        {title}
      </Text>
      {icon && (
        <Ionicons
          name={icon}
          size={18}
          color={variant === "primary" ? "#FFFFFF" : styles.secondaryButtonText.color}
        />
      )}
    </Pressable>
  );
}

export default function HomeScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const desktop = width >= 1000;
  const tablet = width >= 640;
  const compact = width < 380;
  const landscape = width >= 700 && height < 620;
  const splitHero = desktop || landscape;
  const fourColumn = width >= 1080;
  const styles = useMemo(
    () =>
      createStyles(
        colors,
        isDark,
        desktop,
        tablet,
        compact,
        landscape,
        splitHero,
        fourColumn
      ),
    [colors, isDark, desktop, tablet, compact, landscape, splitHero, fourColumn]
  );

  const features = useMemo(
    () =>
      FEATURE_DEFINITIONS.map((feature) => ({
        ...feature,
        color: colors[feature.colorKey],
        soft: colors[feature.softKey],
      })),
    [colors]
  );

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(22)).current;
  const previewScale = useRef(new Animated.Value(0.96)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const cardStagger = useRef(FEATURE_DEFINITIONS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(heroTranslate, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(previewScale, {
        toValue: 1,
        friction: 7,
        tension: 55,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.stagger(
      90,
      cardStagger.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [cardStagger, glowPulse, heroOpacity, heroTranslate, previewScale]);

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.18],
  });
  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Navigation */}
        <View style={styles.nav}>
          <Pressable
            onPress={() => navigation.navigate("Home")}
            accessibilityRole="button"
            accessibilityLabel="FocusFlow home"
            style={({ pressed }) => [styles.brand, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.navLogo}>
              <LogoMark size={34} />
            </View>
            <View>
              <Text style={styles.brandName}>FocusFlow</Text>
              {tablet && <Text style={styles.brandTagline}>AI study companion</Text>}
            </View>
          </Pressable>

          <View style={styles.navActions}>
            <Pressable
              onPress={() => navigation.navigate("Login")}
              accessibilityRole="button"
              style={({ pressed }) => [styles.navLogin, pressed && { opacity: 0.65 }]}
            >
              <Text style={styles.navLoginText}>Log in</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("Signup")}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.navSignup,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.navSignupText}>{compact ? "Sign up" : "Get started"}</Text>
              {!compact && <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />}
            </Pressable>
          </View>
        </View>

        {/* Hero */}
        <View style={styles.heroSection}>
          <Animated.View
            style={[
              styles.heroCopy,
              {
                opacity: heroOpacity,
                transform: [{ translateY: heroTranslate }],
              },
            ]}
          >
            <View style={styles.heroPill}>
              <Ionicons name="sparkles" size={14} color={colors.amber} />
              <Text style={styles.heroPillText}>YOUR AI-POWERED STUDY SPACE</Text>
            </View>

            <Text style={styles.heroTitle}>
              Focus deeply.{"\n"}
              <Text style={styles.heroTitleAccent}>Learn smarter.</Text>
            </Text>

            <Text style={styles.heroBody}>
              Plan your work, stay focused, and turn notes into smarter study materials—all in one place built for students.
            </Text>

            <View style={styles.heroActions}>
              <ActionButton
                title="Start studying free"
                icon="arrow-forward"
                onPress={() => navigation.navigate("Signup")}
                styles={styles}
              />
              <ActionButton
                title="I have an account"
                variant="secondary"
                onPress={() => navigation.navigate("Login")}
                styles={styles}
              />
            </View>

            <View style={styles.heroTrust}>
              {[
                ["checkmark-circle", "Free to start"],
                ["card-outline", "No card required"],
                ["phone-portrait-outline", "Works on any screen"],
              ].map(([icon, label]) => (
                <View key={label} style={styles.heroTrustItem}>
                  <Ionicons name={icon} size={15} color={colors.mint} />
                  <Text style={styles.heroTrustText}>{label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Product preview */}
          <Animated.View
            style={[
              styles.previewWrap,
              { transform: [{ scale: previewScale }] },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.previewGlow,
                {
                  backgroundColor: colors.violet,
                  opacity: glowOpacity,
                  transform: [{ scale: glowScale }],
                },
              ]}
            />

            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <View>
                  <Text style={styles.previewEyebrow}>TODAY'S FOCUS</Text>
                  <Text style={styles.previewGreeting}>Ready to study?</Text>
                </View>
                <View style={styles.previewAvatar}>
                  <Ionicons name="person" size={16} color={colors.violet} />
                </View>
              </View>

              <View style={styles.timerCard}>
                <View style={styles.timerRing}>
                  <View style={styles.timerRingInner}>
                    <Text style={styles.timerValue}>25:00</Text>
                    <Text style={styles.timerLabel}>FOCUS</Text>
                  </View>
                </View>
                <View style={styles.timerCopy}>
                  <Text style={styles.timerTitle}>Deep work session</Text>
                  <Text style={styles.timerSubtitle}>Data Structures</Text>
                  <View style={styles.sessionDots}>
                    {[0, 1, 2, 3].map((dot) => (
                      <View
                        key={dot}
                        style={[
                          styles.sessionDot,
                          dot === 0 && { backgroundColor: colors.violet },
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.startButton}>
                    <Ionicons name="play" size={13} color="#FFFFFF" />
                    <Text style={styles.startButtonText}>Start focus</Text>
                  </View>
                </View>
              </View>

              <View style={styles.previewStats}>
                {[
                  ["flame", "7 days", "Streak", colors.amber, colors.amberSoft],
                  ["time", "3h 20m", "This week", colors.violet, colors.violetSoft],
                  ["checkmark-done", "12", "Tasks done", colors.mint, colors.mintSoft],
                ].map(([icon, value, label, color, soft]) => (
                  <View key={label} style={styles.previewStat}>
                    <View style={[styles.statIcon, { backgroundColor: soft }]}>
                      <Ionicons name={icon} size={14} color={color} />
                    </View>
                    <Text style={styles.statValue}>{value}</Text>
                    <Text style={styles.statLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.aiPrompt}>
                <View style={styles.aiIcon}>
                  <Ionicons name="sparkles" size={16} color={colors.violet} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiTitle}>Ask your AI study coach</Text>
                  <Text style={styles.aiSubtitle}>Explain linked lists simply...</Text>
                </View>
                <Ionicons name="arrow-up-circle" size={24} color={colors.violet} />
              </View>
            </View>

            {!compact && (
              <View style={styles.floatCardTop}>
                <View style={[styles.floatIcon, { backgroundColor: colors.mintSoft }]}>
                  <Ionicons name="checkmark" size={15} color={colors.mint} />
                </View>
                <View>
                  <Text style={styles.floatTitle}>Session complete</Text>
                  <Text style={styles.floatMeta}>+25 focus minutes</Text>
                </View>
              </View>
            )}

            {!compact && (
              <View style={styles.floatCardBottom}>
                <Ionicons name="flash" size={16} color={colors.amber} />
                <Text style={styles.floatTitle}>7 day streak!</Text>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>EVERYTHING IN ONE PLACE</Text>
            <Text style={styles.sectionTitle}>A calmer way to get more done</Text>
            <Text style={styles.sectionSubtitle}>
              FocusFlow combines the tools students use every day into one clear, connected workflow.
            </Text>
          </View>

          <View style={styles.featureGrid}>
            {features.map((feature, index) => (
              <Animated.View
                key={feature.key}
                style={[
                  styles.featureCard,
                  {
                    opacity: cardStagger[index],
                    transform: [
                      {
                        translateY: cardStagger[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [18, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={[styles.featureIcon, { backgroundColor: feature.soft }]}>
                  <Ionicons name={feature.icon} size={22} color={feature.color} />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
                <View style={styles.featureLink}>
                  <Text style={[styles.featureLinkText, { color: feature.color }]}>
                    Included free
                  </Text>
                  <Ionicons name="checkmark-circle" size={14} color={feature.color} />
                </View>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* How it works */}
        <View style={[styles.section, styles.stepsSection]}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>SIMPLE BY DESIGN</Text>
            <Text style={styles.sectionTitle}>Start making progress in minutes</Text>
          </View>

          <View style={styles.stepsRow}>
            {STEPS.map((step, index) => (
              <View key={step.number} style={styles.stepCard}>
                <View style={styles.stepTop}>
                  <View style={styles.stepIcon}>
                    <Ionicons name={step.icon} size={21} color={colors.violet} />
                  </View>
                  <Text style={styles.stepNumber}>{step.number}</Text>
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
                {index < STEPS.length - 1 && desktop && (
                  <View style={styles.stepConnector}>
                    <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Final CTA */}
        <View style={styles.finalCta}>
          <View style={styles.finalOrbOne} />
          <View style={styles.finalOrbTwo} />
          <View style={styles.finalCtaContent}>
            <View style={styles.finalIcon}>
              <LogoMark size={44} />
            </View>
            <Text style={styles.finalTitle}>Ready to make every minute count?</Text>
            <Text style={styles.finalSubtitle}>
              Create your free account and start your first focused study session today.
            </Text>
            <Pressable
              onPress={() => navigation.navigate("Signup")}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.finalButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.finalButtonText}>Create free account</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerBrand}>
            <LogoMark size={28} />
            <Text style={styles.footerName}>FocusFlow</Text>
          </View>
          <Text style={styles.footerText}>AI-powered focus tools made for students.</Text>
          <Text style={styles.footerMeta}>Make every minute count.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (
  colors,
  isDark,
  desktop,
  tablet,
  compact,
  landscape,
  splitHero,
  fourColumn
) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 32 },

    nav: {
      width: "100%",
      maxWidth: 1180,
      alignSelf: "center",
      paddingHorizontal: compact ? 14 : tablet ? 28 : 18,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brand: { flexDirection: "row", alignItems: "center", gap: 10 },
    navLogo: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    brandName: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "900",
      letterSpacing: -0.3,
    },
    brandTagline: { color: colors.textMuted, fontSize: 9.5, marginTop: 1 },
    navActions: { flexDirection: "row", alignItems: "center", gap: compact ? 6 : 10 },
    navLogin: { paddingVertical: 10, paddingHorizontal: compact ? 9 : 14 },
    navLoginText: { color: colors.text, fontSize: 13, fontWeight: "800" },
    navSignup: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: compact ? 13 : 17,
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.md,
    },
    navSignupText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "900" },

    heroSection: {
      width: "100%",
      maxWidth: 1180,
      alignSelf: "center",
      minHeight: desktop ? 590 : undefined,
      flexDirection: splitHero ? "row" : "column",
      alignItems: "center",
      gap: desktop ? 54 : splitHero ? 28 : 36,
      paddingHorizontal: compact ? 16 : tablet ? 32 : 20,
      paddingTop: desktop ? 62 : landscape ? 30 : tablet ? 52 : 38,
      paddingBottom: desktop ? 76 : landscape ? 42 : 52,
    },
    heroCopy: {
      flex: splitHero ? 1 : undefined,
      width: "100%",
      maxWidth: splitHero ? 540 : 660,
      alignItems: splitHero ? "flex-start" : "center",
    },
    heroPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
    },
    heroPillText: {
      color: colors.textMuted,
      fontSize: compact ? 9 : 10,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    heroTitle: {
      color: colors.text,
      fontSize: desktop ? 58 : landscape ? 38 : tablet ? 46 : compact ? 34 : 39,
      lineHeight: desktop ? 64 : landscape ? 44 : tablet ? 53 : compact ? 41 : 46,
      fontWeight: "900",
      letterSpacing: desktop ? -2.2 : -1.3,
      textAlign: splitHero ? "left" : "center",
      marginTop: landscape ? 14 : 20,
    },
    heroTitleAccent: { color: colors.violet },
    heroBody: {
      color: colors.textMuted,
      fontSize: desktop ? 16 : landscape ? 13.5 : 14.5,
      lineHeight: desktop ? 25 : landscape ? 20 : 22,
      textAlign: splitHero ? "left" : "center",
      maxWidth: 520,
      marginTop: 16,
    },
    heroActions: {
      width: compact ? "100%" : "auto",
      flexDirection: compact ? "column" : "row",
      gap: 10,
      marginTop: 26,
    },
    primaryButton: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      paddingHorizontal: 23,
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.md,
      shadowColor: colors.tomato,
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4,
    },
    primaryButtonText: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "900" },
    secondaryButton: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      paddingHorizontal: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
    },
    secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: "800" },
    buttonPressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
    heroTrust: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: splitHero ? "flex-start" : "center",
      gap: compact ? 8 : 14,
      marginTop: 20,
    },
    heroTrustItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    heroTrustText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "600" },

    previewWrap: {
      flex: splitHero ? 1 : undefined,
      width: "100%",
      maxWidth: 510,
      position: "relative",
      padding: desktop ? 22 : landscape ? 10 : compact ? 8 : 18,
    },
    previewGlow: {
      position: "absolute",
      width: "90%",
      height: "85%",
      left: "5%",
      top: "8%",
      borderRadius: 60,
    },
    previewCard: {
      width: "100%",
      padding: compact ? 14 : 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 24,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.35 : 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    previewHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    previewEyebrow: {
      color: colors.violet,
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    previewGreeting: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 3 },
    previewAvatar: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
    },
    timerCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 12 : 20,
      padding: compact ? 12 : 16,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
    },
    timerRing: {
      width: compact ? 104 : 126,
      height: compact ? 104 : 126,
      borderRadius: 70,
      borderWidth: 7,
      borderColor: colors.violet,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
    },
    timerRingInner: {
      width: compact ? 78 : 96,
      height: compact ? 78 : 96,
      borderRadius: 50,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    timerValue: {
      color: colors.text,
      fontSize: compact ? 20 : 25,
      fontWeight: "900",
      letterSpacing: -0.8,
    },
    timerLabel: {
      color: colors.violet,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1,
      marginTop: 2,
    },
    timerCopy: { flex: 1, minWidth: 0 },
    timerTitle: { color: colors.text, fontSize: 13.5, fontWeight: "800" },
    timerSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
    sessionDots: { flexDirection: "row", gap: 5, marginTop: 12 },
    sessionDot: {
      width: 18,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    startButton: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 9,
      backgroundColor: colors.tomato,
      marginTop: 12,
    },
    startButtonText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "800" },
    previewStats: { flexDirection: "row", gap: 8, marginTop: 10 },
    previewStat: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 4,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
    },
    statIcon: {
      width: 27,
      height: 27,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 5,
    },
    statValue: { color: colors.text, fontSize: compact ? 10.5 : 12, fontWeight: "900" },
    statLabel: { color: colors.textMuted, fontSize: compact ? 8 : 9, marginTop: 2 },
    aiPrompt: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 11,
      marginTop: 10,
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.violet + "44",
      borderRadius: RADIUS.md,
    },
    aiIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    aiTitle: { color: colors.text, fontSize: 11.5, fontWeight: "800" },
    aiSubtitle: { color: colors.textMuted, fontSize: 9.5, marginTop: 2 },
    floatCardTop: {
      position: "absolute",
      top: desktop ? 2 : 0,
      right: desktop ? -10 : 2,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 9,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    floatCardBottom: {
      position: "absolute",
      bottom: desktop ? 2 : 0,
      left: desktop ? -6 : 3,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 11,
      paddingVertical: 9,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    floatIcon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    floatTitle: { color: colors.text, fontSize: 10.5, fontWeight: "800" },
    floatMeta: { color: colors.textMuted, fontSize: 8.5, marginTop: 1 },

    section: {
      width: "100%",
      maxWidth: 1180,
      alignSelf: "center",
      paddingHorizontal: compact ? 16 : tablet ? 32 : 20,
      paddingVertical: desktop ? 70 : 48,
    },
    sectionHeading: { alignItems: "center", maxWidth: 660, alignSelf: "center", marginBottom: 30 },
    sectionEyebrow: {
      color: colors.violet,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
      textAlign: "center",
    },
    sectionTitle: {
      color: colors.text,
      fontSize: desktop ? 32 : tablet ? 28 : 24,
      lineHeight: desktop ? 39 : 32,
      fontWeight: "900",
      letterSpacing: -0.7,
      textAlign: "center",
      marginTop: 9,
    },
    sectionSubtitle: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 21,
      textAlign: "center",
      marginTop: 9,
      maxWidth: 580,
    },
    featureGrid: {
      flexDirection: tablet ? "row" : "column",
      flexWrap: tablet ? "wrap" : "nowrap",
      gap: 14,
    },
    featureCard: {
      width: tablet ? undefined : "100%",
      flexBasis: tablet ? (fourColumn ? "22%" : "46%") : undefined,
      flexGrow: tablet ? 1 : 0,
      padding: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      minHeight: fourColumn ? 226 : undefined,
    },
    featureIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    featureTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
    featureDescription: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 19,
      marginTop: 7,
      flex: desktop ? 1 : undefined,
    },
    featureLink: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 16 },
    featureLinkText: { fontSize: 10.5, fontWeight: "800" },

    stepsSection: {
      maxWidth: "100%",
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: compact ? 16 : tablet ? 32 : 20,
    },
    stepsRow: {
      width: "100%",
      maxWidth: 1080,
      alignSelf: "center",
      flexDirection: desktop ? "row" : "column",
      gap: 14,
    },
    stepCard: {
      flex: desktop ? 1 : undefined,
      padding: 20,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      position: "relative",
    },
    stepTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    stepIcon: {
      width: 43,
      height: 43,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
    },
    stepNumber: { color: colors.border, fontSize: 26, fontWeight: "900" },
    stepTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: 16 },
    stepDescription: { color: colors.textMuted, fontSize: 12.5, lineHeight: 19, marginTop: 6 },
    stepConnector: {
      position: "absolute",
      right: -24,
      top: "45%",
      zIndex: 3,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },

    finalCta: {
      maxWidth: 1120,
      alignSelf: "stretch",
      marginHorizontal: compact ? 16 : tablet ? 32 : 20,
      marginTop: desktop ? 72 : 48,
      paddingVertical: desktop ? 54 : 38,
      paddingHorizontal: 24,
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.violet + "44",
      borderRadius: 26,
      overflow: "hidden",
    },
    finalOrbOne: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 110,
      top: -110,
      right: -50,
      backgroundColor: colors.violet,
      opacity: 0.11,
    },
    finalOrbTwo: {
      position: "absolute",
      width: 180,
      height: 180,
      borderRadius: 90,
      bottom: -100,
      left: -40,
      backgroundColor: colors.amber,
      opacity: 0.09,
    },
    finalCtaContent: { alignItems: "center", zIndex: 2 },
    finalIcon: {
      width: 58,
      height: 58,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    finalTitle: {
      color: colors.text,
      fontSize: desktop ? 29 : 23,
      lineHeight: desktop ? 35 : 29,
      fontWeight: "900",
      letterSpacing: -0.6,
      textAlign: "center",
      marginTop: 16,
    },
    finalSubtitle: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 21,
      textAlign: "center",
      maxWidth: 520,
      marginTop: 8,
    },
    finalButton: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 22,
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.md,
      marginTop: 22,
    },
    finalButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },

    footer: {
      width: "100%",
      maxWidth: 1120,
      alignSelf: "center",
      flexDirection: tablet ? "row" : "column",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tablet ? 12 : 7,
      paddingHorizontal: compact ? 16 : tablet ? 32 : 20,
      paddingTop: 28,
      paddingBottom: 6,
    },
    footerBrand: { flexDirection: "row", alignItems: "center", gap: 8 },
    footerName: { color: colors.text, fontSize: 14, fontWeight: "900" },
    footerText: { color: colors.textMuted, fontSize: 11.5, textAlign: "center" },
    footerMeta: { color: colors.textMuted, fontSize: 10.5 },
  });
