import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';

/** Legacy route — checkout is handled by GoUnlimitedCheckoutModal. */
export default function PremiumCheckoutScreen({ navigation }) {
  const { colors } = useTheme();
  const { showGoUnlimitedCheckoutModal } = usePremium();

  useEffect(() => {
    showGoUnlimitedCheckoutModal();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Premium');
    }
  }, [navigation, showGoUnlimitedCheckoutModal]);

  return (
    <Screen>
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.violet} />
        <Text style={[styles.text, { color: colors.textMuted }]}>Opening checkout…</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { fontSize: 14 },
});
