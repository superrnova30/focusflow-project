import React from "react";
import { Text } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { answerMarkStyle } from "../theme/theme";
import { splitHighlightedText } from "../lib/flashcardAnswer";

export default function HighlightedAnswer({
  text,
  highlight,
  card,
  style,
  highlightStyle,
  numberOfLines,
}) {
  const { isDark } = useTheme();
  const body = String(text || card?.back || "");
  const requested = highlight != null ? highlight : card?.answerHighlight;
  const parts = splitHighlightedText(body, requested, card?.front || card?.question);
  const markStyle = answerMarkStyle(isDark);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, index) =>
        part.highlight ? (
          <Text
            key={`h-${index}`}
            style={[
              {
                backgroundColor: markStyle.backgroundColor,
                color: markStyle.color,
                fontWeight: "800",
                borderRadius: 4,
              },
              highlightStyle,
            ]}
          >
            {part.text}
          </Text>
        ) : (
          <Text key={`t-${index}`}>{part.text}</Text>
        )
      )}
    </Text>
  );
}
