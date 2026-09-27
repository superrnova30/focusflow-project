import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

const AIHistoryContext = createContext(null);

const CACHE_KEY = 'focusflow_ai_history_cache';
const PINNED_KEY = 'focusflow_ai_history_pinned';

// Group conversations into human-friendly time buckets so the History screen
// can render a timeline instead of an undifferentiated list.
export function bucketForDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Earlier';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  if (date >= startOfWeek) return 'Earlier this week';
  return 'Older';
}

// "3 hours ago" style labels keep long lists scannable without a heavy date lib.
export function relativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AIHistoryProvider({ children }) {
  const [conversations, setConversations] = useState([]);
  const [stats, setStats] = useState({ totalConversations: 0, totalMessages: 0, totalExchanges: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [intentFilter, setIntentFilter] = useState('all');
  const [pinnedIds, setPinnedIds] = useState([]);
  const [total, setTotal] = useState(0);

  const inflightRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Restore the last-known list and pinned set so History renders instantly —
  // and still works offline — before the network round-trip resolves.
  useEffect(() => {
    (async () => {
      try {
        const [cachedRaw, pinnedRaw] = await Promise.all([
          AsyncStorage.getItem(CACHE_KEY),
          AsyncStorage.getItem(PINNED_KEY),
        ]);
        if (cachedRaw && mountedRef.current) {
          const cached = JSON.parse(cachedRaw);
          if (Array.isArray(cached.conversations)) setConversations(cached.conversations);
          if (cached.stats) setStats(cached.stats);
        }
        if (pinnedRaw && mountedRef.current) {
          const ids = JSON.parse(pinnedRaw);
          if (Array.isArray(ids)) setPinnedIds(ids);
        }
      } catch (e) {
        // A corrupt cache should never block the screen.
      }
    })();
  }, []);

  const persistCache = useCallback(async (nextConversations, nextStats) => {
    try {
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ conversations: nextConversations, stats: nextStats })
      );
    } catch (e) {
      // best effort
    }
  }, []);

  const load = useCallback(async ({ mode = 'initial', searchTerm, intent } = {}) => {
    const term = searchTerm !== undefined ? searchTerm : search;
    const wanted = intent !== undefined ? intent : intentFilter;

    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const params = {};
      if (term && term.trim()) params.search = term.trim();
      if (wanted && wanted !== 'all') params.intent = wanted;
      params.limit = 60;

      const { data } = await client.get('/ai/conversations', { params, timeout: 20000 });
      if (!mountedRef.current) return;

      const nextConversations = Array.isArray(data.conversations) ? data.conversations : [];
      const nextStats = data.stats || { totalConversations: 0, totalMessages: 0, totalExchanges: 0 };

      setConversations(nextConversations);
      setStats(nextStats);
      setTotal(data.total || nextConversations.length);

      // Only cache the unfiltered view, so the offline fallback is not a
      // confusing partial slice of the user's history.
      if (!term && (!wanted || wanted === 'all')) {
        persistCache(nextConversations, nextStats);
      }
    } catch (e) {
      if (mountedRef.current) setError(e.message || 'Could not load your AI history');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [search, intentFilter, persistCache]);

  const refresh = useCallback(() => load({ mode: 'refresh' }), [load]);

  const runSearch = useCallback((term) => {
    setSearch(term);
    // Debounce so typing does not fire a request per keystroke.
    if (inflightRef.current) clearTimeout(inflightRef.current);
    inflightRef.current = setTimeout(() => {
      load({ searchTerm: term, intent: intentFilter });
    }, 320);
  }, [load, intentFilter]);

  const changeIntent = useCallback((next) => {
    setIntentFilter(next);
    load({ searchTerm: search, intent: next });
  }, [load, search]);

  const togglePin = useCallback(async (id) => {
    const isPinned = pinnedIds.includes(id);
    const nextIds = isPinned ? pinnedIds.filter((x) => x !== id) : [...pinnedIds, id];

    setPinnedIds(nextIds);
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, pinned: !isPinned } : c)));
    try {
      await AsyncStorage.setItem(PINNED_KEY, JSON.stringify(nextIds));
    } catch (e) {
      // best effort
    }

    try {
      await client.patch(`/ai/conversations/${id}`, { pinned: !isPinned });
    } catch (e) {
      // Roll back the optimistic update if the server rejected it.
      setPinnedIds(pinnedIds);
      setConversations((list) => list.map((c) => (c.id === id ? { ...c, pinned: isPinned } : c)));
    }
  }, [pinnedIds]);

  const remove = useCallback(async (id) => {
    const previous = conversations;
    setConversations((list) => list.filter((c) => c.id !== id));
    try {
      await client.delete(`/ai/conversations/${id}`);
      return true;
    } catch (e) {
      setConversations(previous);
      throw e;
    }
  }, [conversations]);

  const rename = useCallback(async (id, title) => {
    const trimmed = String(title || '').trim();
    if (!trimmed) return false;
    const previous = conversations;
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
    try {
      await client.patch(`/ai/conversations/${id}`, { title: trimmed });
      return true;
    } catch (e) {
      setConversations(previous);
      throw e;
    }
  }, [conversations]);

  const clearAll = useCallback(async () => {
    const previous = conversations;
    setConversations([]);
    setStats({ totalConversations: 0, totalMessages: 0, totalExchanges: 0 });
    setTotal(0);
    try {
      await client.delete('/ai/conversations');
      await AsyncStorage.removeItem(CACHE_KEY);
      return true;
    } catch (e) {
      setConversations(previous);
      throw e;
    }
  }, [conversations]);

  const loadConversation = useCallback(async (id) => {
    const { data } = await client.get(`/ai/conversations/${id}`, { timeout: 20000 });
    return {
      conversation: data.conversation || null,
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  }, []);

  const value = {
    conversations,
    stats,
    total,
    loading,
    refreshing,
    error,
    search,
    intentFilter,
    pinnedIds,
    load,
    refresh,
    runSearch,
    changeIntent,
    togglePin,
    remove,
    rename,
    clearAll,
    loadConversation,
  };

  return <AIHistoryContext.Provider value={value}>{children}</AIHistoryContext.Provider>;
}

export function useAIHistory() {
  const ctx = useContext(AIHistoryContext);
  if (!ctx) throw new Error('useAIHistory must be used inside AIHistoryProvider');
  return ctx;
}

export default AIHistoryContext;
