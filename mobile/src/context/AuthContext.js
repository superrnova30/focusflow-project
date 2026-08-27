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
    try {
      const { data } = await client.post("/auth/login", { email, password });
      await AsyncStorage.setItem("focusflow_token", data.token);
      setUser(data.user);
      registerForPushNotifications();
      retryOfflineWrites();
      return data.user;
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.requiresVerification) {
        throw Object.assign(new Error(err.response.data.error), {
          requiresVerification: true,
          email: err.response.data.email,
        });
      }
      throw err;
    }
  }, []);

  const signup = useCallback(async (name, email, password) => {
    const { data } = await client.post("/auth/signup", { name, email, password });
    return data;
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    const { data } = await client.post("/auth/forgot-password", { email });
    return data;
  }, []);

  const resetPassword = useCallback(async (email, code, newPassword) => {
    const { data } = await client.post("/auth/reset-password", { email, code, newPassword });
    return data;
  }, []);

  const verifyEmail = useCallback(async (email, code) => {
    const { data } = await client.post("/auth/verify-email", { email, code });
    if (data.token) {
      await AsyncStorage.setItem("focusflow_token", data.token);
      setUser(data.user);
      registerForPushNotifications();
    }
    return data;
  }, []);

  const sendVerificationCode = useCallback(async (email) => {
    const { data } = await client.post("/auth/send-verification", { email });
    return data;
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
    <AuthContext.Provider
      value={{
        user,
        setUser,
        booting,
        login,
        signup,
        logout,
        refreshUser,
        requestPasswordReset,
        resetPassword,
        verifyEmail,
        sendVerificationCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
