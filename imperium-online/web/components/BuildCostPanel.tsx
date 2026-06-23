"use client";

// The cost/time line shown under each building in the city panel. Reads the
// server-computed Upgrade preview (so the client never re-derives balance) and
// flags any resource the city can't currently afford in red, plus the build
// time and a population-blocked notice.

import type { City, Upgrade } from "@/lib/api";
import { WoodIcon, StoneIcon, SilverIcon } from "@/components/ResourceIcons";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const ICONS = { wood: WoodIcon, stone: StoneIcon, silver: SilverIcon } as const;

export default function BuildCostPanel({ upgrade, city }: { upgrade: Upgrade; city: City }) {
  if (upgrade.maxed) {
    return <div className="cost-line meta">Max level reached</div>;
  }

  return (
    <div className="cost-line">
      {(["wood", "stone", "silver"] as const).map((res) => {
        const Icon = ICONS[res];
        const amount = upgrade.cost[res];
        const short = city[res] < amount;
        return (
          <span className={`ci${short ? " short" : ""}`} key={res} title={res}>
            <Icon /> {Math.round(amount)}
          </span>
        );
      })}
      <span className="meta">· {formatTime(upgrade.seconds)}</span>
      {!upgrade.pop_ok && <span className="blocked">· needs population</span>}
    </div>
  );
}
