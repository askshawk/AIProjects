// Thin typed wrapper around the FastAPI backend. Every call goes through
// apiFetch, which sends the httpOnly session cookie and unwraps errors into
// thrown Errors so callers can try/catch. No state and no credential lives
// here: the browser never holds the JWT, so there is nothing for a script to
// read (see lib/auth.tsx).

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type BuildJob = {
  id: number;
  building: string;
  target_level: number;
  completes_at: string; // ISO 8601 with UTC offset
  status: string;
};

export type Upgrade = {
  building: string;
  target_level: number;
  cost: { wood: number; stone: number; silver: number };
  seconds: number;
  population_after: number;
  affordable: boolean;
  pop_ok: boolean;
  maxed: boolean;
};

export type UnitType = {
  unit_type: string;
  label: string;
  cost: { wood: number; stone: number; silver: number };
  population: number;
  seconds: number;
  attack: number;
  defense: number;
  have: number;
  can_recruit: boolean;
  domain: "land" | "sea";  // land units train at the Barracks, ships at the Harbour
  capacity: number;        // transport berths, in population points
};

export type RecruitJob = {
  id: number;
  unit_type: string;
  count: number;
  completes_at: string;
  status: string;
};

export type ResearchOption = {
  tech: string;
  label: string;
  blurb: string;
  academy_level: number;   // Academy level required
  points: number;          // research points it costs
  cost: { wood: number; stone: number; silver: number };
  researched: boolean;
  can_research: boolean;   // requirements met AND affordable right now
  blocked_reason: string | null;
};

export type HeroPost = {
  archetype: string;
  label: string;
  blurb: string;
  forum_level: number;
  cost: { wood: number; stone: number; silver: number };
  name: string | null;      // null when the post is empty
  level: number;
  xp: number;
  next_level_xp: number;    // 0 when maxed
  bonus_pct: number;
  recruited: boolean;
  can_recruit: boolean;
  blocked_reason: string | null;
};

export type City = {
  id: number;
  name: string;
  x: number;
  y: number;
  last_tick_at: string;
  wood: number;
  stone: number;
  silver: number;
  forum_level: number;
  timber_camp_level: number;
  quarry_level: number;
  silver_mine_level: number;
  farm_level: number;
  barracks_level: number;
  harbour_level: number;
  academy_level: number;
  research_points: number;        // unspent points
  research: ResearchOption[];
  heroes: HeroPost[];
  loyalty: number;
  capacity: number;
  population_used: number;
  population_cap: number;
  upgrades: Upgrade[];
  build_jobs: BuildJob[];
  units: UnitType[];
  recruit_jobs: RecruitJob[];
};

export type WorldCity = { x: number; y: number; name: string; owner: string; alliance: string | null };

export type AllianceMember = { user: string; role: string };
export type Alliance = { id: number; name: string; members: AllianceMember[]; mine_role: string | null };
export type AllianceMessage = { id: number; user: string; body: string; created_at: string };

export type UnitStack = Record<string, number>;

export type Movement = {
  id: number;
  kind: "attack" | "return" | "found" | "reinforce";
  payload: UnitStack;
  departs_at: string;
  arrives_at: string;
  mine: boolean;
  incoming_attack: boolean;
  from_name: string;
  to_name: string;
  from_x: number | null; // null if the origin city row is gone
  from_y: number | null;
  to_x: number;
  to_y: number;
};

export type BattleReport = {
  id: number;
  outcome: "attacker_won" | "defender_won";
  i_attacked: boolean;
  attacker_city_name: string;
  defender_city_name: string;
  attacker_sent: UnitStack;
  attacker_survivors: UnitStack;
  defender_before: UnitStack;
  defender_survivors: UnitStack;
  loyalty_before: number;
  loyalty_after: number;
  captured: boolean;
  night_bonus: boolean; // defenders fought under the night bonus
  /** The sea phase of a seaborne assault; null for pure land battles. */
  naval: {
    sea_sent: UnitStack;
    sea_survivors: UnitStack;
    defender_sea_before: UnitStack;
    defender_sea_survivors: UnitStack;
    outcome: "attacker_won" | "defender_won";
  } | null;
  created_at: string;
};

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // credentials: "include" sends the httpOnly session cookie — the app never
  // holds the JWT itself, so there is nothing for a script to steal.
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    credentials: "include",
    headers: { ...headers, ...opts.headers },
  });
  if (!res.ok) {
    // FastAPI puts the message in `detail`; fall back to the status text.
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// --- auth ---
export function register(email: string, password: string, cityName: string) {
  return apiFetch<{ access_token: string }>("/register", {
    method: "POST",
    body: JSON.stringify({ email, password, city_name: cityName }),
  });
}

export function login(email: string, password: string) {
  return apiFetch<{ access_token: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export type Me = { id: number; email: string };

/** Who the session cookie belongs to — the only way the client can tell that
    it is signed in, now that it cannot read the token. */
export function getMe() {
  return apiFetch<Me>("/me", {});
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/logout`, { method: "POST", credentials: "include" });
}

// --- gameplay ---
export type CitySummary = { id: number; name: string; x: number; y: number; forum_level: number; loyalty: number };

export function getMyCities() {
  return apiFetch<CitySummary[]>("/cities", {});
}

export function getCity(cityId: number) {
  return apiFetch<City>(`/cities/${cityId}`, {});
}

export function getMyCity() {
  return apiFetch<City>("/cities/me", {});
}

export function queueBuild(cityId: number, building: string) {
  return apiFetch<City>(`/cities/${cityId}/builds`, {
    method: "POST",
    body: JSON.stringify({ building }),
  });
}

export function recruit(cityId: number, unitType: string, count: number) {
  return apiFetch<City>(`/cities/${cityId}/recruit`, {
    method: "POST",
    body: JSON.stringify({ unit_type: unitType, count }),
  });
}

export function researchTech(cityId: number, tech: string) {
  return apiFetch<City>(`/cities/${cityId}/research`, {
    method: "POST",
    body: JSON.stringify({ tech }),
  });
}

export function appointHero(cityId: number, archetype: string, name?: string) {
  return apiFetch<City>(`/cities/${cityId}/heroes`, {
    method: "POST",
    body: JSON.stringify({ archetype, name: name ?? null }),
  });
}

export function getWorld() {
  return apiFetch<WorldCity[]>("/world/cities", {});
}

// --- movement & combat ---
export function sendArmy(originCityId: number, targetX: number, targetY: number, units: UnitStack) {
  return apiFetch<Movement>("/movements", {
    method: "POST",
    body: JSON.stringify({ origin_city_id: originCityId, target_x: targetX, target_y: targetY, units }),
  });
}

export function getMovements() {
  return apiFetch<Movement[]>("/movements/me", {});
}

/** Movements plus the server's own clock, read from the `Date` response header
    (exposed via CORS). The map animates armies between two server timestamps,
    so a skewed local clock would otherwise show marches arriving early or late.
    Returns serverNowMs = null when the header is unavailable; callers fall back
    to the local clock, which is only ever a cosmetic error. */
export async function getMovementsWithClock(
): Promise<{ movements: Movement[]; serverNowMs: number | null }> {
  const res = await fetch(`${API_URL}/movements/me`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  const dateHeader = res.headers.get("Date");
  const parsed = dateHeader ? Date.parse(dateHeader) : NaN;
  return {
    movements: (await res.json()) as Movement[],
    serverNowMs: Number.isNaN(parsed) ? null : parsed,
  };
}

export function getReports() {
  return apiFetch<BattleReport[]>("/reports/me", {});
}

// --- alliances ---
export function getMyAlliance() {
  return apiFetch<Alliance | null>("/alliances/me", {});
}
export function listAlliances() {
  return apiFetch<Alliance[]>("/alliances", {});
}
export function createAlliance(name: string) {
  return apiFetch<Alliance>("/alliances", { method: "POST", body: JSON.stringify({ name }) });
}
export function joinAlliance(id: number) {
  return apiFetch<Alliance>(`/alliances/${id}/join`, { method: "POST" });
}
export async function leaveAlliance() {
  await apiFetch<unknown>("/alliances/leave", { method: "POST" }).catch(() => {});
}
export function getMessages(id: number) {
  return apiFetch<AllianceMessage[]>(`/alliances/${id}/messages`, {});
}
export function postMessage(id: number, body: string) {
  return apiFetch<AllianceMessage>(`/alliances/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
}
