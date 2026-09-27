import { useRef } from "react";
import { Dimensions } from "react-native";

/**
 * Screen width from the first render only. Avoids layout thrashing when the
 * Android keyboard opens and temporarily shrinks the window height/width.
 */
export function useStableLayout(wideBreakpoint = 820) {
  const layout = useRef(null);
  if (!layout.current) {
    const { width } = Dimensions.get("screen");
    layout.current = {
      width,
      wide: width >= wideBreakpoint,
      compact: width < 370,
    };
  }
  return layout.current;
}
