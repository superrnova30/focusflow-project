import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

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
export default function RichTextEditor({ value = [], onChange, placeholder }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);

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

  const renderBlock = (block, index) => {
    const isLast = index === value.length - 1;

    if (block.type === "heading") {
      const size = block.level === 1 ? 24 : block.level === 3 ? 15 : 19;
      return (
        <View key={index} style={styles.blockRow}>
          <TextInput
            value={block.text}
            onChangeText={(text) => updateBlock(index, { text })}
            placeholder="Heading"
            placeholderTextColor={colors.textMuted}
            style={[styles.blockInput, styles.heading, { fontSize: size, color: colors.text }]}
            multiline
          />
          <IconButton name="remove" onPress={() => removeBlock(index)} color={colors.textMuted} />
        </View>
      );
    }

    if (block.type === "bullet" || block.type === "numbered") {
      const bullet = block.type === "bullet" ? "•" : `${index - 0 + 1}.`;
      return (
        <View key={index} style={styles.blockRow}>
          <Text style={[styles.marker, { color: colors.violet }]}>{bullet}</Text>
          <TextInput
            value={block.text}
            onChangeText={(text) => updateBlock(index, { text })}
            placeholder="List item"
            placeholderTextColor={colors.textMuted}
            style={[styles.blockInput, { color: colors.text }]}
            multiline
          />
          {isLast ? (
            <IconButton name="add" onPress={() => addBlock(index, block.type)} color={colors.violet} />
          ) : (
            <IconButton name="remove" onPress={() => removeBlock(index)} color={colors.textMuted} />
          )}
        </View>
      );
    }

    if (block.type === "checklist") {
      return (
        <View key={index} style={styles.blockRow}>
          <Pressable onPress={() => updateBlock(index, { checked: !block.checked })} hitSlop={8}>
            <Ionicons
              name={block.checked ? "checkbox" : "square-outline"}
              size={22}
              color={block.checked ? colors.mint : colors.textMuted}
            />
          </Pressable>
          <TextInput
            value={block.text}
            onChangeText={(text) => updateBlock(index, { text })}
            placeholder="Checklist item"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.blockInput,
              { color: colors.text },
              block.checked && { textDecorationLine: "line-through", color: colors.textMuted },
            ]}
            multiline
          />
          {isLast ? (
            <IconButton name="add" onPress={() => addBlock(index, "checklist")} color={colors.violet} />
          ) : (
            <IconButton name="remove" onPress={() => removeBlock(index)} color={colors.textMuted} />
          )}
        </View>
      );
    }

    // text block
    const marks = Array.isArray(block.marks) ? block.marks : [];
    const hasMark = (m) => marks.includes(m);
    return (
      <View key={index} style={styles.blockRow}>
        <TextInput
          value={block.text}
          onChangeText={(text) => updateBlock(index, { text })}
          placeholder={placeholder || "Start typing…"}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.blockInput,
            { color: colors.text },
            hasMark("bold") && { fontWeight: "700" },
            hasMark("italic") && { fontStyle: "italic" },
            hasMark("underline") && { textDecorationLine: "underline" },
          ]}
          multiline
        />
        {isLast ? (
          <IconButton name="add" onPress={() => addBlock(index, "text")} color={colors.violet} />
        ) : (
          <IconButton name="remove" onPress={() => removeBlock(index)} color={colors.textMuted} />
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {value.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolbar}>
          <ToolButton label="H1" active={false} onPress={() => addBlock(value.length - 1, "heading")} />
          <ToolButton icon="arrow-redo" onPress={() => {}} disabled />
          <ToolButton
            icon="link"
            label=""
            active={false}
            onPress={() => {
              const lastText = value.filter((b) => b.type === "text");
              const idx = value.indexOf(lastText[lastText.length - 1]);
              if (idx >= 0) toggleMark(idx, "bold");
            }}
          />
        </ScrollView>
      )}

      {value.length === 0 ? (
        <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
          Tap + to add headings, lists, checklists, or text blocks.
        </Text>
      ) : (
        value.map(renderBlock)
      )}

      {value.length === 0 && (
        <Pressable onPress={() => onChange([{ type: "text", text: "", marks: [] }])} style={styles.addFirstBtn}>
          <Ionicons name="add" size={18} color={colors.violet} />
          <Text style={[styles.addFirstText, { color: colors.violet }]}>Add first block</Text>
        </Pressable>
      )}
    </View>
  );
}

function IconButton({ name, onPress, color }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.iconBtn}>
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
        styles.toolBtn,
        { borderColor: colors.border },
        active && { backgroundColor: colors.violetSoft, borderColor: colors.violet },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={16} color={active ? colors.violet : colors.text} />
      ) : (
        <Text style={[styles.toolLabel, { color: active ? colors.violet : colors.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 200 },
  toolbar: { flexDirection: "row", marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "#00000010", paddingBottom: 8 },
  toolBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  toolLabel: { fontSize: 13, fontWeight: "700" },
  emptyHint: { fontSize: 13, lineHeight: 20, marginVertical: 8 },
  addFirstBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, alignSelf: "flex-start" },
  addFirstText: { fontWeight: "700", fontSize: 13 },
  blockRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
  blockInput: { flex: 1, fontSize: 15, lineHeight: 22, paddingVertical: 4, paddingHorizontal: 4 },
  heading: { fontWeight: "700" },
  marker: { width: 24, fontSize: 15, fontWeight: "700", paddingTop: 6, textAlign: "right", marginRight: 6 },
  iconBtn: { padding: 4, marginLeft: 4 },
});

