import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SPACING } from "../theme/theme";
import client from "../api/client";
import SchoolLogo from "./SchoolLogo";
import { SCHOOL_TYPES, MAX_SCHOOL_LOGO_BYTES, isLikelyImageFile, schoolTypeLabel } from "../lib/schools";

export default function SchoolSelectModal({
  visible,
  selectedId,
  onClose,
  onSelect,
}) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const compact = width < 420;
  const styles = useMemo(() => createStyles(colors, compact, height), [colors, compact, height]);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", type: "UNIVERSITY", logoPreview: "", logoBase64: "", fileName: "" });
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formDone, setFormDone] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/schools", { params: { q: debounced, take: 30 } });
      setSchools(data.schools || []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not search schools.");
      setSchools([]);
    } finally {
      setLoading(false);
    }
  }, [visible, debounced]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setRequesting(false);
      setForm({ name: "", location: "", type: "UNIVERSITY", logoPreview: "", logoBase64: "", fileName: "" });
      setFormError("");
      setFormDone("");
    }
  }, [visible]);

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setFormError("Allow photo access to attach a school logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!isLikelyImageFile(asset.fileName || asset.uri, asset.mimeType)) {
      setFormError("Logos must be PNG, JPG, or JPEG.");
      return;
    }
    const bytes = asset.fileSize || (asset.base64 ? Math.ceil((asset.base64.length * 3) / 4) : 0);
    if (bytes > MAX_SCHOOL_LOGO_BYTES) {
      setFormError("Logos must be 2MB or smaller.");
      return;
    }
    setForm((current) => ({
      ...current,
      logoPreview: asset.uri,
      logoBase64: asset.base64,
      fileName: asset.fileName || "logo.jpg",
    }));
    setFormError("");
  };

  const submitRequest = async () => {
    if (formBusy) return;
    setFormBusy(true);
    setFormError("");
    try {
      const { data } = await client.post("/schools/request", {
        name: form.name.trim(),
        location: form.location.trim(),
        type: form.type,
        logoBase64: form.logoBase64 || undefined,
        fileName: form.fileName || undefined,
      });
      setFormDone(data.message || "Request sent for admin review.");
      setRequesting(false);
    } catch (e) {
      setFormError(e?.response?.data?.error || e.message || "Could not send the request.");
    } finally {
      setFormBusy(false);
    }
  };

  const choose = async (school) => {
    if (savingId) return;
    setSavingId(school.id);
    setError("");
    try {
      await onSelect(school);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not save your school.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kicker}>School directory</Text>
              <Text style={styles.title}>{requesting ? "Request a school" : "Select your school"}</Text>
              <Text style={styles.subtitle}>
                {requesting
                  ? "Admins review new schools before they appear in search."
                  : "Search approved schools. This does not verify enrollment."}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>

          {requesting ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Text style={styles.fieldLabel}>School name</Text>
              <TextInput
                value={form.name}
                onChangeText={(name) => setForm((current) => ({ ...current, name }))}
                placeholder="e.g. University of the Philippines"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Location</Text>
              <TextInput
                value={form.location}
                onChangeText={(location) => setForm((current) => ({ ...current, location }))}
                placeholder="City, province, or campus"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.typeRow}>
                {SCHOOL_TYPES.map((item) => {
                  const on = form.type === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setForm((current) => ({ ...current, type: item.value }))}
                      style={[styles.typeChip, on && styles.typeChipOn]}
                    >
                      <Text style={[styles.typeText, on && styles.typeTextOn]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Logo (optional)</Text>
              <Pressable onPress={pickLogo} style={styles.logoPick}>
                <SchoolLogo school={{ name: form.name }} uri={form.logoPreview || undefined} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.logoPickText}>{form.logoPreview ? "Change logo preview" : "Upload a logo"}</Text>
                  <Text style={styles.logoPickMeta}>PNG or JPG, max 2MB</Text>
                </View>
              </Pressable>
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <View style={styles.formActions}>
                <Pressable onPress={() => setRequesting(false)} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryText}>Back to search</Text>
                </Pressable>
                <Pressable onPress={submitRequest} disabled={formBusy} style={styles.primaryBtn}>
                  {formBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit request</Text>}
                </Pressable>
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search school name"
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                  autoFocus={Platform.OS !== "web"}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {query ? (
                  <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              {formDone ? <Text style={styles.success}>{formDone}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {loading ? (
                <ActivityIndicator color={colors.violet} style={{ marginTop: 24 }} />
              ) : (
                <FlatList
                  data={schools}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  style={styles.list}
                  contentContainerStyle={schools.length ? styles.listContent : styles.emptyWrap}
                  ListEmptyComponent={
                    <View style={styles.empty}>
                      <View style={styles.emptyIcon}>
                        <Ionicons name="school-outline" size={22} color={colors.violet} />
                      </View>
                      <Text style={styles.emptyTitle}>No matching schools</Text>
                      <Text style={styles.emptyCopy}>If your campus isn’t listed yet, send a request for admin review.</Text>
                      <Pressable
                        onPress={() => {
                          setForm((current) => ({ ...current, name: current.name || query.trim() }));
                          setRequesting(true);
                        }}
                        style={styles.primaryBtn}
                      >
                        <Text style={styles.primaryText}>Request to add school</Text>
                      </Pressable>
                    </View>
                  }
                  renderItem={({ item }) => {
                    const selected = item.id === selectedId;
                    return (
                      <Pressable onPress={() => choose(item)} style={[styles.row, selected && styles.rowOn]}>
                        <SchoolLogo school={item} size={42} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {[
                              item.location && !/^unknown( location)?$/i.test(String(item.location).trim())
                                ? item.location
                                : null,
                              item.typeLabel || schoolTypeLabel(item.type),
                            ].filter(Boolean).join(" · ")}
                          </Text>
                          <Text style={styles.rowCount}>
                            {item.studentCount || 0} student{(item.studentCount || 0) === 1 ? "" : "s"} linked
                          </Text>
                        </View>
                        {savingId === item.id ? (
                          <ActivityIndicator color={colors.violet} />
                        ) : selected ? (
                          <Ionicons name="checkmark-circle" size={22} color={colors.mint} />
                        ) : (
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        )}
                      </Pressable>
                    );
                  }}
                />
              )}
              {schools.length ? (
                <Pressable
                  onPress={() => {
                    setForm((current) => ({ ...current, name: current.name || query.trim() }));
                    setRequesting(true);
                  }}
                  style={styles.footerLink}
                >
                  <Text style={styles.footerText}>Can’t find your school? Request to add it</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors, compact, height) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(14,18,32,0.5)",
      justifyContent: "center",
      padding: compact ? 10 : 18,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      maxHeight: Math.min(height - 48, 720),
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
      overflow: "hidden",
    },
    head: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 10, alignItems: "flex-start" },
    kicker: { color: colors.violet, fontSize: 11, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
    title: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 2 },
    subtitle: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4, fontWeight: "600" },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    fieldLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.3,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 12,
      paddingHorizontal: 10,
      minHeight: 44,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 },
    list: { flexGrow: 0 },
    listContent: { paddingHorizontal: 10, paddingBottom: 8 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 12,
      minHeight: 64,
    },
    rowOn: { backgroundColor: colors.violetSoft },
    rowTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
    rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    rowCount: { color: colors.violet, fontSize: 11, fontWeight: "700", marginTop: 3 },
    emptyWrap: { padding: 24 },
    empty: { alignItems: "center", gap: 8 },
    emptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
    emptyCopy: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18, maxWidth: 320, marginBottom: 6 },
    footerLink: { padding: 14, alignItems: "center" },
    footerText: { color: colors.violet, fontWeight: "800", fontSize: 12.5 },
    form: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 12,
      paddingHorizontal: 12,
      minHeight: 44,
      color: colors.text,
    },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    typeChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.bg,
    },
    typeChipOn: { backgroundColor: colors.violetSoft, borderColor: colors.violet },
    typeText: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
    typeTextOn: { color: colors.violet },
    logoPick: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.bg,
    },
    logoPickMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },
    logoPickText: { color: colors.text, fontSize: 13, fontWeight: "700", flex: 1 },
    formActions: { flexDirection: compact ? "column" : "row", gap: 8, marginTop: 6 },
    primaryBtn: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    primaryText: { color: "#fff", fontWeight: "800" },
    secondaryBtn: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    secondaryText: { color: colors.text, fontWeight: "800" },
    error: { color: colors.tomato, fontSize: 12.5, paddingHorizontal: 16, marginBottom: 6 },
    success: { color: colors.mint, fontSize: 12.5, paddingHorizontal: 16, marginBottom: 6, fontWeight: "700" },
  });
