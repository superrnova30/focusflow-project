import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { AuthField } from "../components/AuthField";
import { PasswordHints } from "../components/PasswordHints";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useStableLayout } from "../hooks/useStableLayout";
import { RADIUS, SPACING } from "../theme/theme";

const IS_NATIVE = Platform.OS === "ios" || Platform.OS === "android";

const ERROR_COLOR = "#EF4444";

export default function SignupScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { wide, compact } = useStableLayout(900);
  const styles = useMemo(
    () => createStyles(colors, isDark, wide, compact),
    [colors, isDark, wide, compact]
  );
  const { signup } = useAuth();
  const insets = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const entrance = useRef(new Animated.Value(IS_NATIVE ? 1 : 0)).current;

  useEffect(() => {
    if (IS_NATIVE) return;
    Animated.timing(entrance, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (event) => setKeyboardInset(event.endCoordinates?.height ?? 0);
    const onHide = () => setKeyboardInset(0);
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const entranceY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const Shell = IS_NATIVE ? View : Animated.View;
  const shellProps = IS_NATIVE
    ? { style: styles.shell }
    : { style: [styles.shell, { transform: [{ translateY: entranceY }] }] };

  const submit = async () => {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || !password || !confirmPassword) {
      setError("Complete all fields to create your account.");
      return;
    }
    if (!normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const result = await signup(name.trim(), normalizedEmail, password);
      navigation.navigate("VerifyEmail", {
        email: normalizedEmail,
        initialMessage: result?.message || "Check your email for a verification code.",
      });
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <Shell {...shellProps}>
            {wide && (
              <View style={styles.brandPanel}>
                <View style={styles.brandOrbTop} />
                <View style={styles.brandOrbBottom} />

                <View style={styles.brandContent}>
                  <View style={styles.logoBadge}>
                    <Image
                      source={require("../theme/logo.png")}
                      style={styles.logoLarge}
                      resizeMode="contain"
                    />
                  </View>

                  <View style={styles.brandPill}>
                    <Ionicons name="rocket" size={13} color={colors.amber} />
                    <Text style={styles.brandPillText}>START FOR FREE</Text>
                  </View>

                  <Text style={styles.brandTitle}>Build better{"\n"}study habits.</Text>
                  <Text style={styles.brandSubtitle}>
                    Join FocusFlow and turn every study session into meaningful progress.
                  </Text>

                  <View style={styles.featureList}>
                    {[
                      ["timer-outline", "Plan focused sessions that fit your day"],
                      ["sparkles-outline", "Create smarter materials with your AI coach"],
                      ["trophy-outline", "Build streaks and celebrate your progress"],
                    ].map(([icon, text]) => (
                      <View key={text} style={styles.featureRow}>
                        <View style={styles.featureIcon}>
                          <Ionicons name={icon} size={17} color={colors.violet} />
                        </View>
                        <Text style={styles.featureText}>{text}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.trustCard}>
                    <View style={styles.avatarStack}>
                      {["#6C5CE7", "#4ADE94", "#FFC15E"].map((color, index) => (
                        <View
                          key={color}
                          style={[
                            styles.avatar,
                            { backgroundColor: color, marginLeft: index ? -8 : 0 },
                          ]}
                        >
                          <Ionicons name="person" size={13} color="#FFFFFF" />
                        </View>
                      ))}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.trustTitle}>Made for focused students</Text>
                      <Text style={styles.trustMeta}>Free to start · No card required</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.formPanel}>
              <View style={styles.formInner}>
                {!wide && (
                  <View style={styles.mobileBrand}>
                    <View style={styles.mobileLogoWrap}>
                      <Image
                        source={require("../theme/logo.png")}
                        style={styles.logoMobile}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={styles.mobileBrandName}>FocusFlow</Text>
                  </View>
                )}

                <View style={styles.headingRow}>
                  <View style={styles.stepPill}>
                    <View style={styles.stepDot}>
                      <Text style={styles.stepDotText}>1</Text>
                    </View>
                    <Text style={styles.stepText}>ACCOUNT</Text>
                    <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
                    <Text style={styles.stepTextMuted}>VERIFY EMAIL</Text>
                </View>
                <Text style={styles.title}>Create your account</Text>
                  <Text style={styles.subtitle}>
                    Start studying smarter with a free FocusFlow account.
                  </Text>
                </View>

                <View style={styles.formFields}>
                  <AuthField
                    label="Full name"
                    icon="person-outline"
                    colors={colors}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your full name"
                    autoCapitalize="words"
                    {...(!IS_NATIVE
                      ? {
                          autoComplete: "name",
                          textContentType: "name",
                          returnKeyType: "next",
                          onSubmitEditing: () => emailRef.current?.focus(),
                        }
                      : {})}
                  />

                  <AuthField
                    label="Email address"
                    icon="mail-outline"
                    colors={colors}
                    value={email}
                    onChangeText={setEmail}
                    inputRef={emailRef}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    {...(!IS_NATIVE
                      ? {
                          autoComplete: "email",
                          textContentType: "emailAddress",
                          returnKeyType: "next",
                          onSubmitEditing: () => passwordRef.current?.focus(),
                        }
                      : {})}
                  />

                  <AuthField
                    label="Password"
                    icon="lock-closed-outline"
                    colors={colors}
                    value={password}
                    onChangeText={setPassword}
                    inputRef={passwordRef}
                    placeholder="At least 8 characters"
                    secureTextEntry
                    {...(!IS_NATIVE
                      ? {
                          autoComplete: "new-password",
                          textContentType: "newPassword",
                          returnKeyType: "next",
                          onSubmitEditing: () => confirmRef.current?.focus(),
                        }
                      : {})}
                  />

                  <AuthField
                    label="Confirm password"
                    icon="shield-checkmark-outline"
                    colors={colors}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    inputRef={confirmRef}
                    placeholder="Enter your password again"
                    secureTextEntry
                    {...(!IS_NATIVE
                      ? {
                          autoComplete: "new-password",
                          textContentType: "newPassword",
                          returnKeyType: "done",
                          onSubmitEditing: submit,
                        }
                      : {})}
                  />

                  <PasswordHints
                    password={password}
                    confirmPassword={confirmPassword}
                    colors={colors}
                  />

                  {error && (
                    <View
                      style={styles.errorBanner}
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                    >
                      <Ionicons name="alert-circle" size={18} color={ERROR_COLOR} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  <Pressable
                    onPress={submit}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="Create account"
                    style={({ pressed }) => [
                      styles.signupButton,
                      pressed && !loading && styles.buttonPressed,
                      loading && styles.buttonDisabled,
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.signupButtonText}>Create free account</Text>
                        <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                      </>
                    )}
                  </Pressable>

                  <Text style={styles.termsText}>
                    By creating an account, you agree to use FocusFlow responsibly and receive account-related emails.
                  </Text>
                </View>

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>ALREADY HAVE AN ACCOUNT?</Text>
                  <View style={styles.divider} />
                </View>

                <Pressable
                  onPress={() => navigation.navigate("Login")}
                  style={({ pressed }) => [
                    styles.loginButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.loginButtonText}>Sign in instead</Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate("Home")}
                  style={({ pressed }) => [
                    styles.backHome,
                    pressed && { opacity: 0.65 },
                  ]}
                >
                  <Ionicons name="arrow-back" size={15} color={colors.textMuted} />
                  <Text style={styles.backHomeText}>Back to home</Text>
                </Pressable>
              </View>
            </View>
    </Shell>
  );

  const scrollContentStyle = [
    styles.scroll,
    {
      paddingBottom: Math.max(insets.bottom, SPACING.lg) + SPACING.xl + keyboardInset,
    },
  ];

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : IS_NATIVE ? "height" : "padding"}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={scrollContentStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled={false}
        >
          {form}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (colors, isDark, wide, compact) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: wide ? "center" : "flex-start",
      paddingTop: compact ? SPACING.md : SPACING.lg,
    },
    shell: {
      width: "100%",
      maxWidth: wide ? 1040 : 500,
      alignSelf: "center",
      flexDirection: wide ? "row" : "column",
      alignItems: wide ? "stretch" : "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: wide ? 28 : RADIUS.xl,
      overflow: wide ? "hidden" : "visible",
      ...(IS_NATIVE
        ? {}
        : {
            shadowColor: "#000",
            shadowOpacity: isDark ? 0.3 : 0.1,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 8,
          }),
    },

    brandPanel: {
      flex: wide ? 0.45 : undefined,
      width: wide ? undefined : "100%",
      padding: wide ? 44 : 0,
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      overflow: "hidden",
    },
    brandContent: { zIndex: 2 },
    brandOrbTop: {
      position: "absolute",
      width: 280,
      height: 280,
      borderRadius: 140,
      top: -110,
      right: -90,
      backgroundColor: colors.violet,
      opacity: isDark ? 0.12 : 0.1,
    },
    brandOrbBottom: {
      position: "absolute",
      width: 230,
      height: 230,
      borderRadius: 115,
      bottom: -95,
      left: -80,
      backgroundColor: colors.mint,
      opacity: isDark ? 0.09 : 0.08,
    },
    logoBadge: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.lg,
      shadowColor: colors.violet,
      shadowOpacity: 0.2,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
    },
    logoLarge: { width: 55, height: 55 },
    brandPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    brandPillText: {
      color: colors.textMuted,
      fontSize: 9.5,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    brandTitle: {
      color: colors.text,
      fontSize: 36,
      lineHeight: 42,
      fontWeight: "900",
      letterSpacing: -1.1,
      marginTop: SPACING.lg,
    },
    brandSubtitle: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      marginTop: SPACING.md,
      maxWidth: 340,
    },
    featureList: { gap: SPACING.md, marginTop: 28 },
    featureRow: { flexDirection: "row", alignItems: "center", gap: 11 },
    featureIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    featureText: {
      flex: 1,
      color: colors.text,
      fontSize: 12.5,
      lineHeight: 18,
      fontWeight: "600",
    },
    trustCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 30,
      padding: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
    },
    avatarStack: { flexDirection: "row", alignItems: "center" },
    avatar: {
      width: 29,
      height: 29,
      borderRadius: 15,
      borderWidth: 2,
      borderColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    trustTitle: { color: colors.text, fontSize: 11.5, fontWeight: "800" },
    trustMeta: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },

    formPanel: {
      flex: wide ? 1 : undefined,
      width: wide ? undefined : "100%",
      justifyContent: wide ? "center" : "flex-start",
      paddingHorizontal: wide ? 46 : compact ? SPACING.md : SPACING.lg,
      paddingVertical: wide ? 34 : compact ? SPACING.lg : SPACING.xl,
    },
    formInner: { width: "100%", maxWidth: 430, alignSelf: "center" },
    mobileBrand: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginBottom: compact ? SPACING.lg : SPACING.xl,
    },
    mobileLogoWrap: {
      width: 48,
      height: 48,
      borderRadius: 15,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    logoMobile: { width: 38, height: 38 },
    mobileBrandName: {
      color: colors.text,
      fontSize: 19,
      fontWeight: "900",
      letterSpacing: -0.3,
    },
    headingRow: { marginBottom: compact ? SPACING.lg : 20 },
    stepPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 10,
    },
    stepDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violet,
    },
    stepDotText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
    stepText: {
      color: colors.violet,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    stepTextMuted: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.7,
    },
    title: {
      color: colors.text,
      fontSize: compact ? 24 : 28,
      lineHeight: compact ? 30 : 34,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 20,
      marginTop: 6,
    },
    formFields: { width: "100%" },
    errorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      backgroundColor: ERROR_COLOR + (isDark ? "18" : "10"),
      borderWidth: 1,
      borderColor: ERROR_COLOR + "55",
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: SPACING.md,
    },
    errorText: {
      flex: 1,
      color: ERROR_COLOR,
      fontSize: 12.5,
      lineHeight: 18,
      fontWeight: "600",
    },
    signupButton: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.md,
      shadowColor: colors.tomato,
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4,
    },
    signupButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
    buttonPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
    buttonDisabled: { opacity: 0.65 },
    termsText: {
      color: colors.textMuted,
      fontSize: 10.5,
      lineHeight: 16,
      textAlign: "center",
      marginTop: 10,
      paddingHorizontal: SPACING.sm,
    },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginVertical: 14,
    },
    divider: { height: 1, flex: 1, backgroundColor: colors.border },
    dividerText: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.7,
    },
    loginButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
    },
    loginButtonText: { color: colors.text, fontSize: 14, fontWeight: "800" },
    backHome: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 9,
      marginTop: 4,
    },
    backHomeText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  });
