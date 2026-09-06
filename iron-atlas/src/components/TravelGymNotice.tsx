import Link from "next/link";
import { readActiveGym } from "@/lib/gymProfile";

/**
 * Says out loud that a temporary gym is in effect.
 *
 * The override changes what every program prescribes, so it must never be
 * something a lifter can have on without knowing. The whole reason it's a
 * separate, expiring cookie rather than an edit to the saved profile is to
 * avoid a silent, sticky change — a banner is the other half of that.
 */
export async function TravelGymNotice() {
  const gym = await readActiveGym();
  if (!gym.isTravel) return null;

  return (
    <p className="rounded-lg border border-accent/50 bg-accent-soft/10 p-3 text-xs text-muted">
      <span className="text-foreground">Using a temporary gym.</span> Programs
      are adapted to the equipment you set for training away, not your usual
      gym.{" "}
      <Link href="/gym" className="text-accent underline underline-offset-2">
        Switch back
      </Link>
      .
    </p>
  );
}
