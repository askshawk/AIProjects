"use client";

// Holds the list of the player's cities and which one is "active". Lives above
// the page tree so the TopBar switcher and the play page stay in sync. The
// active id is persisted to localStorage so a refresh keeps you on the same
// city. Refreshed on login and whenever a city is founded/captured (the play
// page calls reload() on those realtime events).

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getMyCities, type CitySummary } from "./api";
import { useAuth } from "./auth";

type CityStore = {
  cities: CitySummary[];
  activeId: number | null;
  select: (id: number) => void;
  reload: () => Promise<void>;
};

const KEY = "imperium_active_city";
const CityContext = createContext<CityStore | null>(null);

export function CityProvider({ children }: { children: React.ReactNode }) {
  const { authed } = useAuth();
  const [cities, setCities] = useState<CitySummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!authed) {
      setCities([]);
      setActiveId(null);
      return;
    }
    const list = await getMyCities();
    setCities(list);
    // Keep the stored active city if it still exists; else fall back to first.
    setActiveId((current) => {
      const stored = Number(localStorage.getItem(KEY));
      const valid = (id: number | null) => id != null && list.some((c) => c.id === id);
      if (valid(current)) return current;
      if (valid(stored)) return stored;
      return list[0]?.id ?? null;
    });
  }, [authed]);

  useEffect(() => { reload(); }, [reload]);

  const select = useCallback((id: number) => {
    localStorage.setItem(KEY, String(id));
    setActiveId(id);
  }, []);

  // Persist whatever ends up active so the first reload after login sticks.
  useEffect(() => {
    if (activeId != null) localStorage.setItem(KEY, String(activeId));
  }, [activeId]);

  return (
    <CityContext.Provider value={{ cities, activeId, select, reload }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCities(): CityStore {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error("useCities must be used within <CityProvider>");
  return ctx;
}
