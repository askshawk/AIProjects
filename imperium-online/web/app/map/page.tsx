"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { getMyCity, getWorld, type WorldCity } from "@/lib/api";
import TopBar from "@/components/TopBar";
import type { MapData } from "@/components/phaser/MapScene";

const PhaserGame = dynamic(() => import("@/components/PhaserGame"), { ssr: false });

export default function MapPage() {
  const { token, ready } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        // Load the shared world and our own city (to highlight it).
        const [cities, me] = await Promise.all([getWorld(token), getMyCity(token)]);
        setData({ cities: cities as WorldCity[], mine: { x: me.x, y: me.y } });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load map");
      }
    })();
  }, [token]);

  if (!ready || !token) return null;

  return (
    <>
      <TopBar />
      <div className="container">
        <h1>The known world</h1>
        <p className="muted">
          Every <em>colonia</em> in the shared world. Yours is marked in terracotta. Drag to pan.
        </p>
        {error && <div className="error">{error}</div>}
        {data ? (
          <div className="card" style={{ display: "inline-block" }}>
            <PhaserGame kind="map" data={data} />
          </div>
        ) : (
          <p className="muted">Surveying the provinces…</p>
        )}
      </div>
    </>
  );
}
