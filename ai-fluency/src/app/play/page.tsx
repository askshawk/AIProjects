import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { DEAL_DESK, DEAL_WIN_HEALTH, JARGON_SECONDS } from "@/lib/games";
import { getBests } from "@/lib/gameStats";

export const metadata: Metadata = { title: "Play" };

export default async function PlayPage() {
  await connection();
  const bests = await getBests();

  return (
    <>
      <Nav current="/play" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Play</h1>
        <p className="text-sm text-muted">
          Every answer counts toward your study schedule: miss a card and it comes back sooner.
        </p>

        <Link href="/play/jargon" className="block rounded-2xl border bg-surface p-5 hover:bg-surface-raised">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Jargon Buster</h2>
            <span className="text-sm text-muted">Best {bests.get("jargon") ?? "none yet"}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            A customer sentence full of buzzwords. Match each one to its plain-English meaning. {JARGON_SECONDS} seconds,
            combos for streaks.
          </p>
        </Link>

        <Link href="/play/myth" className="block rounded-2xl border bg-surface p-5 hover:bg-surface-raised">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Myth or Fact</h2>
            <span className="text-sm text-muted">Best {bests.has("myth") ? `${bests.get("myth")}/10` : "none yet"}</span>
          </div>
          <p className="mt-1 text-sm text-muted">Ten statements customers believe about AI. Call each one a myth or a fact.</p>
        </Link>

        <section className="rounded-2xl border bg-surface p-5">
          <h2 className="text-lg font-semibold">Deal Desk</h2>
          <p className="mt-1 text-sm text-muted">
            Short customer calls. Pick the best answer to each question; strong answers raise deal health. Finish at{" "}
            {DEAL_WIN_HEALTH} or above to close.
          </p>
          <ul className="mt-3 divide-y">
            {DEAL_DESK.map((call) => {
              const best = bests.get(`deal-desk:${call.id}`);
              return (
                <li key={call.id}>
                  <Link href={`/play/deal-desk/${call.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-accent">
                    <span>
                      <span className="font-medium">{call.title}</span>
                      <span className="block text-sm text-muted">
                        {call.buyer.name}, {call.buyer.role}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">
                      {best === undefined ? "Not played" : best >= DEAL_WIN_HEALTH ? `Closed (${best})` : `Best ${best}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/practice/live" className="mt-2 inline-block text-sm text-accent underline-offset-4 hover:underline">
            Want an unscripted buyer? Try a live call &rarr;
          </Link>
        </section>
      </main>
    </>
  );
}
