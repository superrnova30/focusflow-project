/** Lets non-React modules (e.g. upgradePrompt) open the global Go Unlimited modal. */
const bridge = {
  isPremium: () => false,
  show: null,
  paymentsEnabled: () => false,
  beginGoUnlimitedCheckout: null,
  openGoUnlimitedCheckoutModal: null,
};

export function setUpgradeLimitBridge(next) {
  if (next?.isPremium) bridge.isPremium = next.isPremium;
  if (next?.show) bridge.show = next.show;
  if (next?.paymentsEnabled) bridge.paymentsEnabled = next.paymentsEnabled;
  if (next?.beginGoUnlimitedCheckout) bridge.beginGoUnlimitedCheckout = next.beginGoUnlimitedCheckout;
  if (next?.openGoUnlimitedCheckoutModal) bridge.openGoUnlimitedCheckoutModal = next.openGoUnlimitedCheckoutModal;
}

export function getUpgradeLimitBridge() {
  return bridge;
}
