import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import {
  applyTextChange,
  blocksToHtml,
  blocksToPlain,
  blocksToPlainSpans,
  htmlToBlocks,
  plainToBlocks,
  rangeHasMark,
  toggleListInPlain,
  toggleMarkOnRange,
} from "../lib/inlineSpans";

const EMPTY_BLOCKS = [{ type: "text", text: "", marks: [], spans: [{ text: "", marks: [] }] }];

export default function InlineFormatEditor({
  value = [],
  onChange,
  placeholder = "Notes, steps, or reminders",
  compact = false,
}) {
  const { colors } = useTheme();
  const blocks = Array.isArray(value) && value.length ? value : EMPTY_BLOCKS;
  const selectionRef = useRef({ start: 0, end: 0 });
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [webActive, setWebActive] = useState({});
  const [hasWebText, setHasWebText] = useState(() => Boolean(blocksToPlain(blocks).trim()));
  const webRef = useRef(null);
  const htmlRef = useRef("");
  const focusedRef = useRef(false);
  const blurTimerRef = useRef(null);
  const savedRangeRef = useRef(null);
  const plain = useMemo(() => blocksToPlain(blocks), [blocks]);
  const flatSpans = useMemo(() => blocksToPlainSpans(blocks), [blocks]);

  const rememberSelection = () => {
    if (typeof document === "undefined") return;
    const current = document.getSelection?.();
    if (current && current.rangeCount > 0 && webRef.current?.contains(current.anchorNode)) {
      savedRangeRef.current = current.getRangeAt(0).cloneRange();
    }
    focusedRef.current = true;
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  const restoreSelection = () => {
    if (!webRef.current || typeof document === "undefined") return;
    webRef.current.focus();
    focusedRef.current = true;
    const selectionApi = document.getSelection?.();
    if (savedRangeRef.current && selectionApi) {
      selectionApi.removeAllRanges();
      selectionApi.addRange(savedRangeRef.current);
    }
  };

  const refreshWebActive = () => {
    if (typeof document === "undefined") return;
    try {
      const block = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
      setWebActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        bullet: document.queryCommandState("insertUnorderedList"),
        numbered: document.queryCommandState("insertOrderedList"),
        heading: block === "h2" || block === "h1" || block === "h3",
      });
    } catch {
      // Ignore when the document cannot query the editor state.
    }
  };

  const commitWeb = ({ rewrite = false } = {}) => {
    const liveHtml = webRef.current?.innerHTML || "";
    htmlRef.current = liveHtml;
    setHasWebText(Boolean((webRef.current?.textContent || "").trim()));
    const next = htmlToBlocks(liveHtml);
    if (rewrite) htmlRef.current = liveHtml;
    onChange(next.length ? next : EMPTY_BLOCKS);
    refreshWebActive();
  };

  const runWeb = (command, arg) => {
    rememberSelection();
    restoreSelection();
    if (command === "heading") {
      const current = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
      document.execCommand("formatBlock", false, current === "h2" ? "P" : "H2");
    } else {
      document.execCommand(command, false, arg || null);
    }
    if (typeof document !== "undefined") {
      const current = document.getSelection?.();
      if (current && current.rangeCount > 0) {
        savedRangeRef.current = current.getRangeAt(0).cloneRange();
      }
    }
    commitWeb();
  };

  const applyMark = (mark) => {
    if (Platform.OS === "web") {
      runWeb(mark === "italic" ? "italic" : mark === "underline" ? "underline" : "bold");
      return;
    }
    const { start, end } = selectionRef.current;
    const result = toggleMarkOnRange(flatSpans, start, end, mark);
    if (result.empty) return;
    onChange(plainToBlocks(plain, result.spans));
  };

  const applyList = (kind) => {
    if (Platform.OS === "web") {
      runWeb(kind === "numbered" ? "insertOrderedList" : "insertUnorderedList");
      return;
    }
    const { start, end } = selectionRef.current;
    const nextPlain = toggleListInPlain(plain, start, end, kind);
    onChange(plainToBlocks(nextPlain, applyTextChange(plain, nextPlain, flatSpans)));
  };

  const applyHeading = () => {
    if (Platform.OS === "web") {
      runWeb("heading");
      return;
    }
    const { start } = selectionRef.current;
    const lines = plain.split("\n");
    let cursor = 0;
    const next = lines.map((line) => {
      const lineStart = cursor;
      cursor += line.length + 1;
      if (start < lineStart || start > lineStart + line.length) return line;
      return line.replace(/^\s*[•*-]\s+/, "").replace(/^\s*\d+\.\s+/, "");
    });
    const nextPlain = next.join("\n");
    const nextBlocks = plainToBlocks(nextPlain, applyTextChange(plain, nextPlain, flatSpans)).map((block, index) => {
      const lineStart = next.slice(0, index).join("\n").length + (index ? 1 : 0);
      if (start >= lineStart && start <= lineStart + (next[index] || "").length) {
        return { ...block, type: block.type === "heading" ? "text" : "heading", level: 2 };
      }
      return block;
    });
    onChange(nextBlocks);
  };

  const boldOn = Platform.OS === "web" ? webActive.bold : rangeHasMark(flatSpans, selection.start, selection.end, "bold");
  const italicOn = Platform.OS === "web" ? webActive.italic : rangeHasMark(flatSpans, selection.start, selection.end, "italic");
  const underlineOn = Platform.OS === "web" ? webActive.underline : rangeHasMark(flatSpans, selection.start, selection.end, "underline");

  return (
    <View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolbarContent}
        style={[styles.toolbar, { borderBottomColor: colors.border }]}
      >
        <ToolButton label="B" accessibilityLabel="Bold selected text" active={boldOn} onPress={() => applyMark("bold")} onHold={rememberSelection} bold />
        <ToolButton label="I" accessibilityLabel="Italic selected text" active={italicOn} onPress={() => applyMark("italic")} onHold={rememberSelection} italic />
        <ToolButton label="U" accessibilityLabel="Underline selected text" active={underlineOn} onPress={() => applyMark("underline")} onHold={rememberSelection} underline />
        <ToolButton icon="list-outline" accessibilityLabel="Bulleted list" active={Boolean(webActive.bullet)} onPress={() => applyList("bullet")} onHold={rememberSelection} />
        <ToolButton icon="list" accessibilityLabel="Numbered list" active={Boolean(webActive.numbered)} onPress={() => applyList("numbered")} onHold={rememberSelection} />
        <ToolButton label="H" accessibilityLabel="Heading" active={Boolean(webActive.heading)} onPress={applyHeading} onHold={rememberSelection} />
      </ScrollView>
      {Platform.OS === "web" ? (
        <View>
          {!hasWebText ? (
            <Text pointerEvents="none" style={[styles.placeholder, { color: colors.textMuted }]}>
              {placeholder}
            </Text>
          ) : null}
          <WebEditor
            blocks={blocks}
            colors={colors}
            compact={compact}
            webRef={webRef}
            htmlRef={htmlRef}
            focusedRef={focusedRef}
            blurTimerRef={blurTimerRef}
            onInput={() => commitWeb()}
            onSelectionChange={refreshWebActive}
          />
        </View>
      ) : (
        <TextInput
          value={plain}
          multiline
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          onChangeText={(next) => onChange(plainToBlocks(next, applyTextChange(plain, next, flatSpans)))}
          onSelectionChange={(event) => {
            selectionRef.current = event.nativeEvent.selection;
            setSelection(event.nativeEvent.selection);
          }}
          style={[styles.input, compact && styles.inputCompact, { color: colors.text }]}
        />
      )}
    </View>
  );
}

function WebEditor({
  blocks,
  colors,
  compact,
  webRef,
  htmlRef,
  focusedRef,
  blurTimerRef,
  onInput,
  onSelectionChange,
}) {
  useEffect(() => {
    const node = webRef.current;
    if (!node || focusedRef.current) return;
    const nextHtml = blocksToHtml(blocks);
    if (htmlRef.current === nextHtml || node.innerHTML === nextHtml) {
      htmlRef.current = nextHtml;
      return;
    }
    node.innerHTML = nextHtml || "";
    htmlRef.current = nextHtml;
  }, [blocks, focusedRef, htmlRef, webRef]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleSelect = () => {
      if (!webRef.current?.contains(document.getSelection?.()?.anchorNode)) return;
      onSelectionChange();
    };
    document.addEventListener("selectionchange", handleSelect);
    return () => document.removeEventListener("selectionchange", handleSelect);
  }, [onSelectionChange, webRef]);

  return (
    <>
      <style>
        {`
          [data-ff-desc] ul, [data-ff-desc] ol { margin: 4px 0; padding-left: 1.3em; }
          [data-ff-desc] li { margin: 2px 0; }
          [data-ff-desc] h1, [data-ff-desc] h2, [data-ff-desc] h3 { font-size: 17px; font-weight: 800; margin: 4px 0; }
          [data-ff-desc] b, [data-ff-desc] strong { font-weight: 800; }
          [data-ff-desc] i, [data-ff-desc] em { font-style: italic; }
          [data-ff-desc] u { text-decoration: underline; }
        `}
      </style>
      <div
        ref={webRef}
        data-ff-desc
        contentEditable
        role="textbox"
        aria-label="Task description"
        suppressContentEditableWarning
        onFocus={() => {
          if (blurTimerRef.current) {
            clearTimeout(blurTimerRef.current);
            blurTimerRef.current = null;
          }
          focusedRef.current = true;
        }}
        onBlur={() => {
          blurTimerRef.current = setTimeout(() => {
            focusedRef.current = false;
          }, 200);
        }}
        onInput={onInput}
        style={{
          minHeight: compact ? 78 : 92,
          maxHeight: compact ? 168 : 196,
          overflowY: "auto",
          outline: "none",
          color: colors.text,
          fontSize: 15,
          lineHeight: "22px",
          padding: "8px 6px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      />
    </>
  );
}

function ToolButton({ label, icon, active, onPress, onHold, bold, italic, underline, accessibilityLabel }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onHold}
      {...(Platform.OS === "web"
        ? {
            onMouseDown: (event) => {
              event.preventDefault();
              onHold?.();
            },
          }
        : {})}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.toolBtn,
        { borderColor: colors.border, backgroundColor: colors.surface },
        active && { backgroundColor: colors.violetSoft, borderColor: colors.violet },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={16} color={active ? colors.violet : colors.text} />
      ) : (
        <Text
          style={[
            styles.toolLabel,
            { color: active ? colors.violet : colors.text },
            bold && { fontWeight: "800" },
            italic && { fontStyle: "italic" },
            underline && { textDecorationLine: "underline" },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    marginBottom: 4,
    borderBottomWidth: 1,
    maxHeight: 44,
  },
  toolbarContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 8,
    paddingRight: 8,
  },
  toolBtn: {
    minWidth: 34,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  toolLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    minHeight: 88,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 8,
    paddingHorizontal: 6,
    textAlignVertical: "top",
  },
  inputCompact: {
    minHeight: 72,
  },
  placeholder: {
    position: "absolute",
    top: 8,
    left: 6,
    fontSize: 15,
    lineHeight: 22,
    zIndex: 1,
  },
});
