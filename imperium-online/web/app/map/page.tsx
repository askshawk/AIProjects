"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { useCities } from "@/lib/cityStore";
import { getCity, getMyCity, getWorld, type City, type WorldCity } from "@/lib/api";
import { realtime } from "@/lib/realtime";
import TopBar from "@/components/TopBar";
import OrnateHeader from "@/components/OrnateHeader";
import SendArmyForm from "@/components/SendArmyForm";
import type { MapData } from "@/components/phaser/MapScene";

const PhaserGame = dynamic(() => import("@/components/PhaserGame"), { ssr: false });

type Selected = { x: number; y: number; name: string; owner: string };

export default function MapPage() {
  const { token, ready } = useAuth();
  const { cities, activeId, reload: reloadCities } = useCities();
  const router = useRouter();
  const [data, setData] = useState<MapData | null>(null);
  const [origin, setOrigin] = useState<City | null>(null);  // active city = army origin
  const [selected, setSelected] = useState<Selected | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Coords of all my cities, for the laurel ring + "is this mine?" check.
  const mineCoords = cities.map((c) => `${c.x},${c.y}`);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const world = await getWorld(token);
      setData({ cities: world as WorldCity[], mine: cities.map((c) => `${c.x},${c.y}`) });
      // The active city is the origin armies march from.
      setOrigin(activeId != null ? await getCity(token, activeId) : await getMyCity(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load map");
    }
  }, [token, activeId, cities]);

  useEffect(() => {
    load();
    const unsubscribe = realtime.subscribe((evt) => {
      if (evt.type === "attack_resolved" || evt.type === "city_captured" || evt.type === "city_founded") {
        reloadCities();
        load();
      }
    });
    return unsubscribe;
  }, [load, reloadCities]);

  // Clicking one of your own cities does nothing; an enemy opens the march form.
  const onCitySelect = useCallback((c: Selected) => {
    setSentMsg(null);
    setSelected(mineCoords.includes(`${c.x},${c.y}`) ? null : c);
  }, [mineCoords]);

  if (!ready || !token) return null;

  return (
    <>
      <TopBar />
      <div className="container">
        <OrnateHeader
          title="The Known World"
          subtitle="Every colonia in the shared world — yours encircled in laurel-gold. Drag to pan, scroll to zoom, click an enemy city to march on it."
        />
        {error && <div className="error">{error}</div>}
        {sentMsg && <div className="notice">{sentMsg}</div>}

        {data ? (
          <div className="card">
            <PhaserGame kind="map" data={data} onCitySelect={onCitySelect} />
          </div>
        ) : (
          <p className="muted">Surveying the provinces…</p>
        )}

        {selected && origin && (
          <SendArmyForm
            token={token}
            city={origin}
            target={selected}
            onSent={() => {
              setSelected(null);
              setSentMsg(`Your army marches on ${selected.name}. Track it from your city.`);
              load();
            }}
            onCancel={() => setSelected(null)}
          />
        )}
      </div>
    </>
  );
}
