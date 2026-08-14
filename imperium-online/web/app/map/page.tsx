"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { useCities } from "@/lib/cityStore";
import { getCity, getMyAlliance, getMyCity, getMovementsWithClock, getWorld, type City, type WorldCity } from "@/lib/api";
import { realtime } from "@/lib/realtime";
import TopBar from "@/components/TopBar";
import OrnateHeader from "@/components/OrnateHeader";
import SendArmyForm from "@/components/SendArmyForm";
import type { MapData, MovementData } from "@/components/phaser/MapScene";

const PhaserGame = dynamic(() => import("@/components/PhaserGame"), { ssr: false });

type Selected = { x: number; y: number; name: string; owner: string };

export default function MapPage() {
  const { token, ready } = useAuth();
  const { cities, activeId, reload: reloadCities } = useCities();
  const router = useRouter();
  const [data, setData] = useState<MapData | null>(null);
  const [movements, setMovements] = useState<MovementData>({ movements: [], serverNowMs: null });
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
      const [world, alliance] = await Promise.all([getWorld(token), getMyAlliance(token)]);
      const mineSet = new Set(cities.map((c) => `${c.x},${c.y}`));
      const mine = [...mineSet];
      // Allied = cities in my alliance that aren't my own.
      const allies = alliance
        ? (world as WorldCity[])
            .filter((c) => c.alliance === alliance.name && !mineSet.has(`${c.x},${c.y}`))
            .map((c) => `${c.x},${c.y}`)
        : [];
      setData({ cities: world as WorldCity[], mine, allies });
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

  // Marching armies ride their own channel: the scene interpolates positions
  // locally, so this only needs to refetch when the *set* of marches changes —
  // not every second. A signature guard keeps an unchanged poll from minting a
  // new object identity (which would re-emit into Phaser for nothing).
  const loadMovements = useCallback(async () => {
    if (!token) return;
    try {
      const next = await getMovementsWithClock(token);
      setMovements((prev) => {
        const sig = (d: MovementData) => d.movements.map((m) => `${m.id}@${m.arrives_at}`).join("|");
        return sig(prev) === sig(next) ? prev : next;
      });
    } catch {
      /* keep the last known set — a failed poll shouldn't clear the map */
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadMovements();
    const unsubscribe = realtime.subscribe((evt) => {
      switch (evt.type) {
        case "attack_resolved":
        case "army_returned":
        case "queued":
        case "city_founded":
        case "city_captured":
          loadMovements();
          break;
      }
    });
    // Safety net for events that never arrive (dropped socket, other players).
    const poll = setInterval(loadMovements, 25000);
    return () => { unsubscribe(); clearInterval(poll); };
  }, [token, loadMovements]);

  // Refetch the moment the soonest march lands, so arrivals clear promptly.
  useEffect(() => {
    const soonest = movements.movements
      .map((m) => Date.parse(m.arrives_at))
      .sort((a, b) => a - b)[0];
    if (!soonest) return;
    const delay = Math.max(500, soonest - Date.now() + 750);
    const timer = setTimeout(loadMovements, delay);
    return () => clearTimeout(timer);
  }, [movements, loadMovements]);

  // Clicking any city opens the send form — your own becomes a reinforcement,
  // an enemy an attack (the server classifies the order).
  const onCitySelect = useCallback((c: Selected) => {
    setSentMsg(null);
    setSelected(c);
  }, []);

  // "Found a colony" — pick an empty cell to march settlers to. Clicking a
  // free slot on the map pre-fills the coordinates.
  const [foundX, setFoundX] = useState("");
  const [foundY, setFoundY] = useState("");
  const onCellSelect = useCallback((cell: { x: number; y: number }) => {
    setFoundX(String(cell.x));
    setFoundY(String(cell.y));
    setSentMsg(null);
  }, []);
  function openFound() {
    const x = Number(foundX), y = Number(foundY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    setSentMsg(null);
    setSelected({ x, y, name: "New colony", owner: "empty" });
  }

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
            <PhaserGame kind="map" data={data} movements={movements} onCitySelect={onCitySelect} onCellSelect={onCellSelect} />
            <div className="found-bar">
              <span className="muted">Found a colony at</span>
              <input type="number" placeholder="x" value={foundX} onChange={(e) => setFoundX(e.target.value)} style={{ width: 64 }} />
              <input type="number" placeholder="y" value={foundY} onChange={(e) => setFoundY(e.target.value)} style={{ width: 64 }} />
              <button className="btn btn-ghost" type="button" onClick={openFound}>Send settlers →</button>
            </div>
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
              setSentMsg(`Your army marches on ${selected.name}. Watch it cross the sea.`);
              load();
              loadMovements();
            }}
            onCancel={() => setSelected(null)}
          />
        )}
      </div>
    </>
  );
}
