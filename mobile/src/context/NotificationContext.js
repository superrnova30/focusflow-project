import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import client from "../api/client";
import { useAuth } from "./AuthContext";

const NotificationContext = createContext(null);
const POLL_MS = 8000;
const POLL_PANEL_MS = 4000;

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const mountedRef = useRef(true);
  const lastUnreadRef = useRef(0);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!user?.id || user.role === "ADMIN") {
      setItems([]);
      setUnreadCount(0);
      return null;
    }
    try {
      const { data } = await client.get("/notifications");
      if (!mountedRef.current) return data;
      const list = data.notifications || [];
      const count = Number(data.unreadCount) || 0;
      setItems(list);
      setUnreadCount(count);
      lastUnreadRef.current = count;
      return data;
    } catch {
      return null;
    }
  }, [user?.id, user?.role]);

  const refreshUnread = useCallback(async () => {
    if (!user?.id || user.role === "ADMIN") {
      setUnreadCount(0);
      return 0;
    }
    try {
      const { data } = await client.get("/notifications/unread-count");
      const count = Number(data.unreadCount) || 0;
      if (mountedRef.current) {
        if (count > lastUnreadRef.current) {
          refresh().catch(() => {});
        } else {
          setUnreadCount(count);
          lastUnreadRef.current = count;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }, [user?.id, user?.role, refresh]);

  useEffect(() => {
    if (!panelOpen || !user?.id || user.role === "ADMIN") return undefined;
    const interval = setInterval(() => {
      refresh().catch(() => {});
    }, POLL_PANEL_MS);
    return () => clearInterval(interval);
  }, [panelOpen, user?.id, user?.role, refresh]);

  const markRead = useCallback(async (id) => {
    if (!id) return null;
    setItems((current) =>
      current.map((row) => (row.id === id && !row.readAt ? { ...row, readAt: new Date().toISOString(), unread: false } : row))
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      const { data } = await client.post(`/notifications/${id}/read`);
      if (mountedRef.current && data.unreadCount != null) {
        setUnreadCount(data.unreadCount);
        lastUnreadRef.current = data.unreadCount;
      }
      if (mountedRef.current && data.notification) {
        setItems((current) => current.map((row) => (row.id === id ? data.notification : row)));
      }
      return data;
    } catch {
      refresh().catch(() => {});
      return null;
    }
  }, [refresh]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    refresh().catch(() => {});
  }, [refresh]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSelectedId(null);
  }, []);

  const selectNotification = useCallback((item) => {
    if (!item?.id) return;
    setSelectedId((current) => (current === item.id ? null : item.id));
    if (item.unread) markRead(item.id);
  }, [markRead]);

  const markAllRead = useCallback(async () => {
    setItems((current) => current.map((row) => ({ ...row, readAt: row.readAt || new Date().toISOString(), unread: false })));
    setUnreadCount(0);
    lastUnreadRef.current = 0;
    try {
      await client.post("/notifications/read-all");
    } catch {
      refresh().catch(() => {});
    }
  }, [refresh]);

  useEffect(() => {
    if (!user?.id || user.role === "ADMIN") {
      setItems([]);
      setUnreadCount(0);
      return undefined;
    }
    setLoading(true);
    refresh().finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    const interval = setInterval(() => {
      refreshUnread().catch(() => {});
    }, POLL_MS);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshUnread().catch(() => {});
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [user?.id, user?.role, refresh, refreshUnread]);

  return (
    <NotificationContext.Provider
      value={{
        items,
        unreadCount,
        loading,
        panelOpen,
        selectedId,
        refresh,
        refreshUnread,
        markRead,
        markAllRead,
        openPanel,
        closePanel,
        selectNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside a NotificationProvider");
  return ctx;
}

export default NotificationContext;
