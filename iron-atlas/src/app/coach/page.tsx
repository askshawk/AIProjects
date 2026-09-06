import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Chat } from "@/components/Chat";
import { getCurrentUser } from "@/lib/auth";
import {
  hasThreadHistory,
  latestThreadId,
  loadThreadMessages,
  startNewThread,
} from "@/lib/chatThreads";

// The conversation is per-user and loaded per request, so this can't be
// cached across visitors or frozen at build.
export const dynamic = "force-dynamic";

async function newConversation() {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/account");
  await startNewThread(user.id);
  revalidatePath("/coach");
  redirect("/coach");
}

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

  const [messages, hasHistory, threadId] = await Promise.all([
    loadThreadMessages(user.id),
    hasThreadHistory(user.id),
    latestThreadId(user.id),
  ]);

  return (
    <div className="space-y-2">
      {hasHistory && (
        <form action={newConversation} className="flex justify-end">
          <button
            type="submit"
            className="rounded-md border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/60 hover:text-foreground"
          >
            Start a new conversation
          </button>
        </form>
      )}
      {/* Keyed on the thread so starting a new conversation genuinely
          remounts the chat — useChat seeds its messages on mount only, so
          without this the old conversation stays on screen after the reset. */}
      <Chat key={threadId ?? "new"} initialMessages={messages} />
    </div>
  );
}
