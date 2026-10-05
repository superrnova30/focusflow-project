/** User-facing copy when Basic plan limits are hit (by API error code). */
export function messageForLimitCode(code, fallback) {
  switch (code) {
    case "TASK_LIMIT_EXCEEDED":
      return "You've reached your Basic plan limit. Upgrade to Go Unlimited to unlock unlimited tasks and other premium features.";
    case "DAILY_PROMPTS_EXCEEDED":
      return "You've reached today's AI generation limit on Basic. Upgrade to Go Unlimited for unlimited study packs, imports, and coach tools.";
    case "DAILY_CHAT_EXCEEDED":
      return "You've reached today's AI chat limit on Basic. Upgrade to Go Unlimited for unlimited conversations with your study assistant.";
    case "DAILY_TUTOR_EXCEEDED":
      return "You've reached today's AI tutor limit on Basic. Upgrade to Go Unlimited for unlimited tutor lessons on your decks.";
    case "HINTS_DEPLETED":
    case "NO_HINTS_REMAINING":
      return "You've used all your hints for today on Basic. Upgrade to Go Unlimited for unlimited hints in Memorize mode.";
    case "HEARTS_DEPLETED":
      return "You're out of hearts on Basic. Upgrade to Go Unlimited for unlimited hearts and keep quizzing without interruptions.";
    default:
      return (
        fallback
        || "You've reached your Basic plan limit. Upgrade to Go Unlimited to unlock unlimited tasks, AI, hints, and more."
      );
  }
}

export function extractLimitCode(error) {
  return error?.code || error?.response?.data?.code || null;
}

export function extractLimitMessage(error) {
  return error?.message || error?.response?.data?.error || null;
}
