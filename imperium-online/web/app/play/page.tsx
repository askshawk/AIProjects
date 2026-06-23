"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { getMyCity, queueBuild, type City } from "@/lib/api";
import BuildQueue from "@/components/BuildQueue";
import TopBar from "@/components/TopBar";
import { RESOURCE_ICONS } from "@/components/ResourceIcons";

// Phaser must not run during SSR — load the bridge client-only.
const PhaserGame = dynamic(() => import("@/components/PhaserGame"), { ssr: false });

const BUILDINGS: { key: keyof City; building: string; label: string }[] = [
  { key: "forum_level", building: "forum", label: "Forum" },
  { key: "timber_camp_level", building: "timber_camp", label: "Timber Camp" },
  { key: "quarry_level", building: "quarry", label: "Quarry" },
  { key: "silver_mine_level", building: "silver_mine", label: "Silver Mine" },
];

const RESOURCES: { key: "wood" | "stone" | "silver"; label: string }[] = [
  { key: "wood", label: "Wood" },
  { key: "stone", label: "Stone" },
  { key: "silver", label: "Silver" },
];

export default function PlayPage() {
  const { token, ready, logout } = useAuth();
  const router = useRouter();
  const [city, setCity] = useState<City | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setCity(await getMyCity(token));
    } catch (err) {
      if (err instanceof Error && /credential/i.test(err.message)) {
        logout();
        router.replace("/login");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load city");
      }
    }
  }, [token, logout, router]);

  useEffect(() => {
    if (!token) return;
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [token, refresh]);

  async function build(building: string) {
    if (!token || !city) return;
    try {
      setCity(await queueBuild(token, city.id, building));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Build failed");
    }
  }

  if (!ready || !token) return null;

  return (
    <>
      <TopBar />
      <div className="container">
        {error && <div className="error">{error}</div>}
        {!city ? (
          <p className="muted">Surveying your city…</p>
        ) : (
          <>
            <h1 style={{ marginBottom: 4 }}>{city.name}</h1>
            <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
              Founded at grid ({city.x}, {city.y}) · warehouse cap {Math.round(city.capacity)} per resource
            </p>

            <ul className="resources">
              {RESOURCES.map((r) => {
                const Icon = RESOURCE_ICONS[r.key];
                const amount = Math.floor(city[r.key]);
                const pct = Math.min(100, (amount / city.capacity) * 100);
                return (
                  <li className="resource" key={r.key}>
                    <span className="icon"><Icon /></span>
                    <span className="amount">{amount.toLocaleString()}</span>
                    <span className="label">{r.label}</span>
                    <div className="bar"><span style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>

            <div className="grid-2">
              <div className="card">
                <h3>City view</h3>
                <PhaserGame kind="city" data={city} />
              </div>

              <div className="card">
                <h3>Buildings</h3>
                {BUILDINGS.map((b) => (
                  <div className="building-row" key={b.building}>
                    <div className="thumb">
                      <img src={`/assets/medieval/${b.building}.png`} alt="" />
                    </div>
                    <div>
                      <span className="name">{b.label}</span>
                      <span className="lvl">level {city[b.key] as number}</span>
                    </div>
                    <button className="btn" onClick={() => build(b.building)}>Upgrade</button>
                  </div>
                ))}

                <h3 style={{ marginTop: 24 }}>Build queue</h3>
                <BuildQueue jobs={city.build_jobs} onComplete={refresh} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
