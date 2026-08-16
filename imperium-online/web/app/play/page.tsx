"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { useCities } from "@/lib/cityStore";
import { appointHero, getCity, getMyCity, queueBuild, recruit as recruitApi, researchTech, type City } from "@/lib/api";
import { realtime } from "@/lib/realtime";
import BuildQueue from "@/components/BuildQueue";
import BuildCostPanel from "@/components/BuildCostPanel";
import BarracksPanel from "@/components/BarracksPanel";
import HarbourPanel from "@/components/HarbourPanel";
import AcademyPanel from "@/components/AcademyPanel";
import HeroesPanel from "@/components/HeroesPanel";
import MovementsPanel from "@/components/MovementsPanel";
import OrnateHeader from "@/components/OrnateHeader";
import TopBar from "@/components/TopBar";
import StatNumber from "@/components/StatNumber";
import WelcomeScroll from "@/components/WelcomeScroll";
import { RESOURCE_ICONS, PopulationIcon } from "@/components/ResourceIcons";

// Phaser must not run during SSR — load the bridge client-only.
const PhaserGame = dynamic(() => import("@/components/PhaserGame"), { ssr: false });

const BUILDINGS: { key: keyof City; building: string; label: string }[] = [
  { key: "forum_level", building: "forum", label: "Forum" },
  { key: "timber_camp_level", building: "timber_camp", label: "Timber Camp" },
  { key: "quarry_level", building: "quarry", label: "Quarry" },
  { key: "silver_mine_level", building: "silver_mine", label: "Silver Mine" },
  { key: "farm_level", building: "farm", label: "Farm" },
  { key: "barracks_level", building: "barracks", label: "Barracks" },
  { key: "harbour_level", building: "harbour", label: "Harbour" },
  { key: "academy_level", building: "academy", label: "Academy" },
];

const RESOURCES: { key: "wood" | "stone" | "silver"; label: string }[] = [
  { key: "wood", label: "Wood" },
  { key: "stone", label: "Stone" },
  { key: "silver", label: "Silver" },
];

export default function PlayPage() {
  const { authed, ready, logout } = useAuth();
  const { activeId, reload: reloadCities } = useCities();
  const router = useRouter();
  const [city, setCity] = useState<City | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Buildings that just rose a level — flash them gold once (game feel).
  const [leveled, setLeveled] = useState<Set<string>>(new Set());
  const prevLevels = useRef<Record<string, number>>({});

  useEffect(() => {
    if (ready && !authed) router.replace("/login");
  }, [ready, authed, router]);

  // Detect level-ups between refreshes and flash those rows. Keyed by city so
  // switching cities re-baselines instead of flashing the whole board.
  useEffect(() => {
    if (!city) return;
    const key = (b: string) => `${city.id}:${b}`;
    const rose: string[] = [];
    for (const b of BUILDINGS) {
      const now = city[b.key] as number;
      const before = prevLevels.current[key(b.building)];
      if (before !== undefined && now > before) rose.push(b.building);
      prevLevels.current[key(b.building)] = now;
    }
    if (rose.length === 0) return;
    setLeveled(new Set(rose));
    const timer = setTimeout(() => setLeveled(new Set()), 1200);
    return () => clearTimeout(timer);
  }, [city]);

  // Load the active city (or the primary one until the switcher resolves).
  const refresh = useCallback(async () => {
    if (!authed) return;
    try {
      setCity(activeId != null ? await getCity(activeId) : await getMyCity());
    } catch (err) {
      if (err instanceof Error && /credential/i.test(err.message)) {
        logout();
        router.replace("/login");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load city");
      }
    }
  }, [authed, activeId, logout, router]);

  // Refetch whenever the active city changes (switcher) or a realtime event
  // lands. founded/captured also refresh the switcher list itself. The 10s
  // safety-net poll is gone; refresh-on-countdown-zero stays as a fallback.
  useEffect(() => {
    if (!authed) return;
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
  }, [authed, refresh, reloadCities]);

  async function build(building: string) {
    if (!authed || !city) return;
    try {
      setError(null);
      setCity(await queueBuild(city.id, building));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Build failed");
    }
  }

  async function recruit(unitType: string, count: number) {
    if (!authed || !city) return;
    try {
      setError(null);
      setCity(await recruitApi(city.id, unitType, count));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recruit failed");
    }
  }

  async function doResearch(tech: string) {
    if (!authed || !city) return;
    try {
      setError(null);
      setCity(await researchTech(city.id, tech));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
    }
  }

  async function doAppoint(archetype: string) {
    if (!authed || !city) return;
    try {
      setError(null);
      setCity(await appointHero(city.id, archetype));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Appointment failed");
    }
  }

  // Look up the server-computed next-upgrade preview for a building.
  const upgradeFor = (building: string) => city?.upgrades.find((u) => u.building === building);

  if (!ready || !authed) return null;

  return (
    <>
      <TopBar />
      <div className="container">
        {error && <div className="error">{error}</div>}
        {!city ? (
          <p className="muted">Surveying your city…</p>
        ) : (
          <>
            <WelcomeScroll cityName={city.name} />
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
                    <StatNumber value={amount} className="amount" />
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
                  <span><PopulationIcon className="pop-icon" />Population</span>
                  <div className={`track${city.population_used >= city.population_cap ? " full" : ""}`}>
                    <span style={{ width: `${Math.min(100, (city.population_used / city.population_cap) * 100)}%` }} />
                  </div>
                  <span className="count">{city.population_used} / {city.population_cap}</span>
                </div>

                <div className="population loyalty">
                  <span title="Loyalty falls under settler-led assault; at 0 the city is captured.">Loyalty</span>
                  <div className={`track${city.loyalty <= 25 ? " full" : ""}`}>
                    <span style={{ width: `${city.loyalty}%` }} />
                  </div>
                  <span className="count">{city.loyalty} / 100</span>
                </div>

                {BUILDINGS.map((b) => {
                  const up = upgradeFor(b.building);
                  const blocked = !up || up.maxed || !up.affordable || !up.pop_ok;
                  return (
                    <div className={`building-row${leveled.has(b.building) ? " leveled" : ""}`} key={b.building}>
                      <div className="thumb">
                        {/* The Harbour has no painted sprite yet — fall back to
                            the Forum so the row still reads. */}
                        <img
                          src={`/assets/iso/${b.building}.png`}
                          alt=""
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.dataset.fallback) {
                              img.dataset.fallback = "1";
                              img.src = "/assets/iso/forum.png";
                            }
                          }}
                        />
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
              <HarbourPanel city={city} onRecruit={recruit} />
            </div>

            <div className="grid-2" style={{ marginTop: 22 }}>
              <AcademyPanel city={city} onResearch={doResearch} />
              <HeroesPanel city={city} onAppoint={doAppoint} />
            </div>

            <div className="grid-2" style={{ marginTop: 22 }}>
              <MovementsPanel />
            </div>
          </>
        )}
      </div>
    </>
  );
}
