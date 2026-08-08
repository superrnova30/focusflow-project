import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";

function Block({ block, colors }) {
  const styles = useStyles(colors);

  if (block.type === "heading") {
    const size = block.level === 1 ? 24 : block.level === 3 ? 15 : 19;
    return <Text style={[styles.heading, { fontSize: size }]}>{block.text}</Text>;
  }

  if (block.type === "bullet") {
    return (
      <View style={styles.row}>
        <Text style={[styles.marker, { color: colors.violet }]}>•</Text>
        <Text style={styles.text}>{block.text}</Text>
      </View>
    );
  }

  if (block.type === "numbered") {
    return (
      <View style={styles.row}>
        <Text style={[styles.marker, { color: colors.violet }]}>•</Text>
        <Text style={styles.text}>{block.text}</Text>
      </View>
    );
  }

  if (block.type === "checklist") {
    return (
      <View style={styles.row}>
        <Text style={styles.check}>{block.checked ? "☑" : "☐"}</Text>
        <Text style={[styles.text, block.checked && styles.checkedText]}>{block.text}</Text>
      </View>
    );
  }

  // text block
  const marks = Array.isArray(block.marks) ? block.marks : [];
  let content = block.text;
  // Support "**bold**" inline notation used by AI imports.
  const parts = String(content || "").split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={styles.text}>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={i} style={[styles.text, { fontWeight: "700", color: colors.text }]}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return (
          <Text key={i} style={[styles.text, marks.includes("bold") && { fontWeight: "700" }, marks.includes("italic") && { fontStyle: "italic" }, marks.includes("underline") && { textDecorationLine: "underline" }]}>
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

export default function NoteViewScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { note } = route.params;
  const blocks = note.contentJson || [];

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.header}>{note.title}</Text>
            <Text style={styles.meta}>
              {note.source === "ai" ? "✨ AI generated" : "📝 Manual"} ·{" "}
              {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate("NoteEdit", { note })}
            style={[styles.editBtn, { borderColor: colors.violet }]}
          >
            <Text style={[styles.editBtnText, { color: colors.violet }]}>Edit</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 8 }}>
          {blocks.map((block, index) => (
            <Block key={index} block={block} colors={colors} />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    header: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 4 },
    meta: { color: colors.textMuted, fontSize: 12.5, marginBottom: 12 },
    editBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
    editBtnText: { fontWeight: "700", fontSize: 13 },
    heading: { color: colors.text, fontWeight: "700", marginTop: 14, marginBottom: 4 },
    row: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4, paddingLeft: 4 },
    marker: { width: 20, fontSize: 15, fontWeight: "700", textAlign: "right", marginRight: 6, paddingTop: 2 },
    check: { fontSize: 15, marginRight: 8, paddingTop: 2, color: colors.mint },
    text: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 4, flex: 1 },
    checkedText: { textDecorationLine: "line-through", color: colors.textMuted },
  });
