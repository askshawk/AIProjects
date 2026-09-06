import { desc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/db";
import { chatMessages, chatThreads } from "@/db/schema";

/**
 * Persistence for the coach conversation.
 *
 * The `chat_threads` / `chat_messages` tables existed from the start but were
 * never wired to anything, so a conversation lived only in React state — tap
 * a program link mid-conversation and the whole thing was gone, including
 * whatever the coach had worked out about your training.
 *
 * One live thread per lifter rather than a thread list: this is a coaching
 * conversation, not a chat app, and "the conversation" is a more useful
 * concept here than "conversation #4". `startNewThread` is how you get a
 * clean slate.
 */

/**
 * How many past messages are replayed into a new page load.
 *
 * The client re-sends the visible history with every request, and the route
 * caps an incoming thread at MAX_MESSAGES — so this has to stay comfortably
 * under that or a long-running conversation would start getting rejected. It
 * also bounds the input tokens each turn costs.
 */
export const THREAD_REPLAY_LIMIT = 20;

/**
 * The caller's current thread, or null if they've never sent a message.
 *
 * Exported because the coach page keys the chat component on it: `useChat`
 * seeds its message list once, on mount, so after "start a new conversation"
 * the server would hand down an empty list and React would keep rendering the
 * old one. A changing key forces the remount that actually clears it.
 */
export async function latestThreadId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(eq(chatThreads.userId, userId))
    .orderBy(desc(chatThreads.createdAt), desc(chatThreads.id))
    .limit(1);
  return row?.id ?? null;
}

/** The caller's current thread, creating one if they don't have it yet. */
export async function currentThreadId(userId: number): Promise<number> {
  const existing = await latestThreadId(userId);
  if (existing !== null) return existing;

  const [created] = await db
    .insert(chatThreads)
    .values({ userId })
    .returning({ id: chatThreads.id });
  return created.id;
}

/**
 * The tail of the caller's conversation, oldest first, ready to hand to
 * `useChat`. Parts are stored verbatim, so tool calls — the recommendation
 * cards — come back rendered rather than as bare text.
 */
export async function loadThreadMessages(
  userId: number,
  limit = THREAD_REPLAY_LIMIT,
): Promise<UIMessage[]> {
  const threadId = await latestThreadId(userId);
  if (threadId === null) return [];

  // Newest-first with a limit, then reversed — taking the *tail* of a long
  // conversation rather than its beginning.
  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      parts: chatMessages.parts,
    })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);

  return rows
    .reverse()
    .map((row) => {
      let parts: unknown;
      try {
        parts = JSON.parse(row.parts);
      } catch {
        // A row we can't parse shouldn't take the whole page down with it.
        return null;
      }
      if (!Array.isArray(parts)) return null;
      return {
        id: String(row.id),
        role: row.role as UIMessage["role"],
        parts,
      } as UIMessage;
    })
    .filter((m): m is UIMessage => m !== null);
}

/**
 * Appends the messages a turn produced.
 *
 * Append-only rather than rewriting the thread: the client re-sends history
 * it already has, so saving the whole list every turn would duplicate every
 * earlier message, and rewriting would drop anything trimmed off the replay
 * window.
 */
export async function appendThreadMessages(
  threadId: number,
  messages: UIMessage[],
): Promise<void> {
  const rows = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      threadId,
      role: m.role,
      parts: JSON.stringify(m.parts ?? []),
    }));
  if (rows.length === 0) return;
  await db.insert(chatMessages).values(rows);
}

/**
 * Starts a fresh conversation. The old thread is kept rather than deleted —
 * it costs nothing and throwing away someone's coaching history on a misclick
 * is not a recoverable mistake.
 */
export async function startNewThread(userId: number): Promise<void> {
  await db.insert(chatThreads).values({ userId });
}

/** Whether the caller has anything worth offering a "start over" for. */
export async function hasThreadHistory(userId: number): Promise<boolean> {
  const threadId = await latestThreadId(userId);
  if (threadId === null) return false;
  const [row] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .limit(1);
  return row !== undefined;
}
