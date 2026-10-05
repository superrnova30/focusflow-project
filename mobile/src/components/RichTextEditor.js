import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import InlineFormatEditor from "./InlineFormatEditor";

/**
 * A lightweight rich-text editor that stores content as an array of blocks.
 *
 * Block shapes:
 *  - { type: "heading", level: 1|2|3, text }
 *  - { type: "text", text, marks: ["bold"|"italic"|"underline"] }
 *  - { type: "bullet", text }
 *  - { type: "numbered", text }
 *  - { type: "checklist", checked: bool, text }
 *
 * Props:
 *  - value: array of blocks
 *  - onChange: (blocks) => void
 *  - placeholder: string
 */
export default function RichTextEditor({
  value = [],
  onChange,
  placeholder,
  compact = false,
  embedded = false,
  scrollable = false,
  simple = false,
}) {
  const { colors } = useTheme();

  if (simple) {
    return (
      <View
        style={[
          editorStyles.container,
          compact && editorStyles.containerCompact,
          embedded && editorStyles.containerEmbedded,
          !embedded && { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <InlineFormatEditor
          value={value}
          onChange={onChange}
          compact={compact}
          placeholder={placeholder || "Notes, steps, or reminders"}
        />
      </View>
    );
  }

  const updateBlock = (index, patch) => {
    const next = [...value];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeBlock = (index) => {
    const next = [...value];
    next.splice(index, 1);
    onChange(next.length ? next : []);
  };

  const addBlock = (index, type) => {
    const next = [...value];
    let newBlock;
    if (type === "checklist") newBlock = { type: "checklist", checked: false, text: "" };
    else if (type === "bullet") newBlock = { type: "bullet", text: "" };
    else if (type === "numbered") newBlock = { type: "numbered", text: "" };
    else if (type === "heading") newBlock = { type: "heading", level: 2, text: "" };
    else newBlock = { type: "text", text: "", marks: [] };
    next.splice(index + 1, 0, newBlock);
    onChange(next);
  };

  const toggleMark = (index, mark) => {
    const block = value[index];
    if (!block || block.type !== "text") return;
    const marks = Array.isArray(block.marks) ? [...block.marks] : [];
    const idx = marks.indexOf(mark);
    if (idx >= 0) marks.splice(idx, 1);
    else marks.push(mark);
    updateBlock(index, { marks });
  };

  const renderBlockControls = (block, index) => {
    const isLast = index === value.length - 1;
    const isList = block.type === "bullet" || block.type === "numbered" || block.type === "checklist";
    if (isLast && !compact && isList) {
      return <IconButton name="add" onPress={() => addBlock(index, block.type)} color={colors.violet} />;
    }
    if (value.length > 1) {
      return <IconButton name="remove" onPress={() => removeBlock(index)} color={colors.textMuted} />;
    }
    return null;
  };

  const renderBlock = (block, index) => {
    if (block.type === "heading") {
      const size = block.level === 1 ? 24 : block.level === 3 ? 15 : 19;
      return (
        <View key={index} style={editorStyles.blockRow}>
          <TextInput
            value={block.text ?? ""}
            onChangeText={(text) => updateBlock(index, { text })}
            placeholder="Heading"
            placeholderTextColor={colors.textMuted}
            style={[editorStyles.blockInput, editorStyles.heading, { fontSize: size, color: colors.text }]}
            multiline
          />
          {renderBlockControls(block, index)}
        </View>
      );
    }

    if (block.type === "bullet" || block.type === "numbered") {
      const bullet = block.type === "bullet" ? "•" : `${index - 0 + 1}.`;
      return (
        <View key={index} style={editorStyles.blockRow}>
          <Text style={[editorStyles.marker, { color: colors.violet }]}>{bullet}</Text>
          <TextInput
            value={block.text ?? ""}
            onChangeText={(text) => updateBlock(index, { text })}
            placeholder="List item"
            placeholderTextColor={colors.textMuted}
            style={[editorStyles.blockInput, { color: colors.text }]}
            multiline
          />
          {renderBlockControls(block, index)}
        </View>
      );
    }

    if (block.type === "checklist") {
      return (
        <View key={index} style={editorStyles.blockRow}>
          <Pressable onPress={() => updateBlock(index, { checked: !block.checked })} hitSlop={8}>
            <Ionicons
              name={block.checked ? "checkbox" : "square-outline"}
              size={22}
              color={block.checked ? colors.mint : colors.textMuted}
            />
          </Pressable>
          <TextInput
            value={block.text ?? ""}
            onChangeText={(text) => updateBlock(index, { text })}
            placeholder="Checklist item"
            placeholderTextColor={colors.textMuted}
            style={[
              editorStyles.blockInput,
              { color: colors.text },
              block.checked && { textDecorationLine: "line-through", color: colors.textMuted },
            ]}
            multiline
          />
          {renderBlockControls(block, index)}
        </View>
      );
    }

    // text block
    const marks = Array.isArray(block.marks) ? block.marks : [];
    const hasMark = (m) => marks.includes(m);
    return (
      <View key={index} style={editorStyles.blockRow}>
        <TextInput
          value={block.text ?? ""}
          onChangeText={(text) => updateBlock(index, { text })}
          placeholder={placeholder || "Start typing…"}
          placeholderTextColor={colors.textMuted}
          style={[
            editorStyles.blockInput,
            { color: colors.text },
            hasMark("bold") && { fontWeight: "700" },
            hasMark("italic") && { fontStyle: "italic" },
            hasMark("underline") && { textDecorationLine: "underline" },
          ]}
          multiline
        />
        {renderBlockControls(block, index)}
      </View>
    );
  };

  const lastTextBlockIndex = (() => {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      if (value[i]?.type === "text") return i;
    }
    return -1;
  })();

  const applyMark = (mark) => {
    const idx = lastTextBlockIndex >= 0 ? lastTextBlockIndex : 0;
    if (lastTextBlockIndex < 0 && value.length === 0) {
      onChange([{ type: "text", text: "", marks: [mark] }]);
      return;
    }
    toggleMark(idx, mark);
  };

  const showToolbar = value.length > 0;

  return (
    <View
      style={[
        editorStyles.container,
        compact && editorStyles.containerCompact,
        embedded && editorStyles.containerEmbedded,
        !embedded && { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {showToolbar && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={editorStyles.toolbarContent}
          style={[editorStyles.toolbar, { borderBottomColor: colors.border }]}
        >
          {compact ? null : (
            <Text style={[editorStyles.toolbarLabel, { color: colors.textMuted }]}>Format</Text>
          )}
          <ToolButton
            label="B"
            active={value[lastTextBlockIndex]?.marks?.includes("bold")}
            onPress={() => applyMark("bold")}
          />
          <ToolButton
            label="I"
            active={value[lastTextBlockIndex]?.marks?.includes("italic")}
            onPress={() => applyMark("italic")}
          />
          <ToolButton
            icon="list-outline"
            label="List"
            active={false}
            onPress={() => addBlock(value.length - 1, "bullet")}
          />
          <ToolButton
            icon="remove-outline"
            label="Heading"
            active={false}
            onPress={() => addBlock(value.length - 1, "heading")}
          />
          <ToolButton
            icon="checkbox-outline"
            label="Check"
            active={false}
            onPress={() => addBlock(value.length - 1, "checklist")}
          />
        </ScrollView>
      )}

      {value.length === 0 ? (
        <Pressable
          onPress={() => onChange([{ type: "text", text: "", marks: [] }])}
          style={[editorStyles.emptyTap, { borderColor: colors.border }]}
        >
          <Ionicons name="create-outline" size={20} color={colors.violet} />
          <Text style={[editorStyles.emptyHint, { color: colors.textMuted }]}>
            {placeholder || "Tap to start writing…"}
          </Text>
        </Pressable>
      ) : scrollable ? (
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={editorStyles.blocksScroll}
        >
          <View style={editorStyles.blocks}>{value.map(renderBlock)}</View>
        </ScrollView>
      ) : (
        <View style={editorStyles.blocks}>{value.map(renderBlock)}</View>
      )}
    </View>
  );
}

function IconButton({ name, onPress, color }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={editorStyles.iconBtn}>
      <Ionicons name={name} size={18} color={color} />
    </Pressable>
  );
}

function ToolButton({ icon, label, active, onPress, disabled }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        editorStyles.toolBtn,
        { borderColor: colors.border },
        active && { backgroundColor: colors.violetSoft, borderColor: colors.violet },
      ]}
    >
      {icon ? (
        <>
          <Ionicons name={icon} size={15} color={active ? colors.violet : colors.text} />
          {label ? (
            <Text style={[editorStyles.toolLabelSmall, { color: active ? colors.violet : colors.textMuted }]}>
              {label}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[editorStyles.toolLabel, { color: active ? colors.violet : colors.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const editorStyles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 200 },
  containerCompact: { minHeight: 128 },
  containerEmbedded: { borderWidth: 0, borderRadius: 0, minHeight: 0, padding: 10 },
  toolbar: { marginBottom: 8, borderBottomWidth: 1, paddingBottom: 8, maxHeight: 44 },
  toolbarContent: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 8 },
  toolbarLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginRight: 4, textTransform: "uppercase" },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
  },
  toolLabel: { fontSize: 13, fontWeight: "800" },
  toolLabelSmall: { fontSize: 10, fontWeight: "700" },
  emptyTap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyHint: { flex: 1, fontSize: 13, lineHeight: 19 },
  blocksScroll: { flexGrow: 0, maxHeight: 140 },
  blocks: { gap: 2 },
  blockRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  blockInput: { flex: 1, fontSize: 15, lineHeight: 22, paddingVertical: 6, paddingHorizontal: 6 },
  heading: { fontWeight: "700" },
  marker: { width: 24, fontSize: 15, fontWeight: "700", paddingTop: 6, textAlign: "right", marginRight: 6 },
  iconBtn: { padding: 4, marginLeft: 4 },
});

