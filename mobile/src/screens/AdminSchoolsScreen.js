import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { RADIUS } from "../theme/theme";
import client from "../api/client";
import SchoolLogo from "../components/SchoolLogo";
import ConfirmDialog from "../components/ConfirmDialog";
import { SCHOOL_TYPES, MAX_SCHOOL_LOGO_BYTES, isLikelyImageFile, schoolTypeLabel } from "../lib/schools";
import { resolveMediaUrl } from "../lib/media";

const STATUSES = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

const emptyForm = {
  id: null,
  name: "",
  location: "",
  type: "UNIVERSITY",
  status: "APPROVED",
  logoPreview: "",
  logoBase64: "",
  fileName: "",
  existingLogo: "",
};

export default function AdminSchoolsScreen() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const compact = width < 420;
  const wide = width >= 760;
  const styles = useMemo(() => createStyles(colors, compact, wide, height), [colors, compact, wide, height]);

  const [schools, setSchools] = useState([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/admin/schools", {
        params: { q: debounced || undefined, status: status === "ALL" ? undefined : status },
      });
      setSchools(data.schools || []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load schools.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debounced, status]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => {
    setFormError("");
    setEditor({ ...emptyForm });
  };

  const openEdit = (school) => {
    setFormError("");
    setEditor({
      id: school.id,
      name: school.name,
      location: school.location,
      type: school.type,
      status: school.status,
      logoPreview: resolveMediaUrl(school.logoUrl) || "",
      logoBase64: "",
      fileName: "",
      existingLogo: school.logoUrl || "",
    });
  };

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setFormError("Allow photo access to upload a logo.");
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
    setEditor((current) => ({
      ...current,
      logoPreview: asset.uri,
      logoBase64: asset.base64,
      fileName: asset.fileName || "logo.jpg",
    }));
    setFormError("");
  };

  const saveEditor = async () => {
    if (!editor || saving) return;
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        name: editor.name.trim(),
        location: editor.location.trim(),
        type: editor.type,
        status: editor.status,
        logoBase64: editor.logoBase64 || undefined,
        fileName: editor.fileName || undefined,
      };
      const { data } = editor.id
        ? await client.patch(`/admin/schools/${editor.id}`, payload)
        : await client.post("/admin/schools", payload);
      if (editor.id && editor.logoBase64) {
        await client.post(`/admin/schools/${editor.id}/logo`, {
          logoBase64: editor.logoBase64,
          fileName: editor.fileName,
        });
      }
      setEditor(null);
      await load({ silent: true });
      return data;
    } catch (e) {
      setFormError(e?.response?.data?.error || e.message || "Could not save the school.");
    } finally {
      setSaving(false);
    }
  };

  const setSchoolStatus = async (school, nextStatus) => {
    setBusyId(school.id);
    try {
      await client.post(`/admin/schools/${school.id}/status`, { status: nextStatus });
      await load({ silent: true });
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  };

  const removeLogo = async (school) => {
    setBusyId(school.id);
    try {
      await client.delete(`/admin/schools/${school.id}/logo`);
      await load({ silent: true });
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  };

  const deleteSchool = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await client.delete(`/admin/schools/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load({ silent: true });
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setDeleteTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  const statusColor = (value) => {
    if (value === "APPROVED") return colors.mint;
    if (value === "REJECTED") return colors.tomato;
    return colors.amber;
  };

  const statusLabel = (value) => {
    if (value === "APPROVED") return "Approved";
    if (value === "REJECTED") return "Rejected";
    return "Pending";
  };

  const pendingCount = schools.filter((row) => row.status === "PENDING").length;

  const actionBtn = (label, icon, color, onPress, disabled) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionBtn,
        { opacity: pressed || disabled ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <View style={styles.shell}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>Directory</Text>
            <Text style={styles.title}>Schools</Text>
            <Text style={styles.subtitle}>
              {loading ? "Loading campus directory…" : `${schools.length} ${schools.length === 1 ? "school" : "schools"} in this view`}
            </Text>
          </View>
          <Pressable onPress={openCreate} style={styles.addBtn} accessibilityLabel="Add school">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or location"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filters}>
          {STATUSES.map((item) => {
            const on = status === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setStatus(item.key)}
                style={[styles.filter, on && styles.filterOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.filterText, on && styles.filterTextOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {status === "ALL" && pendingCount > 0 ? (
          <Pressable onPress={() => setStatus("PENDING")} style={styles.pendingBanner}>
            <Ionicons name="time-outline" size={16} color={colors.amber} />
            <Text style={styles.pendingBannerText}>
              {pendingCount} pending {pendingCount === 1 ? "request" : "requests"} need review
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.amber} />
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && !refreshing ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.violet} />
            <Text style={styles.loadingText}>Loading schools…</Text>
          </View>
        ) : (
          <FlatList
            data={schools}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load({ silent: true });
                }}
                tintColor={colors.violet}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="school-outline" size={22} color={colors.violet} />
                </View>
                <Text style={styles.emptyTitle}>
                  {debounced || status !== "ALL" ? "No matching schools" : "No schools yet"}
                </Text>
                <Text style={styles.empty}>
                  {debounced || status !== "ALL"
                    ? "Try another search or status filter."
                    : "Add a campus to the directory so students can select it."}
                </Text>
                {!debounced && status === "ALL" ? (
                  <Pressable onPress={openCreate} style={styles.addBtn}>
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.addText}>Add school</Text>
                  </Pressable>
                ) : null}
              </View>
            }
            renderItem={({ item }) => {
              const busy = busyId === item.id;
              const tone = statusColor(item.status);
              return (
                <View style={[styles.card, item.status === "PENDING" && styles.cardPending]}>
                  <View style={styles.cardTop}>
                    <SchoolLogo school={item} size={compact ? 44 : 48} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.cardMeta} numberOfLines={2}>
                        {[item.location, item.typeLabel || schoolTypeLabel(item.type)].filter(Boolean).join(" · ")}
                      </Text>
                      <Text style={styles.cardCount}>
                        {item.studentCount || 0} {(item.studentCount || 0) === 1 ? "student" : "students"} linked
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: `${tone}22` }]}>
                      <Text style={[styles.badgeText, { color: tone }]}>{statusLabel(item.status)}</Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    {item.status !== "APPROVED"
                      ? actionBtn("Approve", "checkmark", colors.mint, () => setSchoolStatus(item, "APPROVED"), busy)
                      : null}
                    {item.status !== "REJECTED"
                      ? actionBtn("Reject", "close", colors.tomato, () => setSchoolStatus(item, "REJECTED"), busy)
                      : null}
                    {actionBtn("Edit", "create-outline", colors.text, () => openEdit(item), busy)}
                    {item.logoUrl
                      ? actionBtn("Remove logo", "image-outline", colors.textMuted, () => removeLogo(item), busy)
                      : null}
                    {actionBtn(
                      "Delete",
                      "trash-outline",
                      item.studentCount ? colors.textMuted : colors.tomato,
                      () => setDeleteTarget(item),
                      busy
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      <Modal visible={Boolean(editor)} transparent animationType="fade" onRequestClose={() => setEditor(null)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditor(null)} />
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalKicker}>{editor?.id ? "Directory" : "New campus"}</Text>
              <Text style={styles.modalTitle}>{editor?.id ? "Edit school" : "Add school"}</Text>
              <Text style={styles.fieldLabel}>School name</Text>
              <TextInput
                value={editor?.name || ""}
                onChangeText={(name) => setEditor((c) => ({ ...c, name }))}
                placeholder="e.g. University of the Philippines"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Location</Text>
              <TextInput
                value={editor?.location || ""}
                onChangeText={(location) => setEditor((c) => ({ ...c, location }))}
                placeholder="City or campus"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.typeRow}>
                {SCHOOL_TYPES.map((item) => {
                  const on = editor?.type === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setEditor((c) => ({ ...c, type: item.value }))}
                      style={[styles.typeChip, on && styles.typeChipOn]}
                    >
                      <Text style={[styles.typeText, on && styles.typeTextOn]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.typeRow}>
                {["PENDING", "APPROVED", "REJECTED"].map((item) => {
                  const on = editor?.status === item;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setEditor((c) => ({ ...c, status: item }))}
                      style={[styles.typeChip, on && styles.typeChipOn]}
                    >
                      <Text style={[styles.typeText, on && styles.typeTextOn]}>{statusLabel(item)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Logo</Text>
              <Pressable onPress={pickLogo} style={styles.logoPick}>
                <SchoolLogo school={{ name: editor?.name }} uri={editor?.logoPreview || undefined} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.logoPickText}>Upload or replace logo</Text>
                  <Text style={styles.logoPickMeta}>PNG or JPG, max 2MB</Text>
                </View>
                <Ionicons name="cloud-upload-outline" size={16} color={colors.violet} />
              </Pressable>
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <View style={styles.modalActions}>
                <Pressable onPress={() => setEditor(null)} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveEditor} disabled={saving} style={[styles.addBtn, { flex: 1 }]}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.addText}>Save</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={Boolean(deleteTarget)}
        title={deleteTarget?.studentCount ? "School is in use" : "Delete school?"}
        message={
          deleteTarget?.studentCount
            ? `${deleteTarget.name} is linked to ${deleteTarget.studentCount} students. Unlink those students before deleting this school.`
            : `This permanently removes ${deleteTarget?.name || "this school"} from the directory.`
        }
        confirmText={deleteTarget?.studentCount ? "OK" : "Delete"}
        destructive={!deleteTarget?.studentCount}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteTarget?.studentCount ? () => setDeleteTarget(null) : deleteSchool}
      />
    </Screen>
  );
}

const createStyles = (colors, compact, wide, height) =>
  StyleSheet.create({
    shell: { flex: 1, minHeight: 0, maxWidth: wide ? 920 : "100%", width: "100%", alignSelf: "center" },
    header: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },
    kicker: { color: colors.violet, fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
    title: { color: colors.text, fontSize: compact ? 22 : 24, fontWeight: "800", marginTop: 1 },
    subtitle: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
    addBtn: {
      minHeight: 40,
      borderRadius: 12,
      backgroundColor: colors.tomato,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    addText: { color: "#fff", fontWeight: "800" },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 12,
      minHeight: 46,
      marginBottom: 8,
    },
    searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, fontWeight: "600", paddingVertical: 8 },
    filters: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
    filter: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      minHeight: 34,
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    filterOn: { backgroundColor: colors.violetSoft, borderColor: colors.violet },
    filterText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
    filterTextOn: { color: colors.violet },
    pendingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.amberSoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      minHeight: 42,
      marginBottom: 10,
    },
    pendingBannerText: { flex: 1, color: colors.amber, fontSize: 12.5, fontWeight: "800" },
    list: { paddingBottom: 32, gap: 10, flexGrow: 1 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 12,
      gap: 10,
    },
    cardPending: { borderColor: colors.amber },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
    cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "600", lineHeight: 16 },
    cardCount: { color: colors.violet, fontSize: 11, fontWeight: "700", marginTop: 4 },
    badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    badgeText: { fontSize: 10, fontWeight: "900" },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    actionBtn: {
      minHeight: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      paddingHorizontal: 10,
      flexDirection: "row",
      gap: 5,
    },
    actionText: { fontSize: 11.5, fontWeight: "800" },
    loading: { alignItems: "center", paddingTop: 36, gap: 10 },
    loadingText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    emptyWrap: { alignItems: "center", paddingTop: 36, paddingHorizontal: 20, gap: 8 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
    emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
    empty: { color: colors.textMuted, textAlign: "center", fontSize: 13, lineHeight: 18, maxWidth: 300 },
    error: { color: colors.tomato, marginBottom: 8, fontSize: 12.5, fontWeight: "700" },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(14,18,32,0.55)",
      justifyContent: "center",
      padding: compact ? 12 : 20,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: compact ? 14 : 18,
      maxHeight: Math.min(height * 0.9, 720),
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
    },
    modalKicker: { color: colors.violet, fontSize: 11, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 12, marginTop: 2 },
    fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 12,
      paddingHorizontal: 12,
      minHeight: 44,
      color: colors.text,
      marginBottom: 10,
      fontWeight: "600",
    },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
    typeChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      minHeight: 32,
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    typeChipOn: { backgroundColor: colors.violetSoft, borderColor: colors.violet },
    typeText: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
    typeTextOn: { color: colors.violet },
    logoPick: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 10,
      backgroundColor: colors.bg,
    },
    logoPickText: { color: colors.text, fontWeight: "800", fontSize: 13 },
    logoPickMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },
    modalActions: { flexDirection: compact ? "column" : "row", gap: 8, marginTop: 8 },
    secondaryBtn: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryText: { color: colors.text, fontWeight: "800" },
  });
