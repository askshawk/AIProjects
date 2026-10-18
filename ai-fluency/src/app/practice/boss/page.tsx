import type { Metadata } from "next";
import { connection } from "next/server";
import { AiBanner } from "@/components/AiBanner";
import { Nav } from "@/components/Nav";
import { BOSS_WIN_SCORE, bossStatus } from "@/lib/boss";
import { BOSSES } from "@/lib/personas";
import { BossBattles } from "./BossBattles";

export const metadata: Metadata = { title: "Boss battles" };

export default async function BossPage() {
  await connection();
  const units = await bossStatus();
  const bosses = Object.fromEntries(Object.entries(BOSSES).map(([track, b]) => [track, { name: b.name, role: b.role, blurb: b.blurb }]));
  return (
    <>
      <Nav current="/practice" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <AiBanner />
        <BossBattles units={units} bosses={bosses} winScore={BOSS_WIN_SCORE} />
      </main>
    </>
  );
}
