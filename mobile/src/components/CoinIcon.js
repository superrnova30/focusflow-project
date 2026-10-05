import React from "react";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

export default function CoinIcon({ size = 16 }) {
  const fontSize = size >= 18 ? 9 : size >= 15 ? 8 : 7;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Coin">
      <Circle cx="12" cy="12" r="11" fill="#E0A526" />
      <Circle cx="12" cy="12" r="11" fill="none" stroke="#9A6A10" strokeWidth="1.4" />
      <Circle cx="12" cy="12" r="8.2" fill="#F6C84A" />
      <Circle cx="12" cy="12" r="8.2" fill="none" stroke="#C48A1A" strokeWidth="1.1" />
      <SvgText
        x="12"
        y="16"
        textAnchor="middle"
        fill="#8B5A00"
        fontSize={fontSize}
        fontWeight="800"
      >
        $
      </SvgText>
    </Svg>
  );
}
