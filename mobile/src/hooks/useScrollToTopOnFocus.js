import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Attach the returned ref to a ScrollView or FlatList so the screen jumps to
 * the top whenever it gains focus (tab switch, or return from a pushed screen
 * like Shop / Friends / Progress / AI Chat).
 */
export function useScrollToTopOnFocus({ animated = false, enabled = true } = {}) {
  const ref = useRef(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;

      const scroll = () => {
        const node = ref.current;
        if (!node) return;
        if (typeof node.scrollToOffset === "function") {
          node.scrollToOffset({ offset: 0, animated });
          return;
        }
        if (typeof node.scrollTo === "function") {
          node.scrollTo({ y: 0, animated });
        }
      };

      // Wait one frame so layout is ready after a tab/stack transition.
      const frame = requestAnimationFrame(scroll);
      return () => cancelAnimationFrame(frame);
    }, [animated, enabled])
  );

  return ref;
}
