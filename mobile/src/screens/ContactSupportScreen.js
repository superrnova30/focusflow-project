import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { RADIUS } from "../theme/theme";
import client from "../api/client";

const CATEGORIES = [
  { value: "ACCOUNT", label: "Account", icon: "person-outline" },
  { value: "SCHOOL_CHANGE", label: "School", icon: "school-outline" },
  { value: "PAYMENTS", label: "Payments", icon: "card-outline" },
  { value: "SHOP_COINS", label: "Coins", icon: "cash-outline" },
  { value: "BUG_REPORT", label: "Bug", icon: "bug-outline" },
  { value: "OTHER", label: "Other", icon: "ellipsis-horizontal" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FieldError({ message, colors }) {
  if (!message) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 }}>
      <Ionicons name="alert-circle" size={13} color={colors.tomato} />
      <Text style={{ color: colors.tomato, fontSize: 12, fontWeight: "600", flex: 1 }}>{message}</Text>
    </View>
  );
}

export default function ContactSupportScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const wide = width >= 860;
  const styles = useMemo(() => createStyles(colors, compact, wide), [colors, compact, wide]);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [sent, setSent] = useState(null);

  useEffect(() => {
    if (user?.email && !contactEmail) setContactEmail(user.email);
  }, [user?.email, contactEmail]);

  const validate = ({ showAll = false, touchOverride = null } = {}) => {
    const flags = touchOverride || touched;
    const next = {};
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    const cleanEmail = contactEmail.trim();

    if (showAll || flags.subject) {
      if (cleanSubject.length < 3) next.subject = "Use at least 3 characters.";
      else if (cleanSubject.length > 120) next.subject = "Keep the subject under 120 characters.";
    }
    if (showAll || flags.category) {
      if (!category) next.category = "Choose a category.";
    }
    if (showAll || flags.message) {
      if (cleanMessage.length < 10) next.message = "Add a bit more detail (at least 10 characters).";
      else if (cleanMessage.length > 4000) next.message = "Keep the message under 4000 characters.";
    }
    if (showAll || flags.contactEmail) {
      if (!EMAIL_RE.test(cleanEmail)) next.contactEmail = "Enter a valid email address.";
    }

    setFieldErrors(next);
    return {
      ok: Object.keys(next).length === 0,
      cleanSubject,
      cleanMessage,
      cleanEmail,
    };
  };

  const onBlur = (key) => {
    const next = { ...touched, [key]: true };
    setTouched(next);
    validate({ showAll: false, touchOverride: next });
  };

  const submit = async () => {
    setTouched({ subject: true, category: true, message: true, contactEmail: true });
    const result = validate({ showAll: true });
    if (!result.ok) {
      setFormError("Please fix the highlighted fields, then try again.");
      return;
    }

    setBusy(true);
    setFormError("");
    try {
      const { data } = await client.post("/support/tickets", {
        subject: result.cleanSubject,
        category,
        message: result.cleanMessage,
        contactEmail: result.cleanEmail,
      });
      setSent(data);
      setSubject("");
      setMessage("");
      setCategory("OTHER");
      setContactEmail(user?.email || result.cleanEmail);
      setTouched({});
      setFieldErrors({});
    } catch (e) {
      setFormError(e?.response?.data?.error || e.message || "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  };

  const formCard = (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Send a message</Text>
      <Text style={styles.formSubtitle}>
        Tell us what you need help with. We’ll reply to your email as soon as we can.
      </Text>

      <Text style={styles.label}>Subject</Text>
      <TextInput
        value={subject}
        onChangeText={(value) => {
          setSubject(value);
          if (formError) setFormError("");
        }}
        onBlur={() => onBlur("subject")}
        placeholder="Brief summary of your request"
        placeholderTextColor={colors.textMuted}
        maxLength={120}
        style={[
          styles.input,
          fieldErrors.subject && { borderColor: colors.tomato },
        ]}
        accessibilityLabel="Subject"
      />
      <View style={styles.fieldMeta}>
        <FieldError message={fieldErrors.subject} colors={colors} />
        <Text style={styles.counter}>{subject.trim().length}/120</Text>
      </View>

      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryRow}>
        {CATEGORIES.map((item) => {
          const on = category === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => {
                setCategory(item.value);
                setTouched((current) => ({ ...current, category: true }));
                if (formError) setFormError("");
              }}
              style={[
                styles.categoryChip,
                on && { backgroundColor: colors.violetSoft, borderColor: colors.violet },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={item.icon} size={14} color={on ? colors.violet : colors.textMuted} />
              <Text style={[styles.categoryChipText, on && { color: colors.violet }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FieldError message={fieldErrors.category} colors={colors} />

      <Text style={[styles.label, { marginTop: 12 }]}>Message</Text>
      <TextInput
        value={message}
        onChangeText={(value) => {
          setMessage(value);
          if (formError) setFormError("");
        }}
        onBlur={() => onBlur("message")}
        placeholder="What happened? Include steps, screens, or anything that helps us help you."
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
        maxLength={4000}
        style={[
          styles.input,
          styles.messageInput,
          fieldErrors.message && { borderColor: colors.tomato },
        ]}
        accessibilityLabel="Message"
      />
      <View style={styles.fieldMeta}>
        <FieldError message={fieldErrors.message} colors={colors} />
        <Text style={styles.counter}>{message.trim().length}/4000</Text>
      </View>

      <Text style={styles.label}>Reply-to email</Text>
      <TextInput
        value={contactEmail}
        onChangeText={(value) => {
          setContactEmail(value);
          if (formError) setFormError("");
        }}
        onBlur={() => onBlur("contactEmail")}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          fieldErrors.contactEmail && { borderColor: colors.tomato },
        ]}
        accessibilityLabel="Reply-to email"
      />
      <FieldError message={fieldErrors.contactEmail} colors={colors} />
      <Text style={styles.hint}>Defaults to your account email. Change it only if you need replies elsewhere.</Text>

      {formError ? (
        <View style={[styles.banner, { backgroundColor: colors.tomatoSoft, borderColor: colors.tomato + "44" }]}>
          <Ionicons name="warning-outline" size={16} color={colors.tomato} />
          <Text style={[styles.bannerText, { color: colors.tomato }]}>{formError}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={submit}
        disabled={busy}
        style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Send message"
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="send-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Send message</Text>
          </>
        )}
      </Pressable>
    </View>
  );

  const infoCard = (
    <View style={styles.infoColumn}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="chatbubbles-outline" size={22} color={colors.violet} />
        </View>
        <Text style={styles.heroTitle}>We’re here to help</Text>
        <Text style={styles.heroBody}>
          Reach the PomodAI team for account issues, school changes, payments, shop coins, or bugs.
          Clear details help us respond faster.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <View style={[styles.infoIcon, { backgroundColor: colors.mintSoft }]}>
          <Ionicons name="time-outline" size={18} color={colors.mint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.infoTitle}>Typical response</Text>
          <Text style={styles.infoBody}>Most requests get a reply within 1–2 business days.</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={[styles.infoIcon, { backgroundColor: colors.amberSoft }]}>
          <Ionicons name="mail-outline" size={18} color={colors.amber} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.infoTitle}>Email follow-up</Text>
          <Text style={styles.infoBody}>
            Replies go to your reply-to address, and you’ll also see updates in the app when available.
          </Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={[styles.infoIcon, { backgroundColor: colors.violetSoft }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.violet} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.infoTitle}>What to include</Text>
          <Text style={styles.infoBody}>
            Account email, school name, payment reference, or steps to reproduce a bug.
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Contact PomodAI</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
      >
        {sent?.ticket?.ticketCode ? (
          <View style={styles.successCard}>
            <View style={[styles.successIcon, { backgroundColor: colors.mintSoft }]}>
              <Ionicons name="checkmark-circle" size={28} color={colors.mint} />
            </View>
            <Text style={styles.successTitle}>Request submitted</Text>
            <Text style={styles.successCode}>Ticket {sent.ticket.ticketCode}</Text>
            <Text style={styles.successBody}>
              {sent.emailWarning ||
                sent.message ||
                "Thanks — our team received your message and will follow up by email."}
            </Text>
            <View style={styles.successActions}>
              <Pressable
                onPress={() => setSent(null)}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryBtnText}>Send another</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.layout}>
            {infoCard}
            {formCard}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, compact, wide) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 4,
      paddingBottom: 10,
      gap: 8,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      color: colors.text,
      fontSize: 17,
      fontWeight: "800",
    },
    headerSpacer: { width: 36 },
    page: { paddingBottom: 40 },
    layout: {
      flexDirection: wide ? "row" : "column",
      alignItems: "flex-start",
      gap: wide ? 16 : 12,
    },
    infoColumn: {
      width: wide ? "36%" : "100%",
      gap: 10,
      flexShrink: 0,
    },
    hero: {
      borderWidth: 1,
      borderColor: colors.violet + "33",
      backgroundColor: colors.violetSoft,
      borderRadius: 20,
      padding: compact ? 16 : 18,
      gap: 8,
    },
    heroIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    heroTitle: { color: colors.text, fontSize: compact ? 18 : 20, fontWeight: "900" },
    heroBody: { color: colors.textMuted, fontSize: 13.5, lineHeight: 20, fontWeight: "500" },
    infoCard: {
      flexDirection: "row",
      gap: 11,
      alignItems: "flex-start",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 13,
    },
    infoIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    infoTitle: { color: colors.text, fontSize: 13.5, fontWeight: "800" },
    infoBody: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 2, fontWeight: "500" },
    formCard: {
      flex: 1,
      width: wide ? undefined : "100%",
      minWidth: 0,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      padding: compact ? 14 : 18,
    },
    formTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
    formSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "500",
      marginTop: 4,
      marginBottom: 12,
    },
    label: {
      color: colors.text,
      fontSize: 12.5,
      fontWeight: "800",
      marginTop: 8,
      marginBottom: 6,
      letterSpacing: 0.2,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "ios" ? 13 : 11,
      fontSize: 15,
      fontWeight: "500",
      color: colors.text,
    },
    messageInput: { minHeight: compact ? 120 : 140, paddingTop: 12 },
    fieldMeta: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 2,
      minHeight: 18,
    },
    counter: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 5 },
    categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    categoryChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
    hint: { color: colors.textMuted, fontSize: 12, marginTop: 6, marginBottom: 4, fontWeight: "500", lineHeight: 17 },
    banner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderWidth: 1,
      borderRadius: 12,
      padding: 11,
      marginTop: 10,
    },
    bannerText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
    primaryBtn: {
      marginTop: 14,
      minHeight: 50,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.tomato,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    successCard: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 22,
      paddingVertical: compact ? 28 : 36,
      paddingHorizontal: 22,
    },
    successIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    successTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
    successCode: { color: colors.violet, fontSize: 14, fontWeight: "800", marginTop: 6 },
    successBody: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 8,
      maxWidth: 420,
      fontWeight: "500",
    },
    successActions: { flexDirection: "row", gap: 10, marginTop: 20, flexWrap: "wrap", justifyContent: "center" },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    secondaryBtnText: { color: colors.text, fontWeight: "800", fontSize: 14 },
    doneBtn: {
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    doneBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
    pressed: { opacity: 0.88 },
  });
