"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { getMyCity, getWorld, type City, type WorldCity } from "@/lib/api";
import TopBar from "@/components/TopBar";
import SendArmyForm from "@/components/SendArmyForm";
import type { MapData } from "@/components/phaser/MapScene";

const PhaserGame = dynamic(() => import("@/components/PhaserGame"), { ssr: false });

type Selected = { x: number; y: number; name: string; owner: string };

export default function MapPage() {
  const { token, ready } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<MapData | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [cities, me] = await Promise.all([getWorld(token), getMyCity(token)]);
      setData({ cities: cities as WorldCity[], mine: { x: me.x, y: me.y } });
      setCity(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load map");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Selecting your own city does nothing; an enemy opens the march form.
  const onCitySelect = useCallback((c: Selected) => {
    setSentMsg(null);
    if (city && c.x === city.x && c.y === city.y) {
      setSelected(null);
    } else {
      setSelected(c);
    }
  }, [city]);

  if (!ready || !token) return null;

  return (
    <>
      <TopBar />
      <div className="container">
        <h1>The known world</h1>
        <p className="muted">
          Every <em>colonia</em> in the shared world — yours encircled in laurel-gold. Drag to pan,
          scroll to zoom, <strong>click an enemy city to march on it</strong>.
        </p>
        {error && <div className="error">{error}</div>}
        {sentMsg && <div className="notice">{sentMsg}</div>}

        {data ? (
          <div className="card">
            <PhaserGame kind="map" data={data} onCitySelect={onCitySelect} />
          </div>
        ) : (
          <p className="muted">Surveying the provinces…</p>
        )}

        {selected && city && (
          <SendArmyForm
            token={token}
            city={city}
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
