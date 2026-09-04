import Link from "next/link";
import { Chat } from "@/components/Chat";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Coach",
  description:
    "Tell the coach your goals, schedule, and equipment, and it finds a real program from the library that fits.",
};

export default async function CoachPage() {
  const user = await getCurrentUser();

  // The API route enforces this too — this is just a better first
  // impression than typing a message and getting a 401 back.
  if (!user) {
    return (
      <div className="max-w-md space-y-3 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in to talk to the coach
        </h1>
        <p className="text-sm text-muted">
          The coach chat costs real money per message, so it&apos;s limited
          to signed-in accounts.
        </p>
        <Link
          href="/account"
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return <Chat />;
}
