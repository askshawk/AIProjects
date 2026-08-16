"use client";

// Auth context.
//
// The session lives in an httpOnly cookie the browser sends automatically, so
// this holds no credential at all — only whether we are signed in. That is the
// point: a script (ours, or one injected via XSS) cannot read the session the
// way it could read a token in localStorage.
//
// Because the cookie is invisible to JS, "am I signed in?" is a question only
// the server can answer: we ask once on mount via /me.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as api from "./api";
import { realtime } from "./realtime";

type AuthState = {
  authed: boolean;
  ready: boolean; // false until the /me probe resolves (avoids redirect flicker)
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, cityName: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  // Ask the server whether the cookie we may or may not have is a live session.
  useEffect(() => {
    let alive = true;
    api.getMe()
      .then(() => { if (alive) setAuthed(true); })
      .catch(() => { if (alive) setAuthed(false); })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  // Open the realtime WebSocket while signed in; close on logout. The socket
  // authenticates with the same cookie, so it needs nothing passed in.
  useEffect(() => {
    if (authed) realtime.connect();
    else realtime.close();
  }, [authed]);

  const login = useCallback(async (email: string, password: string) => {
    await api.login(email, password);   // response sets the cookie
    setAuthed(true);
  }, []);

  const register = useCallback(async (email: string, password: string, cityName: string) => {
    await api.register(email, password, cityName);
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    // Only the server can clear an httpOnly cookie; drop local state either way
    // so a failed request still signs you out of the UI.
    api.logout().catch(() => {});
    setAuthed(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authed, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
