"use client";

// The visible toast stack + the bridge from realtime events to toasts.
//
// Mounted once (in the root layout). Two jobs:
//  1. Render the current toast queue as painted parchment cards, top-right,
//     newest on top, each with a draining progress bar and click-to-dismiss.
//  2. Subscribe to the realtime WebSocket and turn server events into toasts —
//     this is what makes battles/builds/captures *feel* like they happen. The
//     pages still refetch on the same events; toasts are the narration on top.

import { useEffect } from "react";
import { realtime, type ServerEvent } from "@/lib/realtime";
import { useToast, type Toast } from "@/lib/toast";

const BUILDING_LABELS: Record<string, string> = {
  forum: "Forum",
  timber_camp: "Timber Camp",
  quarry: "Quarry",
  silver_mine: "Silver Mine",
  farm: "Farm",
  barracks: "Barracks",
};

const UNIT_LABELS: Record<string, string> = {
  legionary: "Legionaries",
  archer: "Archers",
  scout: "Scouts",
  settler: "Settlers",
};

// Map a server event to a toast (or null to stay silent, e.g. keepalive).
function toastFor(evt: ServerEvent): Omit<Toast, "id" | "ttl"> | null {
  switch (evt.type) {
    case "attack_resolved": {
      const iWon =
        (evt.role === "attacker" && evt.outcome === "attacker_won") ||
        (evt.role === "defender" && evt.outcome === "defender_won");
      if (evt.role === "attacker") {
        return iWon
          ? { variant: "victory", icon: "⚔️", title: "Victory!", body: "Your legion carried the field. See the report for spoils." }
          : { variant: "defeat", icon: "💀", title: "Your attack was repulsed", body: "The enemy held. Check the battle report." };
      }
      return iWon
        ? { variant: "victory", icon: "🛡️", title: "Your city held!", body: "The walls turned back the assault." }
        : { variant: "defeat", icon: "🔥", title: "Your city was raided", body: "Losses were taken. Check the battle report." };
    }
    case "build_done":
      return {
        variant: "gold",
        icon: "🏛️",
        title: `${BUILDING_LABELS[evt.building] ?? evt.building} complete`,
        body: `Now level ${evt.target_level}.`,
      };
    case "recruit_done":
      return {
        variant: "gold",
        icon: "🎖️",
        title: "Training complete",
        body: `${evt.count} ${UNIT_LABELS[evt.unit_type] ?? evt.unit_type} joined your ranks.`,
      };
    case "army_returned":
      return { variant: "info", icon: "🐎", title: "Your army has returned", body: "Troops are home and ready." };
    case "city_founded":
      return { variant: "gold", icon: "🌱", title: "A new city rises", body: "Your settlers founded a colony." };
    case "city_captured":
      return evt.role === "captor"
        ? { variant: "victory", icon: "👑", title: "City captured!", body: "A new city flies your standard." }
        : { variant: "defeat", icon: "🏳️", title: "A city was lost", body: "Its loyalty broke and it fell to the enemy." };
    default:
      return null; // queued / ping / alliance_message — no toast
  }
}

export default function Toaster() {
  const { toasts, push, dismiss } = useToast();

  useEffect(() => {
    const unsubscribe = realtime.subscribe((evt) => {
      const t = toastFor(evt);
      if (t) push(t);
    });
    return unsubscribe;
  }, [push]);

  if (toasts.length === 0) return null;

  return (
    <div className="toaster" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast-${t.variant}`}
          onClick={() => dismiss(t.id)}
          title="Dismiss"
        >
          <span className="toast-seal" aria-hidden>{t.icon}</span>
          <span className="toast-text">
            <span className="toast-title">{t.title}</span>
            {t.body && <span className="toast-body">{t.body}</span>}
          </span>
          <span className="toast-timer" style={{ animationDuration: `${t.ttl}ms` }} />
        </button>
      ))}
    </div>
  );
}
