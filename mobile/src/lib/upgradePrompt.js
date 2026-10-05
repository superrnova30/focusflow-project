import { Alert } from "react-native";
import { getUpgradeLimitBridge } from "./upgradeLimitBridge";
import { extractLimitCode, extractLimitMessage } from "./limitMessages";
import { navigateToPremiumCheckout } from "./premiumNavigation"; // fallback when bridge not mounted yet

export function isUpgradeRequired(error) {
  return Boolean(
    error?.upgradeRequired
    || error?.response?.data?.upgradeRequired
    || error?.code === "DAILY_PROMPTS_EXCEEDED"
    || error?.code === "DAILY_CHAT_EXCEEDED"
    || error?.code === "DAILY_TUTOR_EXCEEDED"
    || error?.code === "HINTS_DEPLETED"
    || error?.code === "NO_HINTS_REMAINING"
    || error?.code === "TASK_LIMIT_EXCEEDED"
    || error?.code === "HEARTS_DEPLETED"
    || error?.response?.data?.code === "DAILY_PROMPTS_EXCEEDED"
    || error?.response?.data?.code === "DAILY_CHAT_EXCEEDED"
    || error?.response?.data?.code === "DAILY_TUTOR_EXCEEDED"
    || error?.response?.data?.code === "HINTS_DEPLETED"
    || error?.response?.data?.code === "NO_HINTS_REMAINING"
    || error?.response?.data?.code === "TASK_LIMIT_EXCEEDED"
    || error?.response?.data?.code === "HEARTS_DEPLETED"
  );
}

export function navigateToPremium(navigation) {
  if (!navigation) return;
  if (typeof navigation.navigate === "function") {
    try {
      navigation.navigate("Premium");
      return;
    } catch (e) {
      // fall through to nested stack navigation
    }
    navigation.navigate("Study", { screen: "Premium" });
  }
}

/**
 * Starts Xendit Test checkout: backend creates session → hosted checkout opens on PremiumCheckout screen.
 */
export function startGoUnlimitedCheckout(navigation) {
  const bridge = getUpgradeLimitBridge();
  if (bridge.isPremium()) return false;

  if (typeof bridge.openGoUnlimitedCheckoutModal === "function") {
    bridge.openGoUnlimitedCheckoutModal();
    return true;
  }
  if (typeof bridge.beginGoUnlimitedCheckout === "function") {
    bridge.beginGoUnlimitedCheckout();
    return true;
  }

  if (!bridge.paymentsEnabled?.()) {
    Alert.alert(
      "Payments unavailable",
      "Go Unlimited checkout is not available right now. Check that Xendit Test Mode is configured on the server."
    );
    navigateToPremium(navigation);
    return false;
  }

  navigateToPremium(navigation);
  return true;
}

/** Show the global Go Unlimited modal (Basic users only). */
export function promptUpgradeLimit(navigation, { code, message, error } = {}) {
  const bridge = getUpgradeLimitBridge();
  if (bridge.isPremium()) return false;
  bridge.show?.({ code, message, error });
  return true;
}

export function handleLimitError(navigation, error, { code, message } = {}) {
  if (!isUpgradeRequired(error)) return false;
  const bridge = getUpgradeLimitBridge();
  if (bridge.isPremium()) return false;
  bridge.show?.({
    code: code || extractLimitCode(error),
    message: message || extractLimitMessage(error),
    error,
  });
  return true;
}
