import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef();

export function isNavigationReady() {
  return navigationRef.isReady();
}
