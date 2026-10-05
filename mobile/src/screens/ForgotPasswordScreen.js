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
  TextInput,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { AuthField } from "../components/AuthField";
import { PasswordHints } from "../components/PasswordHints";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { RADIUS, SPACING } from "../theme/theme";

const IS_NATIVE = Platform.OS === "ios" || Platform.OS === "android";
const ERROR_COLOR = "#EF4444";
const RESEND_COOLDOWN_MS = 45 * 1000;
const STEPS = [
  { key: "email", label: "Email", detail: "Enter your registered address" },
  { key: "code", label: "Code", detail: "Confirm the 6-digit email code" },
  { key: "password", label: "Password", detail: "Create and confirm a new password" },
];

export default function ForgotPasswordScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const compact = width < 400;
  const styles = useMemo(
    () => createStyles(colors, isDark, wide, compact),
    [colors, isDark, wide, compact]
  );
  const { requestPasswordReset, verifyResetCode, resetPassword } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [keyboardInset, setKeyboardInset] = useState(0);

  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

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

  useEffect(() => {
    if (!resendAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [resendAt]);

  const waitSec = Math.max(0, Math.ceil((resendAt + RESEND_COOLDOWN_MS - now) / 1000));
  const normalizedEmail = email.trim().toLowerCase();
  const activeIndex = STEPS.findIndex((item) => item.key === step);

  const sendCode = async () => {
    setError(null);
    setInfo("");
    if (!normalizedEmail) {
      setError("Enter the email address linked to your account.");
      return;
    }
    if (!normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(normalizedEmail);
      setInfo("If this email is registered, a 6-digit code is on its way.");
      setResendAt(Date.now());
      setCode("");
      setStep("code");
    } catch (e) {
      setError(e.message || "Unable to send a verification code right now.");
    } finally {
      setLoading(false);
    }
  };

  const confirmCode = async () => {
    setError(null);
    setInfo("");
    const trimmed = code.replace(/\s/g, "");
    if (!trimmed || trimmed.length < 6) {
      setError("Enter the 6-digit verification code from your email.");
      return;
    }
    setLoading(true);
    try {
      await verifyResetCode(normalizedEmail, trimmed);
      setInfo("");
      setNewPassword("");
      setConfirmPassword("");
      setStep("password");
    } catch (e) {
      setError(e.message || "That verification code is invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async () => {
    setError(null);
    setInfo("");
    if (!newPassword || !confirmPassword) {
      setError("Enter your new password twice to confirm it.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(normalizedEmail, code.replace(/\s/g, ""), newPassword);
      setStep("done");
    } catch (e) {
      setError(e.message || "Unable to reset your password. Request a new code and try again.");
    } finally {
      setLoading(false);
    }
  };

  const copy = {
    email: {
      title: "Forgot password",
      subtitle: "Enter the email on your account and we’ll send a verification code.",
    },
    code: {
      title: "Enter the code",
      subtitle: `We sent a 6-digit code to ${normalizedEmail}. It expires in 15 minutes.`,
    },
    password: {
      title: "Create a new password",
      subtitle: "Choose a new password, then type it again to confirm.",
    },
    done: {
      title: "Password reset",
      subtitle: "Your password was updated. Sign in with your new password to continue.",
    },
  }[step];

  const renderSteps = (withDetails = false) => {
    if (step === "done") return null;
    return (
      <View style={withDetails ? styles.guideList : styles.stepRow}>
        {STEPS.map((item, index) => {
          const active = index === activeIndex;
          const done = index < activeIndex;
          return (
            <View key={item.key} style={withDetails ? styles.guideItem : styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  active && styles.stepDotActive,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.stepDotText, active && styles.stepDotTextActive]}>{index + 1}</Text>
                )}
              </View>
              {withDetails ? (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.guideLabel, (active || done) && styles.stepLabelActive]}>{item.label}</Text>
                  <Text style={styles.guideDetail}>{item.detail}</Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.stepLabel, (active || done) && styles.stepLabelActive]}>{item.label}</Text>
                  {index < STEPS.length - 1 ? <View style={styles.stepLine} /> : null}
                </>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : IS_NATIVE ? "height" : "padding"}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(insets.top ? 0 : 12, 12),
              paddingBottom: Math.max(insets.bottom, 12) + keyboardInset,
            },
          ]}
        >
          <View style={styles.shell}>
            {wide ? (
              <View style={styles.brandPanel}>
                <View style={styles.brandRow}>
                  <View style={styles.logoWrap}>
                    <Image source={require("../theme/logo.png")} style={styles.logo} resizeMode="contain" />
                  </View>
                  <Text style={styles.brandName}>FocusFlow</Text>
                </View>
                <Text style={styles.brandTitle}>Reset your password in three short steps.</Text>
                <Text style={styles.brandSubtitle}>
                  We’ll email a verification code to your registered address before you can choose a new password.
                </Text>
                {renderSteps(true)}
              </View>
            ) : null}

            <View style={styles.formPanel}>
              {!wide ? (
                <View style={styles.brandRow}>
                  <View style={styles.logoWrap}>
                    <Image source={require("../theme/logo.png")} style={styles.logo} resizeMode="contain" />
                  </View>
                  <Text style={styles.brandName}>FocusFlow</Text>
                </View>
              ) : null}

              {!wide ? renderSteps(false) : null}

              <Text style={styles.title}>{copy.title}</Text>
              <Text style={styles.subtitle}>{copy.subtitle}</Text>

              {step === "email" ? (
                <AuthField
                  label="Email address"
                  icon="mail-outline"
                  colors={colors}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@gmail.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  {...(!IS_NATIVE
                    ? {
                        autoComplete: "email",
                        textContentType: "emailAddress",
                        returnKeyType: "done",
                        onSubmitEditing: sendCode,
                      }
                    : {})}
                />
              ) : null}

              {step === "code" ? (
                <>
                  <Text style={styles.fieldLabel}>Verification code</Text>
                  <TextInput
                    value={code}
                    onChangeText={(value) => setCode(value.replace(/[^\d]/g, "").slice(0, 6))}
                    placeholder="000000"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    style={styles.codeInput}
                  />
                </>
              ) : null}

              {step === "password" ? (
                <>
                  <AuthField
                    label="New password"
                    icon="lock-closed-outline"
                    colors={colors}
                    value={newPassword}
                    onChangeText={setNewPassword}
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
                          onSubmitEditing: submitNewPassword,
                        }
                      : {})}
                  />
                  <PasswordHints password={newPassword} confirmPassword={confirmPassword} colors={colors} />
                </>
              ) : null}

              {info && step === "code" ? (
                <View style={styles.infoBanner}>
                  <Ionicons name="information-circle" size={16} color={colors.violet} />
                  <Text style={styles.infoText}>{info}</Text>
                </View>
              ) : null}

              {error ? (
                <View style={styles.errorBanner} accessibilityRole="alert">
                  <Ionicons name="alert-circle" size={16} color={ERROR_COLOR} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

            {step === "email" ? (
              <>
                <Pressable
                  onPress={sendCode}
                  disabled={loading}
                  style={({ pressed }) => [styles.primaryBtn, (pressed || loading) && styles.pressed]}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.primaryBtnText}>Send verification code</Text>
                      <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setError(null);
                    if (!normalizedEmail) {
                      setError("Enter the email address linked to your account.");
                      return;
                    }
                    if (!normalizedEmail.includes("@")) {
                      setError("Enter a valid email address.");
                      return;
                    }
                    setInfo("Enter the 6-digit code from your email.");
                    setStep("code");
                  }}
                  style={({ pressed }) => [styles.secondaryLink, pressed && styles.pressed]}
                >
                  <Text style={styles.textLinkAccent}>I already have a code</Text>
                </Pressable>
              </>
            ) : null}

              {step === "code" ? (
                <>
                  <Pressable
                    onPress={confirmCode}
                    disabled={loading}
                    style={({ pressed }) => [styles.primaryBtn, (pressed || loading) && styles.pressed]}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Verify code</Text>
                    )}
                  </Pressable>
                  <View style={styles.linkRow}>
                    <Pressable
                      onPress={sendCode}
                      disabled={loading || waitSec > 0}
                      style={({ pressed }) => [styles.textLink, (pressed || loading) && styles.pressed]}
                    >
                      <Text style={[styles.textLinkAccent, waitSec > 0 && { color: colors.textMuted }]}>
                        {waitSec > 0 ? `Resend in ${waitSec}s` : "Resend code"}
                      </Text>
                    </Pressable>
                    <Text style={styles.linkDot}>·</Text>
                    <Pressable
                      onPress={() => {
                        setError(null);
                        setInfo("");
                        setStep("email");
                      }}
                      style={({ pressed }) => [styles.textLink, pressed && styles.pressed]}
                    >
                      <Text style={styles.textLinkMuted}>Different email</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}

              {step === "password" ? (
                <Pressable
                  onPress={submitNewPassword}
                  disabled={loading}
                  style={({ pressed }) => [styles.primaryBtn, (pressed || loading) && styles.pressed]}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Reset password</Text>
                  )}
                </Pressable>
              ) : null}

              {step === "done" ? (
                <Pressable
                  onPress={() => navigation.navigate("Login")}
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryBtnText}>Back to sign in</Text>
                  <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                </Pressable>
              ) : (
                <Pressable onPress={() => navigation.navigate("Login")} style={styles.backLink}>
                  <Ionicons name="arrow-back" size={15} color={colors.textMuted} />
                  <Text style={styles.backLinkText}>Back to sign in</Text>
                </Pressable>
              )}
            </View>
          </View>
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
      justifyContent: "center",
      alignItems: "stretch",
    },
    shell: {
      width: "100%",
      maxWidth: wide ? 800 : 440,
      alignSelf: "center",
      flexDirection: wide ? "row" : "column",
      alignItems: "stretch",
      flexGrow: 0,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      overflow: "hidden",
    },
    brandPanel: {
      width: 300,
      paddingHorizontal: 24,
      paddingVertical: 24,
      backgroundColor: colors.violetSoft,
    },
    formPanel: {
      flex: wide ? 1 : undefined,
      justifyContent: "flex-start",
      paddingHorizontal: wide ? 24 : compact ? 16 : 20,
      paddingVertical: wide ? 24 : compact ? 16 : 18,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: wide ? 18 : 12,
    },
    logoWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: wide ? colors.surface : colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    logo: { width: 24, height: 24 },
    brandName: { color: colors.text, fontSize: 16, fontWeight: "900" },
    brandTitle: {
      color: colors.text,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "900",
      letterSpacing: -0.5,
      marginBottom: 8,
    },
    brandSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 18,
    },
    guideList: { gap: 12 },
    guideItem: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    guideLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
    guideDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 },
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 14,
    },
    stepItem: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
    stepDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepDotActive: { backgroundColor: colors.violet, borderColor: colors.violet },
    stepDotDone: { backgroundColor: colors.mint, borderColor: colors.mint },
    stepDotText: { color: colors.textMuted, fontSize: 10, fontWeight: "800" },
    stepDotTextActive: { color: "#FFFFFF" },
    stepLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      marginLeft: 6,
    },
    stepLabelActive: { color: colors.text },
    stepLine: {
      width: compact ? 14 : 20,
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 8,
    },
    title: {
      color: colors.text,
      fontSize: compact ? 22 : 24,
      lineHeight: compact ? 26 : 30,
      fontWeight: "900",
      letterSpacing: -0.5,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
      marginBottom: 14,
    },
    fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 6 },
    codeInput: {
      height: 50,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: RADIUS.md,
      color: colors.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: 8,
      textAlign: "center",
      marginBottom: 10,
      ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
    },
    infoBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: RADIUS.md,
      backgroundColor: colors.violetSoft,
      marginBottom: 10,
    },
    infoText: { flex: 1, color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: "600" },
    errorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: RADIUS.md,
      backgroundColor: isDark ? "#3F1D1D" : "#FEF2F2",
      marginBottom: 10,
    },
    errorText: { flex: 1, color: ERROR_COLOR, fontSize: 12.5, lineHeight: 17, fontWeight: "600" },
    primaryBtn: {
      minHeight: 46,
      borderRadius: RADIUS.md,
      backgroundColor: colors.tomato,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 14,
    },
    primaryBtnText: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "800" },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 10,
    },
    textLink: { paddingVertical: 4 },
    secondaryLink: {
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 12,
    },
    textLinkAccent: { color: colors.violet, fontSize: 13, fontWeight: "800" },
    textLinkMuted: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    linkDot: { color: colors.textMuted, fontSize: 13 },
    backLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingTop: 12,
      paddingBottom: 2,
    },
    backLinkText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    pressed: { opacity: 0.78 },
  });
