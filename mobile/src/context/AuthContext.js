import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import client from "../api/client";
import { registerForPushNotifications, unregisterPushNotifications, retryOfflineWrites } from "../lib/push";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem("focusflow_token");
      if (token) {
        try {
          const { data } = await client.get("/auth/me");
          setUser(data.user);
          // Once authenticated, register for push and replay any offline writes.
          registerForPushNotifications();
          retryOfflineWrites();
        } catch (e) {
          await AsyncStorage.removeItem("focusflow_token");
        }
      }
      setBooting(false);
    })();
  }, []);

const login = useCallback(async (email, password) => {
    const { data } = await client.post("/auth/login", { email, password });
    await AsyncStorage.setItem("focusflow_token", data.token);
    setUser(data.user);
    registerForPushNotifications();
    retryOfflineWrites();
    return data.user;
  }, []);

  const signup = useCallback(async (name, email, password) => {
    const { data } = await client.post("/auth/signup", { name, email, password });
    await AsyncStorage.setItem("focusflow_token", data.token);
    setUser(data.user);
    registerForPushNotifications();
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await unregisterPushNotifications();
    await AsyncStorage.removeItem("focusflow_token");
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await client.get("/auth/me");
    setUser(data.user);
    return data.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, booting, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
