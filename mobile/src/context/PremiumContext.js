import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import client from '../api/client';
import { useAuth } from './AuthContext';

const PremiumContext = createContext(null);

/**
 * Central place for everything "Go Unlimited". The entitlement itself always
 * comes from the server (via /auth/me, which the AuthContext already refreshes
 * on every app boot), so premium survives logout/login and page reloads. This
 * context layers on the plan details, checkout and payment verification.
 */
export function PremiumProvider({ children }) {
  const { user, refreshUser } = useAuth();

  const [plan, setPlan] = useState(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [status, setStatus] = useState(null);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [limits, setLimits] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // The auth user object already carries a derived `premium` block.
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
      // Sync auth only when entitlement changed — refreshing the whole user object
      // on every poll was retriggering effects keyed on `user` and looping on web.
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

  /**
   * Starts a real Xendit checkout and returns the hosted invoice URL.
   * The amount is decided entirely server-side.
   */
  const startCheckout = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const { data } = await client.post('/premium/checkout', {}, { timeout: 45000 });
      if (mountedRef.current && data.payment) setPendingPayment(data.payment);
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  }, []);

  /**
   * Asks the server to verify the payment against Xendit directly. Access is
   * granted by the server, never by this client.
   */
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
      }
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, [refreshUser, refreshLimits, user?.premium?.isPremium]);

  /**
   * Polls verification for a short window after the student returns from
   * checkout. Xendit's webhook can land a moment after the redirect, so the
   * success screen waits for the entitlement to actually appear.
   */
  const pollForActivation = useCallback(
    async ({ attempts = 6, intervalMs = 2500, paymentId } = {}) => {
      for (let i = 0; i < attempts; i += 1) {
        try {
          const result = await verifyPayment(paymentId ? { paymentId } : {});
          if (result && result.verified) return result;
          if (result && result.premium && result.premium.isPremium) return result;
        } catch (e) {
          // keep polling; transient errors are expected while Xendit settles
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      // Final authoritative read so the caller still gets fresh state.
      return refreshStatus();
    },
    [verifyPayment, refreshStatus]
  );

  const openCheckoutUrl = useCallback(async (url) => {
    if (!url) return false;
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

  const value = {
    plan,
    loadingPlan,
    starting,
    error,
    paymentsEnabled,
    sandbox,
    premium,
    isPremium,
    limits,
    status,
    pendingPayment,
    loadPlan,
    refreshStatus,
    refreshLimits,
    startCheckout,
    verifyPayment,
    pollForActivation,
    openCheckoutUrl,
  };

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside a PremiumProvider');
  return ctx;
}

export default PremiumContext;
