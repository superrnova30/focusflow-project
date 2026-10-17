import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  AppState,
  Linking,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { RADIUS } from "../theme/theme";
import client, { CHECKOUT_TIMEOUT_MS, ensureApiBaseUrlReady } from "../api/client";
import CoinIcon from "../components/CoinIcon";
import ConfirmDialog from "../components/ConfirmDialog";
import PaymentConfirmingModal from "../components/PaymentConfirmingModal";
import { setCachedCoins } from "../lib/coins";
import { isValidXenditCheckoutUrl, checkoutOpenErrorMessage } from "../lib/xenditCheckout";

const ICON_COLORS = {
  amber: { color: "#DE911D", soft: "#FEF3DD" },
  tomato: { color: "#FF5A76", soft: "#FFE8EE" },
  violet: { color: "#6C5CE7", soft: "#EEEAFF" },
};

export default function ShopScreen() {
  const { colors, isDark } = useTheme();
  const { refreshUser } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 400;
  const styles = useMemo(() => createStyles(colors, compact, isDark), [colors, compact, isDark]);

  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);
  const [packBusy, setPackBusy] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [pendingPayment, setPendingPayment] = useState(null);
  const [localSandbox, setLocalSandbox] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmPhase, setConfirmPhase] = useState("confirming");
  const [creditedCoins, setCreditedCoins] = useState(0);

  const awaitingRef = useRef(false);
  const paymentIdRef = useRef(null);
  const verifyLockRef = useRef(false);

  const applyWallet = useCallback((wallet) => {
    if (!wallet) return;
    setCatalog((current) => (current ? { ...current, ...wallet } : current));
    if (wallet.coins != null) setCachedCoins(wallet.coins);
  }, []);

  const loadCatalog = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/shop/catalog");
      setCatalog(data);
      if (data?.coins != null) setCachedCoins(data.coins);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load the shop.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadCatalog(true); }, [loadCatalog]));

  const verifyPayment = useCallback(async () => {
    const paymentId = paymentIdRef.current;
    if (!paymentId) return null;
    const { data } = await client.post("/shop/coins/verify", { paymentId }, { timeout: 30000 });
    if (data?.wallet) applyWallet(data.wallet);
    if (data?.verified) {
      setCreditedCoins(data.coinsGranted || data.payment?.coinsGranted || 0);
      await refreshUser().catch(() => {});
    }
    return data;
  }, [applyWallet, refreshUser]);

  const runVerification = useCallback(async () => {
    if (verifyLockRef.current || !paymentIdRef.current) return;
    verifyLockRef.current = true;
    setConfirmPhase("confirming");
    setConfirmVisible(true);
    try {
      let last = null;
      for (let i = 0; i < 6; i += 1) {
        try {
          last = await verifyPayment();
          if (last?.verified) {
            awaitingRef.current = false;
            setConfirmPhase("success");
            setPendingPayment(null);
            setLocalSandbox(false);
            return;
          }
          if (last?.failed) {
            awaitingRef.current = false;
            setConfirmPhase("failed");
            return;
          }
        } catch {
          // retry
        }
        if (i < 5) await new Promise((r) => setTimeout(r, 2000));
      }
      awaitingRef.current = false;
      setConfirmPhase("pending");
    } finally {
      verifyLockRef.current = false;
    }
  }, [verifyPayment]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && awaitingRef.current) runVerification();
    });
    return () => sub.remove();
  }, [runVerification]);

  useEffect(() => {
    const onUrl = ({ url }) => {
      if (!url || !/shop\/success|shop\/return/i.test(url)) return;
      if (/shop\/failed|status=failed/i.test(url)) return;
      awaitingRef.current = true;
      runVerification();
    };
    const sub = Linking.addEventListener("url", onUrl);
    return () => sub.remove();
  }, [runVerification]);

  const spend = async (item) => {
    if (buying) return;
    setBuying(item.id);
    try {
      const { data } = await client.post("/game/coins/spend", { item: item.id });
      applyWallet(data);
      setConfirmItem(null);
      setCatalog((current) => current ? {
        ...current,
        coins: data.coins,
        hearts: data.hearts ?? current.hearts,
        hints: data.hints ?? current.hints,
        streakFreezes: data.streakFreezes ?? current.streakFreezes,
      } : current);
    } catch (e) {
      setCheckoutError(e?.response?.data?.error || "Could not complete that purchase.");
    } finally {
      setBuying(null);
    }
  };

  const openCheckoutUrl = async (url) => {
    if (!url || !isValidXenditCheckoutUrl(url)) return false;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.open) {
        window.open(url, "_blank", "noopener,noreferrer");
        return true;
      }
      return false;
    }
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  };

  const buyPack = async (pack) => {
    if (packBusy) return;
    setPackBusy(pack.id);
    setCheckoutError("");
    try {
      await ensureApiBaseUrlReady();
      const { data } = await client.post("/shop/coins/checkout", { packId: pack.id }, { timeout: CHECKOUT_TIMEOUT_MS });
      setPendingPayment(data.payment || null);
      setLocalSandbox(Boolean(data.localSandbox));
      paymentIdRef.current = data.payment?.id || null;

      if (data.localSandbox && !data.checkoutUrl) {
        setCheckoutError("Test checkout is ready. Tap Complete test payment to credit coins after simulated GCash success.");
        return;
      }

      const url = data.checkoutUrl;
      if (!url || !isValidXenditCheckoutUrl(url)) {
        setCheckoutError(checkoutOpenErrorMessage(url));
        return;
      }
      awaitingRef.current = true;
      const opened = await openCheckoutUrl(url);
      if (!opened) {
        setCheckoutError("Could not open GCash checkout. Allow pop-ups, then try again.");
        awaitingRef.current = false;
      }
    } catch (e) {
      setCheckoutError(e?.response?.data?.error || e.message || "Could not start GCash checkout.");
    } finally {
      setPackBusy(null);
    }
  };

  const completeSandbox = async () => {
    if (!pendingPayment?.id || packBusy) return;
    setPackBusy("sandbox");
    setCheckoutError("");
    try {
      const { data } = await client.post("/shop/coins/sandbox/pay", { paymentId: pendingPayment.id });
      if (data?.wallet) applyWallet(data.wallet);
      setCreditedCoins(data.coinsGranted || pendingPayment.coinsGranted || 0);
      setConfirmPhase("success");
      setConfirmVisible(true);
      setPendingPayment(null);
      setLocalSandbox(false);
      await refreshUser().catch(() => {});
    } catch (e) {
      setCheckoutError(e?.response?.data?.error || "Could not complete the test payment.");
    } finally {
      setPackBusy(null);
    }
  };

  if (loading && !catalog) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.violet} size="large" />
          <Text style={styles.muted}>Loading shop…</Text>
        </View>
      </Screen>
    );
  }

  const coins = catalog?.coins || 0;
  const rewards = catalog?.rewards || [];
  const packs = catalog?.packs || [];
  const rewardDisabled = (item) => {
    if (buying) return true;
    if (coins < item.price) return true;
    if (item.id === "super_heart" && (catalog.unlimitedHearts || catalog.hearts >= catalog.maxHearts)) return true;
    if (item.id === "hint" && catalog.unlimitedHints) return true;
    if (item.id === "streak_freeze" && (catalog.streakFreezes || 0) >= (catalog.maxStreakFreezes || 5)) return true;
    return false;
  };

  const rewardMeta = (item) => {
    if (item.id === "hint") return catalog.unlimitedHints ? "Unlimited on your plan" : `${catalog.hints || 0} available`;
    if (item.id === "super_heart") return catalog.unlimitedHearts ? "Unlimited on your plan" : `${catalog.hearts || 0}/${catalog.maxHearts || 5} hearts`;
    if (item.id === "streak_freeze") return `${catalog.streakFreezes || 0} ready`;
    return "";
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCatalog(true); }} tintColor={colors.violet} />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <CoinIcon size={28} />
          </View>
          <Text style={styles.heroLabel}>Your coins</Text>
          <Text style={styles.heroValue}>{coins}</Text>
          <Text style={styles.heroHint}>Earn coins from streaks, or buy more with GCash.</Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.section}>Spend coins</Text>
        {rewards.map((item) => {
          const palette = ICON_COLORS[item.color] || ICON_COLORS.violet;
          const disabled = rewardDisabled(item);
          return (
            <Pressable
              key={item.id}
              onPress={() => { setCheckoutError(""); setConfirmItem(item); }}
              disabled={disabled}
              style={({ pressed }) => [styles.rewardCard, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
            >
              <View style={[styles.rewardIcon, { backgroundColor: isDark ? colors.bg : palette.soft }]}>
                <Ionicons name={item.icon} size={22} color={palette.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rewardTitle}>{item.name}</Text>
                <Text style={styles.rewardCopy}>{item.description}</Text>
                <Text style={styles.rewardMeta}>{rewardMeta(item)}</Text>
              </View>
              <View style={styles.priceChip}>
                {buying === item.id ? (
                  <ActivityIndicator size="small" color="#3F2A00" />
                ) : (
                  <>
                    <CoinIcon size={14} />
                    <Text style={styles.priceText}>{item.price}</Text>
                  </>
                )}
              </View>
            </Pressable>
          );
        })}

        <Text style={styles.section}>Buy coins with GCash</Text>
        <Text style={styles.sectionHint}>Pay on Xendit’s secure page. Coins are added only after payment is verified.</Text>
        {!catalog?.paymentsEnabled ? (
          <View style={styles.infoBox}>
            <Ionicons name="card-outline" size={18} color={colors.violet} />
            <Text style={styles.infoText}>Coin purchases are unavailable right now. You can still spend coins you already have.</Text>
          </View>
        ) : (
          packs.map((pack) => (
            <Pressable
              key={pack.id}
              onPress={() => buyPack(pack)}
              disabled={Boolean(packBusy)}
              style={({ pressed }) => [styles.packCard, pressed && styles.pressed]}
            >
              <View style={styles.packLeft}>
                <Text style={styles.packName}>{pack.name}</Text>
                <Text style={styles.packCoins}>{pack.coins} coins</Text>
                {pack.tag ? <Text style={styles.packTag}>{pack.tag}</Text> : null}
              </View>
              <View style={styles.packCta}>
                {packBusy === pack.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={styles.packPrice}>₱{pack.amount}</Text>
                    <Text style={styles.packPay}>Pay with GCash</Text>
                  </>
                )}
              </View>
            </Pressable>
          ))
        )}

        {catalog?.testMode ? (
          <Text style={styles.testHint}>{catalog.testModeInstructions || "Xendit Test Mode — no real charges."}</Text>
        ) : null}

        {checkoutError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{checkoutError}</Text>
          </View>
        ) : null}

        {localSandbox && pendingPayment ? (
          <Pressable onPress={completeSandbox} style={styles.sandboxBtn}>
            {packBusy === "sandbox" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sandboxText}>Complete test payment</Text>
            )}
          </Pressable>
        ) : null}

        {pendingPayment && !localSandbox ? (
          <Pressable onPress={runVerification} style={styles.checkBtn}>
            <Ionicons name="refresh" size={16} color={colors.violet} />
            <Text style={styles.checkText}>I’ve paid — check my coins</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={Boolean(confirmItem)}
        title={confirmItem ? `Buy ${confirmItem.name}?` : ""}
        message={confirmItem ? `This costs ${confirmItem.price} coins and will be taken from your balance immediately.` : ""}
        confirmText="Buy"
        cancelText="Cancel"
        loading={Boolean(buying)}
        onCancel={() => !buying && setConfirmItem(null)}
        onConfirm={() => confirmItem && spend(confirmItem)}
      />

      <PaymentConfirmingModal
        visible={confirmVisible}
        phase={confirmPhase}
        successTitle="Coins added"
        successBody={
          creditedCoins
            ? `${creditedCoins} coins are now in your wallet.`
            : "Your coins are now in your wallet."
        }
        failedBody="No coins were added. Complete GCash checkout on Xendit, then check again."
        onDismiss={() => {
          setConfirmVisible(false);
          setConfirmPhase("confirming");
        }}
        onRetryCheck={() => runVerification()}
      />
    </Screen>
  );
}

const createStyles = (colors, compact, isDark) =>
  StyleSheet.create({
    page: { paddingBottom: 40, maxWidth: 720, width: "100%", alignSelf: "center" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    muted: { color: colors.textMuted },
    hero: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: "#F0C96A",
      borderRadius: RADIUS.xl,
      paddingVertical: compact ? 18 : 22,
      paddingHorizontal: 16,
      alignItems: "center",
      marginBottom: 18,
    },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "#FFE8A3",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    heroLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
    heroValue: { color: colors.text, fontSize: compact ? 34 : 40, fontWeight: "900", marginTop: 2 },
    heroHint: { color: colors.textMuted, fontSize: 12.5, textAlign: "center", marginTop: 6, maxWidth: 320, lineHeight: 18 },
    section: { color: colors.text, fontSize: 16, fontWeight: "800", marginBottom: 6, marginTop: 8 },
    sectionHint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
    rewardCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 12,
      marginBottom: 10,
    },
    rewardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    rewardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
    rewardCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
    rewardMeta: { color: colors.violet, fontSize: 11, fontWeight: "700", marginTop: 4 },
    priceChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "#FFE8A3",
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 10,
      minWidth: 58,
      justifyContent: "center",
    },
    priceText: { color: "#3F2A00", fontWeight: "900", fontSize: 13 },
    packCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },
    packLeft: { flex: 1, minWidth: 0 },
    packName: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
    packCoins: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 2 },
    packTag: { color: colors.violet, fontSize: 11.5, fontWeight: "700", marginTop: 3 },
    packCta: {
      backgroundColor: colors.tomato,
      borderRadius: 12,
      minWidth: compact ? 108 : 122,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: "center",
    },
    packPrice: { color: "#fff", fontSize: 16, fontWeight: "900" },
    packPay: { color: "rgba(255,255,255,0.86)", fontSize: 10.5, fontWeight: "700", marginTop: 2 },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
    errorBox: { backgroundColor: colors.tomatoSoft, borderRadius: 12, padding: 12, marginBottom: 12 },
    errorText: { color: colors.text, fontSize: 12.5, lineHeight: 18 },
    infoBox: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
      backgroundColor: colors.violetSoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    infoText: { flex: 1, color: colors.text, fontSize: 12.5, lineHeight: 18 },
    testHint: { color: colors.mint, fontSize: 12, lineHeight: 17, marginBottom: 12 },
    sandboxBtn: {
      backgroundColor: colors.violet,
      borderRadius: 12,
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
    },
    sandboxText: { color: "#fff", fontWeight: "800" },
    checkBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginTop: 8,
    },
    checkText: { color: colors.violet, fontWeight: "800", fontSize: 13 },
  });
