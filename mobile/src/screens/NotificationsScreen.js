import React, { useCallback } from "react";
import { View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useNotifications } from "../context/NotificationContext";

export default function NotificationsScreen({ navigation }) {
  const { openPanel } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      openPanel();
      if (navigation.canGoBack?.()) navigation.goBack();
    }, [openPanel, navigation])
  );

  return <View style={{ flex: 1 }} />;
}
