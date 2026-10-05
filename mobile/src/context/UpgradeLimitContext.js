import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import GoUnlimitedModal from "../components/GoUnlimitedModal";
import { usePremium } from "./PremiumContext";
import { messageForLimitCode, extractLimitCode, extractLimitMessage } from "../lib/limitMessages";
import { setUpgradeLimitBridge } from "../lib/upgradeLimitBridge";
const UpgradeLimitContext = createContext(null);

export function UpgradeLimitProvider({ children }) {
  const { isPremium, paymentsEnabled, showGoUnlimitedCheckoutModal } = usePremium();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  const close = useCallback(() => setVisible(false), []);

  const show = useCallback(
    ({ code, message: customMessage, error } = {}) => {
      if (isPremium) return;
      const resolvedCode = code || extractLimitCode(error);
      const fallback = customMessage || extractLimitMessage(error);
      setMessage(messageForLimitCode(resolvedCode, fallback));
      setVisible(true);
    },
    [isPremium]
  );

  const upgrade = useCallback(() => {
    setVisible(false);
    showGoUnlimitedCheckoutModal();
  }, [showGoUnlimitedCheckoutModal]);

  useEffect(() => {
    setUpgradeLimitBridge({
      isPremium: () => isPremium,
      paymentsEnabled: () => paymentsEnabled,
      openGoUnlimitedCheckoutModal: () => showGoUnlimitedCheckoutModal(),
      beginGoUnlimitedCheckout: () => showGoUnlimitedCheckoutModal(),
      show: (opts) => show(opts),
    });
  }, [isPremium, paymentsEnabled, show, showGoUnlimitedCheckoutModal]);

  return (
    <UpgradeLimitContext.Provider value={{ showUpgradeLimit: show, closeUpgradeLimit: close }}>
      {children}
      <GoUnlimitedModal
        visible={visible && !isPremium}
        message={message}
        onClose={close}
        onUpgrade={upgrade}
        loading={false}
      />
    </UpgradeLimitContext.Provider>
  );
}

export function useUpgradeLimit() {
  const ctx = useContext(UpgradeLimitContext);
  if (!ctx) throw new Error("useUpgradeLimit must be used inside UpgradeLimitProvider");
  return ctx;
}

export default UpgradeLimitContext;
