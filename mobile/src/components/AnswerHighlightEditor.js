import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, TextInput, Pressable, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  addHighlightSpan,
  parseHighlights,
  remapHighlights,
  removeHighlightAt,
  spanFromTokenRange,
  tokenizeAnswer,
  tokenOverlapsSpans,
} from "../lib/flashcardAnswer";
import { RADIUS, SPACING, answerMarkStyle } from "../theme/theme";

export default function AnswerHighlightEditor({
  back,
  highlight,
  onChangeBack,
  onChangeHighlight,
  colors,
  isDark,
  compact,
  placeholder,
}) {
  const backRef = useRef(back);
  const highlightRef = useRef(highlight);
  backRef.current = back;
  highlightRef.current = highlight;

  return (
    <View>
      <TextInput
        value={back}
        onChangeText={(text) => {
          const next = remapHighlights(backRef.current, text, highlightRef.current);
          onChangeBack(text);
          onChangeHighlight(next);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
        autoCorrect
        selectTextOnFocus={false}
        selectionColor={colors.mint}
        style={[styles.input, compact && styles.inputCompact, { color: colors.text }]}
      />

      <View
        style={[
          styles.instruction,
          { backgroundColor: colors.mintSoft, borderColor: colors.mint },
        ]}
      >
        <View style={[styles.instructionIcon, { backgroundColor: `${colors.mint}22` }]}>
          <Ionicons name="color-wand" size={14} color={colors.mint} />
        </View>
        <Text style={[styles.instructionText, { color: colors.text }]}>
          Click a word to highlight it. Click the same word again to remove that highlight.
        </Text>
      </View>

      {back.trim() ? (
        <HighlightCanvas
          text={back}
          highlight={highlight}
          colors={colors}
          isDark={isDark}
          compact={compact}
          onChangeHighlight={onChangeHighlight}
        />
      ) : null}
    </View>
  );
}

function HighlightCanvas({ text, highlight, colors, isDark, compact, onChangeHighlight }) {
  const tokens = useMemo(() => tokenizeAnswer(text), [text]);
  const spans = parseHighlights(highlight, text);
  const textRef = useRef(text);
  const highlightRef = useRef(highlight);
  const dragStart = useRef(null);
  const moved = useRef(false);
  const lastIndex = useRef(null);
  const frames = useRef([]);
  const wordRefs = useRef([]);
  const tokensRef = useRef(tokens);
  const onChangeRef = useRef(onChangeHighlight);
  textRef.current = text;
  highlightRef.current = highlight;
  tokensRef.current = tokens;
  onChangeRef.current = onChangeHighlight;
  const markStyle = answerMarkStyle(isDark);

  const applySpan = (span) => {
    if (!span) return;
    onChangeRef.current(addHighlightSpan(textRef.current, highlightRef.current, span));
  };

  const hitIndex = (pageX, pageY) => {
    let inside = null;
    let nearest = null;
    let nearestDist = Infinity;
    frames.current.forEach((frame, index) => {
      if (!frame || !tokensRef.current[index]?.isWord) return;
      if (
        pageX >= frame.x &&
        pageX <= frame.x + frame.width &&
        pageY >= frame.y &&
        pageY <= frame.y + frame.height
      ) {
        inside = index;
      }
      const cx = frame.x + frame.width / 2;
      const cy = frame.y + frame.height / 2;
      const sameLine = Math.abs(pageY - cy) <= Math.max(18, frame.height);
      const dist = Math.abs(pageX - cx) + Math.abs(pageY - cy);
      if (sameLine && dist < nearestDist) {
        nearestDist = dist;
        nearest = index;
      }
    });
    return inside != null ? inside : nearest;
  };

  const measureWords = () => {
    wordRefs.current.forEach((node, index) => {
      node?.measureInWindow?.((x, y, width, height) => {
        frames.current[index] = { x, y, width, height };
      });
    });
  };

  const finishDrag = (index) => {
    if (dragStart.current == null) return;
    const start = dragStart.current;
    const end = index == null ? lastIndex.current : index;
    const didMove = moved.current;
    dragStart.current = null;
    moved.current = false;
    if (!didMove) {
      const token = tokensRef.current[start];
      if (!token?.isWord) return;
      const currentSpans = parseHighlights(highlightRef.current, textRef.current);
      const overlapIndex = currentSpans.findIndex(
        (span) => token.start < span.end && token.end > span.start
      );
      // Second click on a highlighted word removes that highlight.
      if (overlapIndex >= 0) {
        onChangeRef.current(removeHighlightAt(textRef.current, highlightRef.current, overlapIndex));
        return;
      }
      applySpan(spanFromTokenRange(textRef.current, start, start));
      return;
    }
    applySpan(spanFromTokenRange(textRef.current, start, end));
  };

  const onDown = (index) => {
    if (index == null) return;
    dragStart.current = index;
    moved.current = false;
    lastIndex.current = index;
  };

  const onMove = (index) => {
    if (dragStart.current == null || index == null) return;
    lastIndex.current = index;
    if (index !== dragStart.current) {
      moved.current = true;
      applySpan(spanFromTokenRange(textRef.current, dragStart.current, index));
    }
  };

  const finishDragRef = useRef(finishDrag);
  const hitIndexRef = useRef(hitIndex);
  finishDragRef.current = finishDrag;
  hitIndexRef.current = hitIndex;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return undefined;
    const handleUp = (event) => {
      if (dragStart.current == null) return;
      const point = event?.changedTouches?.[0] || event;
      const nextIndex =
        point && typeof point.pageX === "number"
          ? hitIndexRef.current(point.pageX, point.pageY)
          : lastIndex.current;
      finishDragRef.current(nextIndex);
    };
    document.addEventListener("mouseup", handleUp);
    document.addEventListener("touchend", handleUp);
    return () => {
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("touchend", handleUp);
    };
  }, []);

  const nativeHandlers =
    Platform.OS === "web"
      ? {}
      : {
          onStartShouldSetResponder: () => true,
          onMoveShouldSetResponder: () => true,
          onResponderTerminationRequest: () => false,
          onResponderGrant: (event) => {
            measureWords();
            onDown(hitIndex(event.nativeEvent.pageX, event.nativeEvent.pageY));
          },
          onResponderMove: (event) => {
            onMove(hitIndex(event.nativeEvent.pageX, event.nativeEvent.pageY));
          },
          onResponderRelease: (event) => {
            finishDrag(hitIndex(event.nativeEvent.pageX, event.nativeEvent.pageY));
          },
        };

  return (
    <View
      collapsable={false}
      onLayout={measureWords}
      style={[styles.canvas, { borderColor: colors.border, backgroundColor: colors.surface }]}
      {...nativeHandlers}
    >
      <View style={styles.words} collapsable={false}>
        {tokens.map((token, index) => {
          const active = tokenOverlapsSpans(token, spans);
          return (
            <View
              key={`${token.start}-${token.text}`}
              style={[styles.tokenWrap, token.isBreak && styles.tokenBreak]}
            >
              <View
                ref={(node) => {
                  wordRefs.current[index] = node;
                }}
                collapsable={false}
                onLayout={measureWords}
                onMouseDown={
                  Platform.OS === "web"
                    ? (event) => {
                        event?.preventDefault?.();
                        onDown(index);
                      }
                    : undefined
                }
                onMouseEnter={Platform.OS === "web" ? () => onMove(index) : undefined}
                style={Platform.OS === "web" ? styles.wordHit : null}
              >
                <Text
                  selectable={false}
                  style={[
                    styles.word,
                    compact && styles.wordCompact,
                    { color: active ? markStyle.color : colors.text },
                    active && {
                      backgroundColor: markStyle.backgroundColor,
                      fontWeight: "800",
                    },
                  ]}
                >
                  {token.text}
                </Text>
              </View>
              {token.isBreak ? (
                <View style={styles.lineBreak} />
              ) : (
                <Text selectable={false} style={[styles.word, compact && styles.wordCompact, { color: colors.text }]}>
                  {token.space}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 15,
    lineHeight: 21,
    minHeight: 72,
    paddingVertical: 2,
    ...(Platform.OS === "web" ? { outlineStyle: "none", userSelect: "text", cursor: "text" } : null),
  },
  inputCompact: {
    fontSize: 14,
    minHeight: 64,
  },
  instruction: {
    marginTop: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    gap: 8,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  instructionIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  canvas: {
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    ...(Platform.OS === "web" ? { userSelect: "none" } : null),
  },
  words: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  tokenWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  tokenBreak: {
    flexBasis: "100%",
  },
  wordHit: {
    cursor: "pointer",
  },
  word: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    borderRadius: 4,
    paddingHorizontal: 1,
  },
  wordCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
  lineBreak: {
    width: "100%",
    height: 0,
  },
  chipList: {
    marginTop: SPACING.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 5,
    maxWidth: "100%",
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: "800",
    maxWidth: 180,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  clearText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
