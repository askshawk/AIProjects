import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { DEAL_DESK } from "@/lib/games";
import { DealDeskCall } from "./DealDeskCall";

export async function generateMetadata({ params }: PageProps<"/play/deal-desk/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: DEAL_DESK.find((c) => c.id === id)?.title ?? "Deal Desk" };
}

export default async function DealDeskPage({ params }: PageProps<"/play/deal-desk/[id]">) {
  const { id } = await params;
  const call = DEAL_DESK.find((c) => c.id === id);
  if (!call) notFound();
  return (
    <>
      <Nav current="/play" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <DealDeskCall call={call} />
      </main>
    </>
  );
}
