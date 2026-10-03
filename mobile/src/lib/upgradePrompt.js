import { Alert } from 'react-native';

export function isUpgradeRequired(error) {
  return Boolean(
    error?.upgradeRequired
    || error?.response?.data?.upgradeRequired
    || error?.code === 'DAILY_PROMPTS_EXCEEDED'
    || error?.code === 'DAILY_CHAT_EXCEEDED'
    || error?.code === 'DAILY_TUTOR_EXCEEDED'
    || error?.code === 'HINTS_DEPLETED'
    || error?.code === 'HEARTS_DEPLETED'
    || error?.code === 'TASK_LIMIT_EXCEEDED'
  );
}

export function navigateToPremium(navigation) {
  if (!navigation) return;
  if (typeof navigation.navigate === 'function') {
    try {
      navigation.navigate('Premium');
      return;
    } catch (e) {
      // fall through to nested stack navigation
    }
    navigation.navigate('Study', { screen: 'Premium' });
  }
}

export function handleLimitError(navigation, error, { title = 'Go Unlimited' } = {}) {
  if (!isUpgradeRequired(error)) return false;

  const message =
    error?.message
    || error?.response?.data?.error
    || 'Upgrade to Go Unlimited to keep using this feature without daily limits.';

  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'View plans', onPress: () => navigateToPremium(navigation) },
  ]);
  return true;
}
