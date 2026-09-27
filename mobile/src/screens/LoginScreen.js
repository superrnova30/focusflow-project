import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { AuthField } from "../components/AuthField";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useStableLayout } from "../hooks/useStableLayout";
import { RADIUS, SPACING } from "../theme/theme";

const IS_NATIVE = Platform.OS === "ios" || Platform.OS === "android";

const ERROR_COLOR = "#EF4444";

export default function LoginScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { wide, compact } = useStableLayout(820);
  const styles = useMemo(
    () => createStyles(colors, isDark, wide, compact),
    [colors, isDark, wide, compact]
  );
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);
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
    if (!normalizedEmail || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    if (!normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      await login(normalizedEmail, password);
      // Navigation happens automatically — RootNavigator re-renders once
      // `user` is set and routes by role.
    } catch (e) {
      if (e.requiresVerification) {
        navigation.navigate("VerifyEmail", { email: e.email, autoSend: true });
      } else if (e.maintenanceMode) {
        setError("The app is currently in maintenance mode. Please try again later.");
      } else {
        setError(e.message);
      }
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
                    <Ionicons name="sparkles" size={13} color={colors.amber} />
                    <Text style={styles.brandPillText}>BUILT FOR STUDENTS</Text>
                  </View>

                  <Text style={styles.brandTitle}>Focus better.{"\n"}Learn smarter.</Text>
                  <Text style={styles.brandSubtitle}>
                    Your AI-powered study space for focused sessions, smarter notes, and measurable progress.
                  </Text>

                  <View style={styles.featureList}>
                    {[
                      ["timer-outline", "Stay focused with smart Pomodoro sessions"],
                      ["sparkles-outline", "Turn your notes into AI study materials"],
                      ["trending-up-outline", "Track progress and build better habits"],
                    ].map(([icon, text]) => (
                      <View key={text} style={styles.featureRow}>
                        <View style={styles.featureIcon}>
                          <Ionicons name={icon} size={17} color={colors.violet} />
                        </View>
                        <Text style={styles.featureText}>{text}</Text>
                      </View>
                    ))}
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
                  <View style={styles.headingCopy}>
                    <Text style={styles.eyebrow}>WELCOME BACK</Text>
                    <Text style={styles.title}>Sign in to FocusFlow</Text>
                    <Text style={styles.subtitle}>
                      Continue your study journey and pick up where you left off.
                    </Text>
                  </View>
                </View>

                <View style={styles.formFields}>
                  <AuthField
                    label="Email address"
                    icon="mail-outline"
                    colors={colors}
                    value={email}
                    onChangeText={setEmail}
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
                    placeholder="Enter your password"
                    secureTextEntry
                    inputRef={passwordRef}
                    {...(!IS_NATIVE
                      ? {
                          autoComplete: "current-password",
                          textContentType: "password",
                          returnKeyType: "done",
                          onSubmitEditing: submit,
                        }
                      : {})}
                  />

                  <View style={styles.passwordActions}>
                    <Pressable
                      onPress={() => navigation.navigate("ForgotPassword")}
                      hitSlop={8}
                      style={({ pressed }) => pressed && { opacity: 0.65 }}
                    >
                      <Text style={styles.forgotText}>Forgot password?</Text>
                    </Pressable>
                  </View>

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
                    accessibilityLabel="Sign in"
                    style={({ pressed }) => [
                      styles.loginButton,
                      pressed && !loading && styles.buttonPressed,
                      loading && styles.buttonDisabled,
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.loginButtonText}>Sign in</Text>
                        <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                      </>
                    )}
                  </Pressable>
                </View>

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>NEW TO FOCUSFLOW?</Text>
                  <View style={styles.divider} />
                </View>

                <Pressable
                  onPress={() => navigation.navigate("Signup")}
                  style={({ pressed }) => [
                    styles.signupButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.signupButtonText}>Create a free account</Text>
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

  return (
    <Screen>
      {IS_NATIVE ? (
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          nestedScrollEnabled={false}
        >
          {form}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="always"
          >
            {form}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const createStyles = (colors, isDark, wide, compact) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: "flex-start",
      paddingTop: compact ? SPACING.md : SPACING.lg,
      paddingBottom: 320,
    },
    shell: {
      width: "100%",
      maxWidth: wide ? 980 : 480,
      minHeight: wide ? 620 : undefined,
      alignSelf: "center",
      flexDirection: wide ? "row" : "column",
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
      width: "47%",
      padding: 44,
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      overflow: "hidden",
    },
    brandContent: { zIndex: 2 },
    brandOrbTop: {
      position: "absolute",
      width: 260,
      height: 260,
      borderRadius: 130,
      top: -95,
      right: -85,
      backgroundColor: colors.violet,
      opacity: isDark ? 0.12 : 0.1,
    },
    brandOrbBottom: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 110,
      bottom: -90,
      left: -80,
      backgroundColor: colors.amber,
      opacity: isDark ? 0.1 : 0.09,
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
    featureList: { gap: SPACING.md, marginTop: 30 },
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

    formPanel: {
      flex: wide ? 1 : undefined,
      justifyContent: wide ? "center" : "flex-start",
      paddingHorizontal: wide ? 46 : compact ? SPACING.lg : SPACING.xl,
      paddingVertical: wide ? 42 : compact ? SPACING.lg : 24,
    },
    formInner: { width: "100%", maxWidth: 410, alignSelf: "center" },
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
    headingRow: { marginBottom: compact ? SPACING.lg : SPACING.xl },
    headingCopy: { width: "100%" },
    eyebrow: {
      color: colors.violet,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
      marginBottom: 7,
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
      marginTop: 7,
    },
    formFields: { width: "100%" },
    passwordActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: -4,
      marginBottom: SPACING.lg,
    },
    forgotText: { color: colors.violet, fontSize: 12.5, fontWeight: "800" },
    errorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      backgroundColor: ERROR_COLOR + (isDark ? "18" : "10"),
      borderWidth: 1,
      borderColor: ERROR_COLOR + "55",
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: SPACING.md,
    },
    errorText: { flex: 1, color: ERROR_COLOR, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
    loginButton: {
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
    loginButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
    buttonPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
    buttonDisabled: { opacity: 0.65 },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginVertical: SPACING.lg,
    },
    divider: { height: 1, flex: 1, backgroundColor: colors.border },
    dividerText: {
      color: colors.textMuted,
      fontSize: 9.5,
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    signupButton: {
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
    },
    signupButtonText: { color: colors.text, fontSize: 14, fontWeight: "800" },
    backHome: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      marginTop: SPACING.sm,
    },
    backHomeText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  });
