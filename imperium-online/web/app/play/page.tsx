"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { getMyCity, queueBuild, type City } from "@/lib/api";
import BuildQueue from "@/components/BuildQueue";
import TopBar from "@/components/TopBar";

// Phaser must not run during SSR — load the bridge client-only.
const PhaserGame = dynamic(() => import("@/components/PhaserGame"), { ssr: false });

const BUILDINGS: { key: keyof City; building: string; label: string }[] = [
  { key: "forum_level", building: "forum", label: "Forum" },
  { key: "timber_camp_level", building: "timber_camp", label: "Timber Camp" },
  { key: "quarry_level", building: "quarry", label: "Quarry" },
  { key: "silver_mine_level", building: "silver_mine", label: "Silver Mine" },
];

export default function PlayPage() {
  const { token, ready, logout } = useAuth();
  const router = useRouter();
  const [city, setCity] = useState<City | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if we're sure there's no token.
  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setCity(await getMyCity(token));
    } catch (err) {
      // A dead/expired token → bounce to login.
      if (err instanceof Error && /credential/i.test(err.message)) {
        logout();
        router.replace("/login");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load city");
      }
    }
  }, [token, logout, router]);

  // Initial load + a slow safety-net poll so resources stay fresh even with no
  // build finishing (the authoritative numbers come from the server each time).
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
          <p className="muted">Loading your city…</p>
        ) : (
          <>
            <h1 style={{ marginBottom: 4 }}>{city.name}</h1>
            <p className="muted" style={{ marginTop: 0 }}>
              Founded at grid ({city.x}, {city.y}) · warehouse cap {Math.round(city.capacity)} each
            </p>

            <ul className="resources">
              <li><div className="amount">{Math.floor(city.wood)}</div><div className="label">Wood</div></li>
              <li><div className="amount">{Math.floor(city.stone)}</div><div className="label">Stone</div></li>
              <li><div className="amount">{Math.floor(city.silver)}</div><div className="label">Silver</div></li>
            </ul>

            <div className="grid-2" style={{ marginTop: 24 }}>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>City view</h3>
                <PhaserGame kind="city" data={city} />
              </div>

              <div className="card">
                <h3 style={{ marginTop: 0 }}>Buildings</h3>
                {BUILDINGS.map((b) => (
                  <div className="building-row" key={b.building}>
                    <span>
                      <strong>{b.label}</strong>{" "}
                      <span className="muted">level {city[b.key] as number}</span>
                    </span>
                    <button className="btn" onClick={() => build(b.building)}>
                      Upgrade
                    </button>
                  </div>
                ))}

                <h3>Build queue</h3>
                <BuildQueue jobs={city.build_jobs} onComplete={refresh} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
