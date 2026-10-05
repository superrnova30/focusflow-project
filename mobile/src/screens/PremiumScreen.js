import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { SPACING, RADIUS } from '../theme/theme';

const BENEFITS = [
  { label: 'Unlimited Cards', desc: 'Build every deck you need', icon: 'layers-outline', basic: true, basicDetail: 'Included' },
  { label: 'Unlimited Hearts', desc: 'Keep going without losing progress', icon: 'heart-outline', basic: false, basicDetail: '5 hearts · 24h refill' },
  { label: 'Unlimited AI Tutor', desc: 'Deck tutor lessons without caps', icon: 'school-outline', basic: false, basicDetail: '3 sessions/day' },
  { label: 'Unlimited Hints', desc: 'Get unstuck faster in Memorize', icon: 'bulb-outline', basic: false, basicDetail: '3 hints/day' },
  { label: 'Unlimited AI Chat', desc: 'Talk to your study assistant freely', icon: 'chatbubbles-outline', basic: false, basicDetail: '15 messages/day' },
  { label: 'Unlimited AI Generations', desc: 'Study packs, imports, coach & more', icon: 'sparkles-outline', basic: false, basicDetail: '10 generations/day' },
];

const VALUE_PROPS = [
  { icon: 'trending-up-outline', label: 'Study without limits' },
  { icon: 'flash-outline', label: 'Instant activation' },
  { icon: 'shield-checkmark-outline', label: 'Secure checkout' },
];

const GOLD = '#FFC15E';
const GOLD_DEEP = '#E8A020';
const GOLD_DARK = '#1A1400';

function useGlowPulse() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

function BenefitStatus({ included, colors, isUnlimited }) {
  if (isUnlimited) {
    return (
      <View style={[statusStyles.wrap, { backgroundColor: GOLD + '22' }]}>
        <Ionicons name="star" size={14} color={GOLD_DEEP} />
      </View>
    );
  }
  if (included) {
    return (
      <View style={[statusStyles.wrap, { backgroundColor: colors.border + '88' }]}>
        <Ionicons name="checkmark" size={14} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <View style={[statusStyles.wrap, { backgroundColor: 'transparent' }]}>
      <Ionicons name="remove" size={14} color={colors.textMuted + '66'} />
    </View>
  );
}

const statusStyles = StyleSheet.create({
  wrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function PremiumScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 380;
  const wide = width >= 560;
  const s = useMemo(() => createStyles(colors, width, compact, wide), [colors, width, compact, wide]);

  const {
    plan,
    loadingPlan,
    starting,
    paymentsEnabled,
    premium,
    isPremium,
    showGoUnlimitedCheckoutModal,
  } = usePremium();

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroRise = useRef(new Animated.Value(18)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const glow = useGlowPulse();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(heroRise, { toValue: 0, duration: 480, useNativeDriver: true }),
      Animated.timing(contentOpacity, { toValue: 1, duration: 560, delay: 120, useNativeDriver: true }),
    ]).start();
  }, [heroOpacity, heroRise, contentOpacity]);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.2] });

  const currencySymbol = plan?.currency === 'PHP' ? '₱' : plan?.currency === 'USD' ? '$' : '';
  const priceLabel = plan ? `${currencySymbol}${plan.price}` : '—';
  const perLabel = plan ? `every ${plan.durationDays} days` : '';
  const dailyLabel =
    plan && plan.durationDays
      ? `${currencySymbol}${(plan.price / plan.durationDays).toFixed(2)}/day`
      : null;

  const handleSeePlans = useCallback(async () => {
    if (starting) return;

    if (!paymentsEnabled) {
      Alert.alert(
        'Payments unavailable',
        'Payments are temporarily unavailable. Please try again later.'
      );
      return;
    }

    showGoUnlimitedCheckoutModal();
  }, [starting, paymentsEnabled, showGoUnlimitedCheckoutModal]);

  const renderComparisonTable = () => (
    <View style={[s.table, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.tableHead, { borderBottomColor: colors.border, backgroundColor: colors.surfaceRaised || colors.surface }]}>
        <View style={s.benefitHeadCol}>
          <Text style={[s.tableHeadText, { color: colors.textMuted }]}>Feature</Text>
        </View>
        <View style={s.planHeadCol}>
          <Text style={[s.tableHeadText, { color: colors.textMuted }]}>Basic</Text>
        </View>
        <View style={[s.planHeadCol, s.unlimitedHeadCol, { backgroundColor: GOLD + (isDark ? '14' : '18') }]}>
          <Ionicons name="star" size={11} color={GOLD_DEEP} />
          <Text style={[s.tableHeadText, { color: GOLD_DEEP }]}>Unlimited</Text>
        </View>
      </View>

      {BENEFITS.map((row, index) => (
        <View
          key={row.label}
          style={[
            s.tableRow,
            { borderBottomColor: colors.border },
            index === BENEFITS.length - 1 && { borderBottomWidth: 0 },
          ]}
        >
          <View style={s.benefitHeadCol}>
            <View style={[s.benefitIconWrap, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name={row.icon} size={16} color={colors.violet} />
            </View>
            <View style={s.benefitTextWrap}>
              <Text style={[s.benefitLabel, { color: colors.text }]} numberOfLines={1}>
                {row.label}
              </Text>
              {!compact && (
                <Text style={[s.benefitDesc, { color: colors.textMuted }]} numberOfLines={1}>
                  {row.desc}
                </Text>
              )}
            </View>
          </View>
          <View style={s.planHeadCol}>
            {row.basic ? (
              <BenefitStatus included colors={colors} />
            ) : (
              <Text style={[s.basicLimitText, { color: colors.textMuted }]} numberOfLines={2}>
                {row.basicDetail}
              </Text>
            )}
          </View>
          <View style={[s.planHeadCol, s.unlimitedHeadCol, { backgroundColor: GOLD + (isDark ? '0A' : '10') }]}>
            <BenefitStatus included colors={colors} isUnlimited />
          </View>
        </View>
      ))}
    </View>
  );

  const renderPlanCards = () => (
    <View style={s.planCardsRow}>
      <View style={[s.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.planCardLabel, { color: colors.textMuted }]}>Basic</Text>
        <Text style={[s.planCardPrice, { color: colors.text }]}>Free</Text>
        <Text style={[s.planCardMeta, { color: colors.textMuted }]}>Limited access</Text>
        <View style={s.planCardList}>
          {BENEFITS.map((row) => (
            <View key={row.label} style={s.planCardListRow}>
              <Ionicons
                name={row.basic ? 'checkmark-circle' : 'close-circle-outline'}
                size={16}
                color={row.basic ? colors.textMuted : colors.textMuted + '55'}
              />
              <Text style={[s.planCardListText, { color: row.basic ? colors.text : colors.textMuted }]}>
                {row.basic ? row.label : `${row.label.replace(/^Unlimited /, '')} · ${row.basicDetail}`}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[s.planCard, s.planCardFeatured, { backgroundColor: colors.surface, borderColor: GOLD }]}>
        <Animated.View
          pointerEvents="none"
          style={[s.planCardGlow, { backgroundColor: GOLD, opacity: glowOpacity }]}
        />
        <View style={[s.featuredBadge, { backgroundColor: GOLD }]}>
          <Ionicons name="star" size={10} color={GOLD_DARK} />
          <Text style={s.featuredBadgeText}>RECOMMENDED</Text>
        </View>
        <Text style={[s.planCardLabel, { color: GOLD_DEEP }]}>Go Unlimited</Text>
        {loadingPlan ? (
          <ActivityIndicator color={GOLD} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
        ) : (
          <>
            <Text style={[s.planCardPrice, { color: colors.text }]}>{priceLabel}</Text>
            <Text style={[s.planCardMeta, { color: colors.textMuted }]}>{perLabel}</Text>
          </>
        )}
        <View style={s.planCardList}>
          {BENEFITS.map((row) => (
            <View key={row.label} style={s.planCardListRow}>
              <Ionicons name="star" size={14} color={GOLD_DEEP} />
              <Text style={[s.planCardListText, { color: colors.text }]}>{row.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  const ctaLabel = isPremium ? 'Extend subscription' : 'Get Go Unlimited';
  const showStickyCta = !isPremium || premium.daysRemaining <= 7;

  return (
    <Screen>
      <View style={s.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.scrollContent,
            { paddingBottom: showStickyCta ? 100 + insets.bottom : 40 + insets.bottom },
          ]}
        >
          {/* Hero */}
          <Animated.View
            style={[
              s.hero,
              {
                backgroundColor: isPremium ? colors.mintSoft : colors.violetSoft,
                borderColor: isPremium ? colors.mint + '55' : GOLD + '44',
                opacity: heroOpacity,
                transform: [{ translateY: heroRise }],
              },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                s.heroOrb,
                { backgroundColor: isPremium ? colors.mint : GOLD, opacity: glowOpacity },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                s.heroOrbSecondary,
                { backgroundColor: colors.violet, opacity: glowOpacity },
              ]}
            />

            <View style={[s.crownBubble, { backgroundColor: colors.surface, borderColor: GOLD + '55' }]}>
              <Text style={s.crownEmoji}>{isPremium ? '✨' : '👑'}</Text>
            </View>

            <View style={[s.heroPill, { backgroundColor: colors.surface, borderColor: GOLD + '66' }]}>
              <Ionicons name="star" size={12} color={GOLD_DEEP} />
              <Text style={[s.heroPillText, { color: GOLD_DEEP }]}>GO UNLIMITED</Text>
            </View>

            <Text style={[s.heroTitle, { color: colors.text }]}>
              {isPremium ? 'You\'re on Go Unlimited' : 'Unlock your full study potential'}
            </Text>
            <Text style={[s.heroSubtitle, { color: colors.textMuted }]}>
              {isPremium
                ? 'Every premium feature is active on your account. Keep the momentum going.'
                : 'Remove every limit — unlimited cards, hearts, AI tutoring, hints, and prompts in one plan.'}
            </Text>

            {isPremium && (
              <View style={[s.activeCard, { backgroundColor: colors.surface, borderColor: colors.mint + '66' }]}>
                <View style={[s.activeIconWrap, { backgroundColor: colors.mintSoft }]}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.mint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.activeTitle, { color: colors.mint }]}>Subscription active</Text>
                  <Text style={[s.activeMeta, { color: colors.textMuted }]}>
                    {premium.daysRemaining} day{premium.daysRemaining === 1 ? '' : 's'} remaining
                    {premium.premiumUntil
                      ? ` · renews ${new Date(premium.premiumUntil).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}`
                      : ''}
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>

          {/* Value props */}
          <Animated.View style={[s.valueRow, { opacity: contentOpacity }]}>
            {VALUE_PROPS.map((item) => (
              <View
                key={item.label}
                style={[s.valueChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name={item.icon} size={15} color={colors.violet} />
                <Text style={[s.valueChipText, { color: colors.textMuted }]} numberOfLines={2}>
                  {item.label}
                </Text>
              </View>
            ))}
          </Animated.View>

          {/* Comparison */}
          <Animated.View style={{ opacity: contentOpacity }}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Compare plans</Text>
            <Text style={[s.sectionSubtitle, { color: colors.textMuted }]}>
              See what you get with Go Unlimited vs Basic
            </Text>
            {wide ? renderPlanCards() : renderComparisonTable()}

            {/* Pricing summary (inline when not using sticky-only layout) */}
            {!wide && (
              <View style={[s.priceSummary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.priceSummaryLabel, { color: colors.textMuted }]}>GO UNLIMITED</Text>
                  {loadingPlan ? (
                    <ActivityIndicator color={GOLD} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
                  ) : (
                    <>
                      <View style={s.priceRow}>
                        <Text style={[s.priceAmount, { color: colors.text }]}>{priceLabel}</Text>
                        <Text style={[s.pricePeriod, { color: colors.textMuted }]}>{perLabel}</Text>
                      </View>
                      {dailyLabel && (
                        <Text style={[s.priceDaily, { color: colors.violet }]}>{dailyLabel}</Text>
                      )}
                    </>
                  )}
                </View>
                <View style={[s.cancelBadge, { backgroundColor: colors.violetSoft }]}>
                  <Ionicons name="close-circle-outline" size={14} color={colors.violet} />
                  <Text style={[s.cancelBadgeText, { color: colors.violet }]}>Cancel anytime</Text>
                </View>
              </View>
            )}
          </Animated.View>

          {/* Inline CTA for wide screens or premium extend */}
          {(wide || isPremium) && (
            <Animated.View style={{ opacity: contentOpacity, marginTop: SPACING.xl }}>
              <Pressable
                onPress={handleSeePlans}
                disabled={starting || loadingPlan}
                style={({ pressed }) => [
                  s.ctaButton,
                  { backgroundColor: GOLD, opacity: pressed || starting ? 0.9 : 1 },
                ]}
              >
                {starting ? (
                  <>
                    <ActivityIndicator color={GOLD_DARK} />
                    <Text style={s.ctaButtonText}>Preparing secure checkout…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name={isPremium ? 'refresh' : 'diamond-outline'} size={20} color={GOLD_DARK} />
                    <Text style={s.ctaButtonText}>{ctaLabel}</Text>
                    <Ionicons name="arrow-forward" size={18} color={GOLD_DARK} />
                  </>
                )}
              </Pressable>
            </Animated.View>
          )}

          <Text style={[s.fineprint, { color: colors.textMuted }]}>
            Secure payment powered by Xendit. Your account is upgraded only after payment is verified on our server.
          </Text>

          <View style={s.trustGrid}>
            {[
              { icon: 'lock-closed-outline', text: 'Encrypted checkout' },
              { icon: 'rocket-outline', text: 'Instant access' },
              { icon: 'heart-outline', text: 'No lock-in' },
            ].map((item) => (
              <View
                key={item.text}
                style={[s.trustItem, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Ionicons name={item.icon} size={16} color={colors.mint} />
                <Text style={[s.trustText, { color: colors.textMuted }]}>{item.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Sticky bottom CTA — mobile-first, hidden on wide when inline CTA is shown */}
        {showStickyCta && !wide && (
          <View
            style={[
              s.stickyBar,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={s.stickyPrice}>
              {loadingPlan ? (
                <ActivityIndicator color={GOLD} size="small" />
              ) : (
                <>
                  <Text style={[s.stickyPriceAmount, { color: colors.text }]}>{priceLabel}</Text>
                  <Text style={[s.stickyPriceMeta, { color: colors.textMuted }]}>{perLabel}</Text>
                </>
              )}
            </View>
            <Pressable
              onPress={handleSeePlans}
              disabled={starting || loadingPlan}
              style={({ pressed }) => [
                s.stickyCta,
                { backgroundColor: GOLD, opacity: pressed || starting ? 0.9 : 1 },
              ]}
            >
              {starting ? (
                <>
                  <ActivityIndicator color={GOLD_DARK} size="small" />
                  <Text style={s.stickyCtaText}>Preparing…</Text>
                </>
              ) : (
                <Text style={s.stickyCtaText}>{ctaLabel}</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </Screen>
  );
}

const createStyles = (colors, width, compact, wide) => {
  const planColWidth = compact ? 56 : 72;
  const contentMaxWidth = Math.min(width - SPACING.lg * 2, 720);

  return StyleSheet.create({
    root: { flex: 1 },
    scrollContent: {
      paddingTop: SPACING.md,
      maxWidth: contentMaxWidth,
      width: '100%',
      alignSelf: 'center',
    },

    /* Hero */
    hero: {
      borderWidth: 1,
      borderRadius: RADIUS.xl,
      padding: compact ? SPACING.lg : SPACING.xl,
      alignItems: 'center',
      overflow: 'hidden',
    },
    heroOrb: {
      position: 'absolute',
      top: -80,
      right: -40,
      width: 220,
      height: 220,
      borderRadius: 110,
    },
    heroOrbSecondary: {
      position: 'absolute',
      bottom: -60,
      left: -50,
      width: 160,
      height: 160,
      borderRadius: 80,
    },
    crownBubble: {
      width: compact ? 56 : 64,
      height: compact ? 56 : 64,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      shadowColor: GOLD,
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    crownEmoji: { fontSize: compact ? 26 : 30 },
    heroPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginTop: SPACING.md,
    },
    heroPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
    heroTitle: {
      fontSize: compact ? 22 : wide ? 28 : 25,
      fontWeight: '900',
      textAlign: 'center',
      lineHeight: compact ? 28 : wide ? 34 : 31,
      letterSpacing: -0.6,
      marginTop: SPACING.md,
    },
    heroSubtitle: {
      fontSize: compact ? 13 : 14,
      lineHeight: compact ? 20 : 22,
      textAlign: 'center',
      marginTop: SPACING.sm,
      maxWidth: 480,
      paddingHorizontal: compact ? 0 : SPACING.sm,
    },
    activeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginTop: SPACING.lg,
      width: '100%',
    },
    activeIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activeTitle: { fontSize: 14, fontWeight: '800' },
    activeMeta: { fontSize: 12, marginTop: 2, lineHeight: 17 },

    /* Value props */
    valueRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginTop: SPACING.lg,
      justifyContent: wide ? 'center' : 'flex-start',
    },
    valueChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flex: compact ? 1 : undefined,
      minWidth: compact ? '47%' : undefined,
    },
    valueChipText: { fontSize: 11, fontWeight: '700', flexShrink: 1 },

    /* Sections */
    sectionTitle: {
      fontSize: compact ? 17 : 19,
      fontWeight: '800',
      marginTop: SPACING.xl,
      letterSpacing: -0.3,
    },
    sectionSubtitle: {
      fontSize: 13,
      marginTop: 4,
      marginBottom: SPACING.md,
      lineHeight: 19,
    },

    /* Comparison table */
    table: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
    },
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: compact ? 10 : 14,
      borderBottomWidth: 1,
    },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: compact ? 11 : 13,
      paddingHorizontal: compact ? 10 : 14,
      borderBottomWidth: 1,
    },
    tableHeadText: { fontSize: compact ? 9 : 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    benefitHeadCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, paddingRight: 6 },
    planHeadCol: { width: planColWidth, alignItems: 'center', justifyContent: 'center' },
    unlimitedHeadCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      borderRadius: 8,
    },
    benefitIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    benefitTextWrap: { flex: 1, minWidth: 0 },
    benefitLabel: { fontSize: compact ? 12.5 : 13.5, fontWeight: '700' },
    benefitDesc: { fontSize: 11, marginTop: 1 },
    basicLimitText: { fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 13, paddingHorizontal: 2 },

    /* Plan cards (wide) */
    planCardsRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      alignItems: 'stretch',
    },
    planCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      overflow: 'hidden',
    },
    planCardFeatured: {
      borderWidth: 2,
      shadowColor: GOLD,
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    planCardGlow: {
      position: 'absolute',
      top: -40,
      right: -40,
      width: 140,
      height: 140,
      borderRadius: 70,
    },
    featuredBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: SPACING.sm,
    },
    featuredBadgeText: { fontSize: 9, fontWeight: '900', color: GOLD_DARK, letterSpacing: 0.8 },
    planCardLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    planCardPrice: { fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
    planCardMeta: { fontSize: 12, fontWeight: '600', marginTop: 2, marginBottom: SPACING.md },
    planCardList: { gap: 10 },
    planCardListRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    planCardListText: { fontSize: 13, fontWeight: '600', flex: 1 },

    /* Price summary */
    priceSummary: {
      flexDirection: compact ? 'column' : 'row',
      alignItems: compact ? 'flex-start' : 'center',
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginTop: SPACING.md,
      gap: SPACING.md,
    },
    priceSummaryLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4, flexWrap: 'wrap' },
    priceAmount: { fontSize: 26, fontWeight: '900', letterSpacing: -0.8 },
    pricePeriod: { fontSize: 12, fontWeight: '600' },
    priceDaily: { fontSize: 12, fontWeight: '700', marginTop: 4 },
    cancelBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignSelf: compact ? 'flex-start' : 'center',
    },
    cancelBadgeText: { fontSize: 11, fontWeight: '800' },

    /* CTA */
    ctaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: RADIUS.lg,
      paddingVertical: 16,
      shadowColor: GOLD,
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    ctaButtonText: { fontSize: 16, fontWeight: '900', color: GOLD_DARK },

    fineprint: {
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      marginTop: SPACING.lg,
      paddingHorizontal: SPACING.sm,
    },
    trustGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.lg,
    },
    trustItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    trustText: { fontSize: 11.5, fontWeight: '700' },

    /* Sticky bar */
    stickyBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      borderTopWidth: 1,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -4 },
      elevation: 12,
    },
    stickyPrice: { flex: 1, minWidth: 0 },
    stickyPriceAmount: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
    stickyPriceMeta: { fontSize: 11, fontWeight: '600', marginTop: 1 },
    stickyCta: {
      borderRadius: RADIUS.md,
      paddingVertical: 14,
      paddingHorizontal: SPACING.xl,
      minWidth: 148,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stickyCtaText: { fontSize: 15, fontWeight: '900', color: GOLD_DARK },
  });
};
