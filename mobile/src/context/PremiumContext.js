import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import client, { CHECKOUT_TIMEOUT_MS, ensureApiBaseUrlReady } from '../api/client';
import { useAuth } from './AuthContext';
import { isValidXenditCheckoutUrl, checkoutOpenErrorMessage } from '../lib/xenditCheckout';
import GoUnlimitedCheckoutModal from '../components/GoUnlimitedCheckoutModal';
import PaymentConfirmingModal from '../components/PaymentConfirmingModal';
import { navigationRef } from '../lib/navigationRef';

const PremiumContext = createContext(null);

const DEFAULT_TEST_INSTRUCTIONS =
  'On the Xendit page: pick GCash, Maya, or Card, then use the red "Simulate payment" banner (Test Mode) to finish.';

export function PremiumProvider({ children }) {
  const { user, refreshUser } = useAuth();

  const [plan, setPlan] = useState(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [status, setStatus] = useState(null);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [limits, setLimits] = useState(null);

  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [checkoutModalError, setCheckoutModalError] = useState(null);
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [testModeInstructions, setTestModeInstructions] = useState(DEFAULT_TEST_INSTRUCTIONS);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmPhase, setConfirmPhase] = useState('confirming');

  const mountedRef = useRef(true);
  const checkoutInFlightRef = useRef(false);
  const cachedCheckoutUrlRef = useRef(null);
  const activePaymentIdRef = useRef(null);
  const awaitingPaymentVerifyRef = useRef(false);
  const verifyInProgressRef = useRef(false);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const premium = (user && user.premium) || {
    isPremium: false,
    plan: null,
    planLabel: 'Basic',
    daysRemaining: 0,
    expired: false,
  };

  const isPremium = Boolean(premium.isPremium);

  const refreshLimits = useCallback(async () => {
    if (!user?.id) {
      setLimits(null);
      return null;
    }
    try {
      const { data } = await client.get('/game/state', { timeout: 15000 });
      if (!mountedRef.current) return data?.limits || null;
      setLimits(data?.limits || null);
      return data?.limits || null;
    } catch (e) {
      return null;
    }
  }, [user?.id]);

  const loadPlan = useCallback(async () => {
    setLoadingPlan(true);
    try {
      const { data } = await client.get('/premium/plan', { timeout: 15000 });
      if (!mountedRef.current) return;
      setPlan(data.plan || null);
      setPaymentsEnabled(Boolean(data.paymentsEnabled));
      setSandbox(Boolean(data.sandbox));
      setTestMode(Boolean(data.testMode));
      if (data.testModeInstructions) setTestModeInstructions(data.testModeInstructions);
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoadingPlan(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await client.get('/premium/status', { timeout: 15000 });
      if (!mountedRef.current) return data;
      setStatus(data.premium || null);
      setPendingPayment(data.pendingPayment || null);
      setPaymentsEnabled(Boolean(data.paymentsEnabled));
      setSandbox(Boolean(data.sandbox));
      setTestMode(Boolean(data.testMode));

      const pendingUrl = data.pendingPayment?.checkoutUrl;
      if (pendingUrl && isValidXenditCheckoutUrl(pendingUrl)) {
        cachedCheckoutUrlRef.current = pendingUrl;
        activePaymentIdRef.current = data.pendingPayment.id;
      }

      const serverPremium = Boolean(data.premium?.isPremium);
      const localPremium = Boolean(user?.premium?.isPremium);
      if (serverPremium !== localPremium) {
        await refreshUser().catch(() => {});
      }
      return data;
    } catch (e) {
      if (mountedRef.current) setError(e.message);
      return null;
    }
  }, [refreshUser, user?.premium?.isPremium]);

  useEffect(() => {
    if (!user?.id) {
      setPlan(null);
      setStatus(null);
      setPendingPayment(null);
      return;
    }
    loadPlan();
    refreshStatus();
    refreshLimits();
  }, [user?.id, loadPlan, refreshStatus, refreshLimits]);

  const verifyPayment = useCallback(async (params = {}) => {
    try {
      const { data } = await client.post('/premium/verify', params, { timeout: 30000 });
      if (data.premium) setStatus(data.premium);
      if (data.premium?.isPremium) {
        if (!user?.premium?.isPremium) {
          await refreshUser().catch(() => {});
        }
        await refreshLimits();
        setPendingPayment(null);
        cachedCheckoutUrlRef.current = null;
      }
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, [refreshUser, refreshLimits, user?.premium?.isPremium]);

  const pollForActivation = useCallback(
    async ({ attempts = 6, intervalMs = 2500, paymentId } = {}) => {
      for (let i = 0; i < attempts; i += 1) {
        try {
          const result = await verifyPayment(paymentId ? { paymentId } : {});
          if (result && result.verified) return result;
          if (result && result.premium && result.premium.isPremium) return result;
        } catch (e) {
          // keep polling
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      return refreshStatus();
    },
    [verifyPayment, refreshStatus]
  );

  const runPostCheckoutVerification = useCallback(
    async ({ showConfirming = true } = {}) => {
      if (verifyInProgressRef.current || isPremium) return;
      verifyInProgressRef.current = true;
      if (showConfirming) {
        setConfirmPhase('confirming');
        setConfirmModalVisible(true);
      }
      try {
        const paymentId = activePaymentIdRef.current;
        let lastResult = null;
        for (let i = 0; i < 6; i += 1) {
          try {
            lastResult = await verifyPayment(paymentId ? { paymentId } : {});
            if (lastResult?.verified || lastResult?.premium?.isPremium) {
              awaitingPaymentVerifyRef.current = false;
              setCheckoutModalVisible(false);
              setCheckoutModalError(null);
              setConfirmPhase('success');
              await refreshLimits();
              return;
            }
            if (lastResult?.failed) {
              awaitingPaymentVerifyRef.current = false;
              setConfirmPhase('failed');
              return;
            }
          } catch (e) {
            // retry
          }
          if (i < 5) {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
        awaitingPaymentVerifyRef.current = false;
        setConfirmPhase('pending');
      } finally {
        verifyInProgressRef.current = false;
      }
    },
    [verifyPayment, isPremium, refreshLimits]
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && awaitingPaymentVerifyRef.current) {
        runPostCheckoutVerification();
      }
    });
    return () => sub.remove();
  }, [runPostCheckoutVerification]);

  useEffect(() => {
    const onUrl = ({ url }) => {
      if (!url || !/premium\/return|premium\/success/i.test(url)) return;
      if (/status=failed|premium\/failed/i.test(url)) return;
      awaitingPaymentVerifyRef.current = true;
      runPostCheckoutVerification();
    };
    const sub = Linking.addEventListener('url', onUrl);
    Linking.getInitialURL()
      .then((url) => {
        if (url) onUrl({ url });
      })
      .catch(() => {});
    return () => sub.remove();
  }, [runPostCheckoutVerification]);

  const startCheckout = useCallback(async () => {
    if (checkoutInFlightRef.current) {
      const err = new Error('Checkout is already in progress.');
      err.code = 'CHECKOUT_IN_FLIGHT';
      throw err;
    }
    checkoutInFlightRef.current = true;
    setStarting(true);
    setError(null);
    try {
      await ensureApiBaseUrlReady();
      const { data } = await client.post('/premium/checkout', {}, { timeout: CHECKOUT_TIMEOUT_MS });
      if (mountedRef.current && data.payment) setPendingPayment(data.payment);
      if (data.checkoutUrl && isValidXenditCheckoutUrl(data.checkoutUrl)) {
        cachedCheckoutUrlRef.current = data.checkoutUrl;
        activePaymentIdRef.current = data.payment?.id || null;
      }
      if (data.testModeInstructions) {
        setTestModeInstructions(data.testModeInstructions);
      }
      return data;
    } catch (e) {
      if (mountedRef.current) setError(e.message);
      throw e;
    } finally {
      checkoutInFlightRef.current = false;
      if (mountedRef.current) setStarting(false);
    }
  }, []);

  const openCheckoutUrl = useCallback(async (url) => {
    if (!url || !isValidXenditCheckoutUrl(url)) return false;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.open) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
      }
      return false;
    }
    try {
      await Linking.openURL(url);
      return true;
    } catch (e) {
      return false;
    }
  }, []);

  const showGoUnlimitedCheckoutModal = useCallback(() => {
    if (isPremium) return;
    if (!paymentsEnabled) {
      Alert.alert(
        'Payments unavailable',
        'Go Unlimited is not available right now. Check Xendit Test Mode configuration on the server.'
      );
      return;
    }
    setCheckoutModalError(null);
    setCheckoutModalVisible(true);
  }, [isPremium, paymentsEnabled]);

  const closeCheckoutModal = useCallback(() => {
    setCheckoutModalVisible(false);
    setCheckoutModalError(null);
    setOpeningCheckout(false);
  }, []);

  const handleCheckoutCancel = useCallback(() => {
    closeCheckoutModal();
  }, [closeCheckoutModal]);

  const handleCheckoutGoBack = useCallback(() => {
    closeCheckoutModal();
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  }, [closeCheckoutModal]);

  const handleOpenCheckout = useCallback(async () => {
    if (openingCheckout || checkoutInFlightRef.current) return;

    setOpeningCheckout(true);
    setCheckoutModalError(null);

    try {
      let url = cachedCheckoutUrlRef.current;
      if (!url || !isValidXenditCheckoutUrl(url)) {
        const data = await startCheckout();
        if (data?.localSandbox && !data?.checkoutUrl) {
          setCheckoutModalError(
            'Hosted Xendit checkout requires a Secret API key (xnd_development_…). Set it in backend/.env and restart the server.'
          );
          return;
        }
        url = data?.checkoutUrl;
      }

      if (!url || !isValidXenditCheckoutUrl(url)) {
        setCheckoutModalError(checkoutOpenErrorMessage(url));
        return;
      }

      awaitingPaymentVerifyRef.current = true;
      const opened = await openCheckoutUrl(url);
      if (!opened) {
        setCheckoutModalError('Could not open the browser. Allow pop-ups or tap Open Checkout again.');
        return;
      }
    } catch (e) {
      setCheckoutModalError(e?.message || 'Could not start checkout. Please try again.');
    } finally {
      if (mountedRef.current) setOpeningCheckout(false);
    }
  }, [openingCheckout, startCheckout, openCheckoutUrl]);

  /** @deprecated name kept for callers — only opens the checkout modal (no API call). */
  const beginGoUnlimitedCheckout = useCallback(() => {
    showGoUnlimitedCheckoutModal();
    return { ok: true };
  }, [showGoUnlimitedCheckoutModal]);

  const value = {
    plan,
    loadingPlan,
    starting,
    openingCheckout,
    error,
    paymentsEnabled,
    sandbox,
    testMode,
    premium,
    isPremium,
    limits,
    status,
    pendingPayment,
    loadPlan,
    refreshStatus,
    refreshLimits,
    startCheckout,
    showGoUnlimitedCheckoutModal,
    beginGoUnlimitedCheckout,
    verifyPayment,
    pollForActivation,
    openCheckoutUrl,
  };

  return (
    <PremiumContext.Provider value={value}>
      {children}
      <GoUnlimitedCheckoutModal
        visible={checkoutModalVisible && !isPremium}
        onOpenCheckout={handleOpenCheckout}
        onCancel={handleCheckoutCancel}
        onGoBack={handleCheckoutGoBack}
        opening={openingCheckout}
        error={checkoutModalError}
        testMode={testMode}
        testInstructions={testMode ? testModeInstructions : null}
      />
      <PaymentConfirmingModal
        visible={confirmModalVisible}
        phase={confirmPhase}
        onDismiss={() => {
          setConfirmModalVisible(false);
          setConfirmPhase('confirming');
        }}
        onRetryCheck={() => runPostCheckoutVerification({ showConfirming: false })}
      />
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside a PremiumProvider');
  return ctx;
}

export default PremiumContext;
