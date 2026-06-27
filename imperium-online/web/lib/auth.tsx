"use client";

// Auth context: holds the JWT, persists it to localStorage, and exposes
// login/register/logout. The slice keeps the token in localStorage for
// simplicity; the production hardening (see plan) is an httpOnly cookie.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as api from "./api";
import { realtime } from "./realtime";

type AuthState = {
  token: string | null;
  ready: boolean; // false until we've read localStorage (avoids SSR/hydration races)
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, cityName: string) => Promise<void>;
  logout: () => void;
};

const STORAGE_KEY = "imperium_token";
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Rehydrate the token on first mount (client only).
  useEffect(() => {
    setToken(localStorage.getItem(STORAGE_KEY));
    setReady(true);
  }, []);

  // Open the realtime WebSocket whenever a token is available; close on logout.
  // Pages subscribe via `realtime.subscribe(...)` and just call refresh().
  useEffect(() => {
    if (token) realtime.connect(token);
    else realtime.close();
  }, [token]);

  const persist = useCallback((t: string) => {
    localStorage.setItem(STORAGE_KEY, t);
    setToken(t);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.login(email, password);
    persist(access_token);
  }, [persist]);

  const register = useCallback(async (email: string, password: string, cityName: string) => {
    const { access_token } = await api.register(email, password, cityName);
    persist(access_token);
  }, [persist]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
