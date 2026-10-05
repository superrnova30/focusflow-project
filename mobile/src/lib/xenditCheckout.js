/**
 * Client-side guard: only open URLs that point at Xendit's hosted checkout.
 */
export function isValidXenditCheckoutUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return host === "checkout.xendit.co" || host.endsWith(".xendit.co");
  } catch {
    return false;
  }
}

export function checkoutOpenErrorMessage(url) {
  if (!url) return "No checkout link was returned. Please try again.";
  if (!isValidXenditCheckoutUrl(url)) {
    return "The checkout link is invalid. If you are testing payments, ensure the backend uses a Xendit Secret API key (not the Public key).";
  }
  return "Could not open Xendit checkout.";
}
