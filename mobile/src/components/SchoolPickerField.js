import React, { useMemo, useState } from "react";
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import SchoolLogo from "./SchoolLogo";
import SchoolSelectModal from "./SchoolSelectModal";
import BottomSheet from "./BottomSheet";
import client from "../api/client";

function formatAvailableDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function SchoolPickerField({ school, schoolChange, onChange }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  const [pendingSchool, setPendingSchool] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = school?.id || school?.name ? school : null;
  const locked = Boolean(schoolChange?.locked);
  const availableLabel = formatAvailableDate(schoolChange?.availableAt);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const applyUserPayload = (data, fallbackSchool) => {
    onChange?.(data?.school ?? fallbackSchool ?? null, data?.user || null);
  };

  const selectSchool = async (next) => {
    if (!next?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await client.post(`/schools/${next.id}/select`);
      applyUserPayload(data, next);
      setPendingSchool(null);
      setOpen(false);
    } catch (e) {
      const message = e?.response?.data?.error || e.message || "Could not save your school.";
      setError(message);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const removeSchool = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await client.delete("/schools/selection");
      applyUserPayload(data, null);
      setRemoveConfirm(false);
    } catch (e) {
      const message = e?.response?.data?.error || e.message || "Could not remove your school.";
      setError(message);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = async (next) => {
    if (locked || busy) return;
    if (!next?.id) return;
    if (selected?.id && selected.id === next.id) {
      setOpen(false);
      return;
    }
    if (selected?.id && selected.id !== next.id) {
      setOpen(false);
      setPendingSchool(next);
      return;
    }
    await selectSchool(next);
  };

  const openContactSupport = () => {
    // Support is registered on the Study stack, not Profile.
    navigation?.navigate?.("Study", { screen: "ContactSupport" });
  };

  const closeChangeSheet = () => {
    if (!busy) setPendingSchool(null);
  };

  const closeRemoveSheet = () => {
    if (!busy) setRemoveConfirm(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>School</Text>
      <Pressable
        onPress={() => {
          if (locked || busy) return;
          setError("");
          setOpen(true);
        }}
        disabled={locked || busy}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: locked ? colors.amber + "66" : colors.border,
            opacity: locked ? 0.92 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={locked ? "School change locked" : "Select your school"}
        accessibilityState={{ disabled: locked || busy }}
      >
        <SchoolLogo school={selected} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: selected ? colors.text : colors.textMuted }]} numberOfLines={1}>
            {selected?.name || "Select your school"}
          </Text>
          {selected?.location && !/^unknown( location)?$/i.test(String(selected.location).trim()) ? (
            <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
              {selected.location}
            </Text>
          ) : (
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {locked
                ? "School edits are temporarily locked"
                : selected
                  ? "Tap to change campus"
                  : "Search approved campuses"}
            </Text>
          )}
        </View>
        {busy ? (
          <ActivityIndicator size="small" color={colors.violet} />
        ) : (
          <Ionicons name={locked ? "lock-closed-outline" : "chevron-down"} size={16} color={colors.textMuted} />
        )}
      </Pressable>

      {locked ? (
        <View style={[styles.lockBox, { backgroundColor: colors.amberSoft, borderColor: colors.amber + "44" }]}>
          <View style={styles.lockCopy}>
            <Text style={[styles.lockTitle, { color: colors.text }]}>{"You can't change your school yet."}</Text>
            <Text style={[styles.lockBody, { color: colors.textMuted }]}>
              {availableLabel
                ? `You can change your school again on ${availableLabel}.`
                : "Please wait 7 days after your last school change or removal."}
            </Text>
          </View>
          <Pressable
            onPress={openContactSupport}
            style={({ pressed }) => [
              styles.supportBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Contact PomodAI support"
          >
            <Ionicons name="chatbubbles-outline" size={14} color={colors.violet} />
            <Text style={[styles.supportBtnText, { color: colors.violet }]}>Contact Support</Text>
          </Pressable>
        </View>
      ) : null}

      {!locked && selected?.id ? (
        <Pressable
          onPress={() => {
            setError("");
            setRemoveConfirm(true);
          }}
          disabled={busy}
          hitSlop={6}
          style={({ pressed }) => [styles.removeLink, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Remove school"
        >
          <Ionicons name="close-circle-outline" size={14} color={colors.tomato} />
          <Text style={[styles.removeLinkText, { color: colors.tomato }]}>Remove school</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={[styles.error, { color: colors.tomato }]}>{error}</Text> : null}

      <SchoolSelectModal
        visible={open}
        selectedId={selected?.id}
        onClose={() => setOpen(false)}
        onSelect={handleSelect}
      />

      <BottomSheet
        visible={Boolean(pendingSchool)}
        onClose={closeChangeSheet}
        title="Change your school?"
        subtitle="Confirm before switching campuses."
        maxHeight={0.48}
      >
        <View style={styles.sheetBody}>
          <View style={[styles.sheetIcon, { backgroundColor: colors.violetSoft }]}>
            <Ionicons name="school-outline" size={22} color={colors.violet} />
          </View>
          <Text style={[styles.sheetHeadline, { color: colors.text }]}>
            Are you sure you want to change your school?
          </Text>
          <Text style={[styles.sheetCopy, { color: colors.textMuted }]}>
            After changing your school, you must wait 7 days before you can change or remove it again.
          </Text>
          {pendingSchool?.name ? (
            <View style={[styles.previewCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <SchoolLogo school={pendingSchool} size={32} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.previewName, { color: colors.text }]} numberOfLines={1}>
                  {pendingSchool.name}
                </Text>
                {pendingSchool.location ? (
                  <Text style={[styles.previewMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {pendingSchool.location}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
          <View style={styles.sheetActions}>
            <Pressable
              onPress={closeChangeSheet}
              disabled={busy}
              style={({ pressed }) => [
                styles.sheetBtn,
                styles.sheetBtnGhost,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.sheetBtnGhostText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                try {
                  await selectSchool(pendingSchool);
                } catch {
                  // Error is shown under the school field.
                }
              }}
              disabled={busy}
              style={({ pressed }) => [
                styles.sheetBtn,
                { backgroundColor: colors.violet, opacity: busy ? 0.7 : pressed ? 0.88 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sheetBtnPrimaryText}>Confirm Change</Text>
              )}
            </Pressable>
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={removeConfirm}
        onClose={closeRemoveSheet}
        title="Remove your school?"
        subtitle="You can select a school again after the cooldown."
        maxHeight={0.46}
      >
        <View style={styles.sheetBody}>
          <View style={[styles.sheetIcon, { backgroundColor: colors.tomatoSoft }]}>
            <Ionicons name="close-circle-outline" size={22} color={colors.tomato} />
          </View>
          <Text style={[styles.sheetHeadline, { color: colors.text }]}>
            Are you sure you want to remove your school?
          </Text>
          <Text style={[styles.sheetCopy, { color: colors.textMuted }]}>
            After removing your school, you must wait 7 days before selecting a school again.
          </Text>
          <View style={styles.sheetActions}>
            <Pressable
              onPress={closeRemoveSheet}
              disabled={busy}
              style={({ pressed }) => [
                styles.sheetBtn,
                styles.sheetBtnGhost,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.sheetBtnGhostText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                try {
                  await removeSchool();
                } catch {
                  // Error is shown under the school field.
                }
              }}
              disabled={busy}
              style={({ pressed }) => [
                styles.sheetBtn,
                { backgroundColor: colors.tomato, opacity: busy ? 0.7 : pressed ? 0.88 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sheetBtnPrimaryText}>Remove School</Text>
              )}
            </Pressable>
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    wrap: { marginBottom: 12 },
    label: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
    field: {
      minHeight: 56,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    name: { fontSize: 14, fontWeight: "800" },
    meta: { fontSize: 11.5, marginTop: 2 },
    lockBox: {
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 14,
      padding: 12,
      gap: 10,
    },
    lockCopy: { gap: 4 },
    lockTitle: { fontSize: 13, fontWeight: "800" },
    lockBody: { fontSize: 12, lineHeight: 17, fontWeight: "500" },
    supportBtn: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    supportBtnText: { fontSize: 12.5, fontWeight: "800" },
    removeLink: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      alignSelf: "flex-start",
    },
    removeLinkText: { fontSize: 12.5, fontWeight: "700" },
    error: { marginTop: 6, fontSize: 12, fontWeight: "600", lineHeight: 16 },
    pressed: { opacity: 0.85 },
    sheetBody: {
      paddingTop: 4,
      paddingBottom: 8,
      gap: 12,
    },
    sheetIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetHeadline: {
      fontSize: 17,
      fontWeight: "800",
      lineHeight: 23,
    },
    sheetCopy: {
      fontSize: 13.5,
      lineHeight: 20,
      fontWeight: "500",
    },
    previewCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 14,
      padding: 10,
    },
    previewName: { fontSize: 14, fontWeight: "800" },
    previewMeta: { fontSize: 11.5, marginTop: 2, fontWeight: "500" },
    sheetActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    },
    sheetBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    sheetBtnGhost: {
      borderWidth: 1,
    },
    sheetBtnGhostText: { fontSize: 14, fontWeight: "800" },
    sheetBtnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  });
