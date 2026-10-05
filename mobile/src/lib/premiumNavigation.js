/**
 * Navigate to the Xendit checkout screen from any navigator (tab root or Study stack).
 */
export function navigateToPremiumCheckout(navigation, params = {}) {
  if (!navigation || typeof navigation.navigate !== "function") return false;

  try {
    navigation.navigate("PremiumCheckout", params);
    return true;
  } catch {
    // Tab navigator — PremiumCheckout lives inside the Study stack.
  }

  try {
    navigation.navigate("Study", { screen: "PremiumCheckout", params });
    return true;
  } catch {
    return false;
  }
}
