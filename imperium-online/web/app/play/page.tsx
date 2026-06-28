"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { useCities } from "@/lib/cityStore";
import { getCity, getMyCity, queueBuild, recruit as recruitApi, type City } from "@/lib/api";
import { realtime } from "@/lib/realtime";
import BuildQueue from "@/components/BuildQueue";
import BuildCostPanel from "@/components/BuildCostPanel";
import BarracksPanel from "@/components/BarracksPanel";
import MovementsPanel from "@/components/MovementsPanel";
import OrnateHeader from "@/components/OrnateHeader";
import TopBar from "@/components/TopBar";
import { RESOURCE_ICONS } from "@/components/ResourceIcons";

// Phaser must not run during SSR — load the bridge client-only.
const PhaserGame = dynamic(() => import("@/components/PhaserGame"), { ssr: false });

const BUILDINGS: { key: keyof City; building: string; label: string }[] = [
  { key: "forum_level", building: "forum", label: "Forum" },
  { key: "timber_camp_level", building: "timber_camp", label: "Timber Camp" },
  { key: "quarry_level", building: "quarry", label: "Quarry" },
  { key: "silver_mine_level", building: "silver_mine", label: "Silver Mine" },
  { key: "farm_level", building: "farm", label: "Farm" },
  { key: "barracks_level", building: "barracks", label: "Barracks" },
];

const RESOURCES: { key: "wood" | "stone" | "silver"; label: string }[] = [
  { key: "wood", label: "Wood" },
  { key: "stone", label: "Stone" },
  { key: "silver", label: "Silver" },
];

export default function PlayPage() {
  const { token, ready, logout } = useAuth();
  const { activeId, reload: reloadCities } = useCities();
  const router = useRouter();
  const [city, setCity] = useState<City | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  // Load the active city (or the primary one until the switcher resolves).
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setCity(activeId != null ? await getCity(token, activeId) : await getMyCity(token));
    } catch (err) {
      if (err instanceof Error && /credential/i.test(err.message)) {
        logout();
        router.replace("/login");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load city");
      }
    }
  }, [token, activeId, logout, router]);

  // Refetch whenever the active city changes (switcher) or a realtime event
  // lands. founded/captured also refresh the switcher list itself. The 10s
  // safety-net poll is gone; refresh-on-countdown-zero stays as a fallback.
  useEffect(() => {
    if (!token) return;
    refresh();
    const unsubscribe = realtime.subscribe((evt) => {
      switch (evt.type) {
        case "build_done":
        case "recruit_done":
        case "attack_resolved":
        case "army_returned":
        case "queued":
          refresh();
          break;
        case "city_founded":
        case "city_captured":
          reloadCities();
          refresh();
          break;
      }
    });
    return unsubscribe;
  }, [token, refresh, reloadCities]);

  async function build(building: string) {
    if (!token || !city) return;
    try {
      setError(null);
      setCity(await queueBuild(token, city.id, building));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Build failed");
    }
  }

  async function recruit(unitType: string, count: number) {
    if (!token || !city) return;
    try {
      setError(null);
      setCity(await recruitApi(token, city.id, unitType, count));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recruit failed");
    }
  }

  // Look up the server-computed next-upgrade preview for a building.
  const upgradeFor = (building: string) => city?.upgrades.find((u) => u.building === building);

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
            <OrnateHeader
              title={city.name}
              subtitle={`Founded at grid (${city.x}, ${city.y}) · warehouse cap ${Math.round(city.capacity)} per resource`}
            />

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

                <div className="population">
                  <span>Population</span>
                  <div className={`track${city.population_used >= city.population_cap ? " full" : ""}`}>
                    <span style={{ width: `${Math.min(100, (city.population_used / city.population_cap) * 100)}%` }} />
                  </div>
                  <span className="count">{city.population_used} / {city.population_cap}</span>
                </div>

                {BUILDINGS.map((b) => {
                  const up = upgradeFor(b.building);
                  const blocked = !up || up.maxed || !up.affordable || !up.pop_ok;
                  return (
                    <div className="building-row" key={b.building}>
                      <div className="thumb">
                        <img src={`/assets/iso/${b.building}.svg`} alt="" />
                      </div>
                      <div>
                        <span className="name">{b.label}</span>
                        <span className="lvl">
                          {(city[b.key] as number) === 0 ? "not built" : `level ${city[b.key] as number}`}
                        </span>
                        {up && <BuildCostPanel upgrade={up} city={city} />}
                      </div>
                      <button className="btn" onClick={() => build(b.building)} disabled={blocked}>
                        {(city[b.key] as number) === 0 ? "Build" : "Upgrade"}
                      </button>
                    </div>
                  );
                })}

                <h3 style={{ marginTop: 24 }}>Build queue</h3>
                <BuildQueue jobs={city.build_jobs} onComplete={refresh} />
              </div>
            </div>

            <div className="grid-2" style={{ marginTop: 22 }}>
              <BarracksPanel city={city} onRecruit={recruit} onQueueComplete={refresh} />
              <MovementsPanel token={token} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
