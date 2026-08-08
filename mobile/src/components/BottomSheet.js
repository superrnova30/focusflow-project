import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

/**
 * A modern, animated bottom sheet / modal.
 *
 * Props:
 *  - visible: boolean
 *  - onClose: () => void
 *  - title: string (optional)
 *  - subtitle: string (optional)
 *  - children: sheet content
 *  - maxHeight: number (percentage-ish 0-1 of screen height, default 0.8)
 *  - showHandle: boolean (default true)
 *  - headerRight: React node (optional, e.g. a close button)
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = 0.8,
  showHandle = true,
  headerRight,
}) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(height);
      backdropOpacity.setValue(0);
    }
  }, [visible, height, translateY, backdropOpacity]);

  const close = () => {
    Animated.timing(translateY, {
      toValue: height,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onClose && onClose());
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: height * maxHeight,
              transform: [{ translateY }],
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          {showHandle && (
            <View style={styles.handleRow}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
            </View>
          )}

          {(title || headerRight) && (
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                {title && <Text style={styles.title}>{title}</Text>}
                {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
              {headerRight || (
                <Pressable onPress={close} style={styles.closeBtn} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: "flex-end" },
    backdrop: { backgroundColor: "rgba(0,0,0,0.5)" },
    sheet: {
      backgroundColor: colors.surfaceRaised,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
    },
    handleRow: { alignItems: "center", marginBottom: 6 },
    handle: { width: 40, height: 4, borderRadius: 2 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
      paddingTop: 4,
    },
    title: { color: colors.text, fontSize: 19, fontWeight: "800" },
    subtitle: { color: colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 18 },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
  });

