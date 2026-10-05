import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

function renderInline(block, styles, keyPrefix) {
  if (Array.isArray(block.spans) && block.spans.length) {
    return block.spans.map((span, spanIndex) => (
      <Text
        key={`${keyPrefix}-${spanIndex}`}
        style={[
          Array.isArray(span.marks) && span.marks.includes("bold") && styles.bold,
          Array.isArray(span.marks) && span.marks.includes("italic") && { fontStyle: "italic" },
          Array.isArray(span.marks) && span.marks.includes("underline") && { textDecorationLine: "underline" },
        ]}
      >
        {span.text}
      </Text>
    ));
  }
  return block.text || "";
}

export default function NoteContentPreview({ blocks = [], compact = false }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  let numberedCounter = 0;

  const safeBlocks = useMemo(() => {
    if (Array.isArray(blocks)) return blocks;
    if (typeof blocks === "string") {
      try {
        const parsed = JSON.parse(blocks);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [blocks]);

  return (
    <View style={styles.wrap}>
      {safeBlocks.map((block, index) => {
        if (block.type === "heading") {
          const size = block.level === 1 ? 22 : block.level === 3 ? 15 : 18;
          return (
            <Text key={index} style={[styles.heading, { fontSize: size }]}>
              {renderInline(block, styles, index)}
            </Text>
          );
        }
        if (block.type === "bullet") {
          return (
            <View key={index} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: colors.violet }]} />
              <Text style={styles.body}>{renderInline(block, styles, index)}</Text>
            </View>
          );
        }
        if (block.type === "numbered") {
          numberedCounter += 1;
          return (
            <View key={index} style={styles.row}>
              <Text style={[styles.number, { color: colors.violet }]}>{numberedCounter}.</Text>
              <Text style={styles.body}>{renderInline(block, styles, index)}</Text>
            </View>
          );
        }
        if (block.type === "checklist") {
          return (
            <View key={index} style={styles.row}>
              <Ionicons
                name={block.checked ? "checkbox" : "square-outline"}
                size={16}
                color={block.checked ? colors.mint : colors.textMuted}
                style={styles.checkIcon}
              />
              <Text style={[styles.body, block.checked && styles.checked]}>{block.text}</Text>
            </View>
          );
        }
        if (Array.isArray(block.spans) && block.spans.length) {
          return (
            <Text key={index} style={styles.paragraph}>
              {block.spans.map((span, spanIndex) => (
                <Text
                  key={`${index}-${spanIndex}`}
                  style={[
                    styles.body,
                    Array.isArray(span.marks) && span.marks.includes("bold") && styles.bold,
                    Array.isArray(span.marks) && span.marks.includes("italic") && { fontStyle: "italic" },
                    Array.isArray(span.marks) && span.marks.includes("underline") && { textDecorationLine: "underline" },
                  ]}
                >
                  {span.text}
                </Text>
              ))}
            </Text>
          );
        }
        const marks = Array.isArray(block.marks) ? block.marks : [];
        const parts = String(block.text || "").split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
        if (marks.length === 0 && parts.length === 1) {
          return (
            <Text key={index} style={styles.paragraph}>
              {parts.map((part, i) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <Text key={i} style={styles.bold}>{part.slice(2, -2)}</Text>
                ) : part.startsWith("*") && part.endsWith("*") ? (
                  <Text key={i} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</Text>
                ) : (
                  <Text key={i} style={styles.body}>{part}</Text>
                )
              )}
            </Text>
          );
        }
        return (
          <Text
            key={index}
            style={[
              styles.paragraph,
              styles.body,
              marks.includes("bold") && styles.bold,
              marks.includes("italic") && { fontStyle: "italic" },
              marks.includes("underline") && { textDecorationLine: "underline" },
            ]}
          >
            {block.text}
          </Text>
        );
      })}
    </View>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    wrap: { gap: compact ? 6 : 8 },
    heading: {
      color: colors.text,
      fontWeight: "800",
      marginTop: compact ? 8 : 12,
      marginBottom: 4,
      lineHeight: 24,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 7,
    },
    number: {
      fontWeight: "800",
      fontSize: 14,
      minWidth: 22,
    },
    checkIcon: { marginTop: 2 },
    body: {
      flex: 1,
      color: colors.textMuted,
      fontSize: compact ? 13.5 : 14,
      lineHeight: compact ? 19 : 21,
    },
    paragraph: {
      marginBottom: 4,
    },
    bold: {
      color: colors.text,
      fontWeight: "800",
    },
    checked: {
      textDecorationLine: "line-through",
      opacity: 0.7,
    },
  });
