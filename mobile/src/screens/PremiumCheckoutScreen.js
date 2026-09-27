import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import client from '../api/client';
import { SPACING, RADIUS } from '../theme/theme';

const GOLD = '#FFC15E';
const GOLD_DARK = '#1A1400';

const UNLIMITED_PERKS = [
  'Unlimited Cards',
  'Unlimited Hearts',
  'Unlimited AI Tutor',
  'Unlimited Hints',
  'Unlimited Prompts',
];

export default function PremiumCheckoutScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 380;
  const s = useMemo(() => createStyles(colors, compact), [colors, compact]);

  const checkoutUrl = route?.params?.checkoutUrl;
  const initialPaymentId = route?.params?.paymentId;

  const { pollForActivation, openCheckoutUrl, sandbox, refreshStatus } = usePremium();

  const [phase, setPhase] = useState('opening');
  const [paymentId, setPaymentId] = useState(initialPaymentId || null);
  const [message, setMessage] = useState(null);
  const [autoOpened, setAutoOpened] = useState(false);

  const spin = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0.85)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeIn]);

  useEffect(() => {
    if (phase === 'success' || phase === 'failed') return undefined;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [phase, spin]);

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  useEffect(() => {
    if (autoOpened || !checkoutUrl) return;
    setAutoOpened(true);
    (async () => {
      const opened = await openCheckoutUrl(checkoutUrl);
      setPhase('waiting');
      if (!opened) {
        setMessage('Tap "Open checkout" below to complete your payment.');
      }
    })();
  }, [autoOpened, checkoutUrl, openCheckoutUrl]);

  useEffect(() => {
    if (paymentId || !checkoutUrl) return;
    (async () => {
      try {
        const { data } = await client.get('/premium/status', { timeout: 15000 });
        if (data.pendingPayment?.id) setPaymentId(data.pendingPayment.id);
      } catch {
        // non-fatal
      }
    })();
  }, [paymentId, checkoutUrl]);

  const runVerification = useCallback(async () => {
    setPhase('verifying');
    setMessage(null);
    try {
      const result = await pollForActivation({ paymentId, attempts: 5, intervalMs: 2500 });

      if (result?.verified || result?.premium?.isPremium) {
        setPhase('success');
        Animated.spring(successScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
        return;
      }

      setPhase('waiting');
      setMessage('We have not received your payment yet. If you have already paid, tap "I\'ve paid" below.');
    } catch (e) {
      setPhase('waiting');
      setMessage(e.message || 'Verification failed. Please try again.');
    }
  }, [pollForActivation, paymentId, successScale]);

  const handleSandboxPay = useCallback(async () => {
    if (!sandbox) return;
    setPhase('verifying');
    try {
      await client.post('/premium/sandbox/pay', { paymentId }, { timeout: 20000 });
      await runVerification();
    } catch {
      setPhase('waiting');
      setMessage('We could not confirm the payment. Please try again.');
    }
  }, [sandbox, paymentId, runVerification]);

  const retryOpen = useCallback(async () => {
    const opened = await openCheckoutUrl(checkoutUrl);
    if (!opened) {
      Alert.alert('Could not open checkout', 'Please copy the checkout link and open it in a browser.');
    }
  }, [openCheckoutUrl, checkoutUrl]);

  const finish = useCallback(async () => {
    await refreshStatus().catch(() => {});
    navigation.navigate('Premium');
  }, [refreshStatus, navigation]);

  if (phase === 'success') {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: 40 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              s.successIconWrap,
              { backgroundColor: colors.mintSoft, borderColor: colors.mint, transform: [{ scale: successScale }] },
            ]}
          >
            <Ionicons name="checkmark" size={44} color={colors.mint} />
          </Animated.View>

          <Text style={[s.successTitle, { color: colors.text }]}>You're Unlimited!</Text>
          <Text style={[s.successBody, { color: colors.textMuted }]}>
            Payment verified — Go Unlimited is now active. Enjoy every premium feature without limits.
          </Text>

          <View style={[s.perksCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {UNLIMITED_PERKS.map((label) => (
              <View key={label} style={s.perkRow}>
                <View style={[s.perkIcon, { backgroundColor: GOLD + '22' }]}>
                  <Ionicons name="star" size={13} color={GOLD} />
                </View>
                <Text style={[s.perkText, { color: colors.text }]}>{label}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={finish} style={[s.primaryBtn, { backgroundColor: colors.tomato }]}>
            <Text style={s.primaryBtnTextLight}>Start studying</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  const steps = [
    { n: 1, label: 'Open checkout', done: autoOpened },
    { n: 2, label: 'Complete payment', done: false },
    { n: 3, label: 'Get verified', done: phase === 'verifying' },
  ];

  return (
    <Screen>
      <Animated.View style={[s.root, { opacity: fadeIn }]}>
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: 24 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.statusBubble, { backgroundColor: colors.violetSoft, borderColor: colors.border }]}>
            <Animated.View style={{ transform: [{ rotate: phase === 'verifying' ? rotation : '0deg' }] }}>
              <Ionicons
                name={phase === 'verifying' ? 'sync' : 'card-outline'}
                size={32}
                color={colors.violet}
              />
            </Animated.View>
          </View>

          <Text style={[s.title, { color: colors.text }]}>
            {phase === 'verifying' ? 'Verifying your payment…' : 'Complete your payment'}
          </Text>
          <Text style={[s.body, { color: colors.textMuted }]}>
            {phase === 'verifying'
              ? 'Confirming with Xendit — this usually takes a few seconds.'
              : 'Finish payment in the Xendit checkout window. Access is granted automatically once verified.'}
          </Text>

          <View style={[s.stepsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {steps.map((step, i) => (
              <View
                key={step.n}
                style={[s.stepRow, i < steps.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}
              >
                <View
                  style={[
                    s.stepNum,
                    {
                      backgroundColor: step.done ? colors.mintSoft : colors.violetSoft,
                      borderColor: step.done ? colors.mint : colors.border,
                    },
                  ]}
                >
                  {step.done ? (
                    <Ionicons name="checkmark" size={14} color={colors.mint} />
                  ) : (
                    <Text style={[s.stepNumText, { color: colors.textMuted }]}>{step.n}</Text>
                  )}
                </View>
                <Text style={[s.stepLabel, { color: colors.text }]}>{step.label}</Text>
              </View>
            ))}
          </View>

          {!!message && (
            <View style={[s.notice, { backgroundColor: colors.amberSoft, borderColor: colors.amber + '66' }]}>
              <Ionicons name="information-circle" size={18} color={colors.amber} />
              <Text style={[s.noticeText, { color: colors.text }]}>{message}</Text>
            </View>
          )}

          <View style={s.actionStack}>
            <Pressable onPress={retryOpen} style={[s.primaryBtn, { backgroundColor: GOLD }]}>
              <Ionicons name="open-outline" size={18} color={GOLD_DARK} />
              <Text style={[s.primaryBtnText, { color: GOLD_DARK }]}>Open checkout</Text>
            </Pressable>

            <Pressable
              onPress={runVerification}
              disabled={phase === 'verifying'}
              style={({ pressed }) => [
                s.secondaryBtn,
                { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              {phase === 'verifying' ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={17} color={colors.text} />
                  <Text style={[s.secondaryBtnText, { color: colors.text }]}>I've paid — verify now</Text>
                </>
              )}
            </Pressable>

            {sandbox && (
              <Pressable
                onPress={handleSandboxPay}
                style={[s.secondaryBtn, { borderColor: colors.amber, backgroundColor: colors.amberSoft }]}
              >
                <Ionicons name="flask-outline" size={17} color={colors.amber} />
                <Text style={[s.secondaryBtnText, { color: colors.text }]}>Complete payment</Text>
              </Pressable>
            )}

            <Pressable onPress={() => navigation.goBack()} style={s.linkBtn}>
              <Text style={[s.linkText, { color: colors.textMuted }]}>Cancel and go back</Text>
            </Pressable>
          </View>

          <Text style={[s.footnote, { color: colors.textMuted }]}>
            Access is granted only after our server confirms paid status directly with Xendit.
          </Text>
        </ScrollView>
      </Animated.View>
    </Screen>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: {
      alignItems: 'center',
      paddingTop: SPACING.xl,
      maxWidth: 520,
      width: '100%',
      alignSelf: 'center',
    },
    statusBubble: {
      width: 72,
      height: 72,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    title: {
      fontSize: compact ? 20 : 22,
      fontWeight: '900',
      marginTop: SPACING.lg,
      textAlign: 'center',
      letterSpacing: -0.4,
    },
    body: {
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: SPACING.sm,
      maxWidth: 400,
      paddingHorizontal: SPACING.sm,
    },
    stepsCard: {
      width: '100%',
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      marginTop: SPACING.xl,
      overflow: 'hidden',
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: 14,
      paddingHorizontal: SPACING.lg,
    },
    stepNum: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumText: { fontSize: 12, fontWeight: '800' },
    stepLabel: { fontSize: 14, fontWeight: '600' },
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginTop: SPACING.lg,
      width: '100%',
    },
    noticeText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
    actionStack: { width: '100%', gap: 10, marginTop: SPACING.xl },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      borderRadius: RADIUS.lg,
      paddingVertical: 15,
      width: '100%',
    },
    primaryBtnText: { fontSize: 15, fontWeight: '800' },
    primaryBtnTextLight: { color: '#fff', fontSize: 15, fontWeight: '800' },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      paddingVertical: 14,
      width: '100%',
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '700' },
    linkBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
    linkText: { fontSize: 13, fontWeight: '600' },
    footnote: {
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      marginTop: SPACING.lg,
      maxWidth: 380,
      paddingHorizontal: SPACING.sm,
    },
    successIconWrap: {
      width: 88,
      height: 88,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    successTitle: {
      fontSize: compact ? 24 : 26,
      fontWeight: '900',
      marginTop: SPACING.lg,
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    successBody: {
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: SPACING.sm,
      maxWidth: 420,
    },
    perksCard: {
      width: '100%',
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginTop: SPACING.xl,
      gap: 12,
    },
    perkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    perkIcon: {
      width: 28,
      height: 28,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    perkText: { fontSize: 14, fontWeight: '600' },
  });
