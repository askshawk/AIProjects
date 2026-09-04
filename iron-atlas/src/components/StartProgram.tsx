import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { activeProgram, forkProgram } from "@/lib/fork";
import { readGymProfile } from "@/lib/gymProfile";

/**
 * Forks the library program into the signed-in user's account. Rendered as a
 * server component so the whole flow is one POST with no client state.
 */
export async function StartProgram({ slug }: { slug: string }) {
  const user = await getCurrentUser();

  async function start() {
    "use server";
    const current = await getCurrentUser();
    if (!current) redirect("/account");

    const gym = await readGymProfile();
    let forkId: number | null;
    try {
      forkId = await forkProgram(current.id, slug, gym);
    } catch (err) {
      console.error("forkProgram failed:", err);
      redirect(`/programs/${slug}?forkError=1`);
    }
    if (!forkId) redirect(`/programs/${slug}`);

    revalidatePath("/train");
    revalidatePath("/account");
    redirect("/train");
  }

  if (!user) {
    return (
      <Link
        href="/account"
        className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:border-accent/60"
      >
        Sign in
      </Link>
    );
  }

  const active = await activeProgram(user.id);

  return (
    <form action={start}>
      <button
        type="submit"
        className="rounded-md border border-accent/60 px-4 py-2 text-sm font-medium transition-colors hover:bg-accent-soft/20"
      >
        {active ? "Start this instead" : "Start this program"}
      </button>
    </form>
  );
}
