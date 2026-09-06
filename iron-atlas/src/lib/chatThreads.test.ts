import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db, sql as client } from "@/db";
import { chatMessages, chatThreads, users } from "@/db/schema";
import {
  appendThreadMessages,
  currentThreadId,
  hasThreadHistory,
  loadThreadMessages,
  startNewThread,
  THREAD_REPLAY_LIMIT,
} from "@/lib/chatThreads";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * What matters here is that a conversation survives a page load intact:
 * right order, right roles, and tool-call parts preserved (those are the
 * recommendation cards — losing them turns a recommendation back into
 * unstyled prose).
 */

afterAll(async () => {
  await client.end();
});

async function makeUser() {
  const email = `test-threads-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`;
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "x" })
    .returning({ id: users.id });
  return user.id;
}

const msg = (role: "user" | "assistant", text: string): UIMessage =>
  ({ id: `m-${Math.random()}`, role, parts: [{ type: "text", text }] }) as UIMessage;

describe("chat thread persistence", () => {
  it("round-trips a conversation in order", async () => {
    const userId = await makeUser();
    try {
      const threadId = await currentThreadId(userId);
      await appendThreadMessages(threadId, [
        msg("user", "I train 4 days a week"),
        msg("assistant", "What's your goal?"),
      ]);

      const loaded = await loadThreadMessages(userId);
      expect(loaded.map((m) => m.role)).toEqual(["user", "assistant"]);
      expect(JSON.stringify(loaded[0].parts)).toContain("4 days a week");
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("preserves tool-call parts, not just text", async () => {
    const userId = await makeUser();
    try {
      const threadId = await currentThreadId(userId);
      const withTool = {
        id: "t1",
        role: "assistant",
        parts: [
          { type: "text", text: "Here's a fit:" },
          {
            type: "tool-recommendPrograms",
            state: "output-available",
            output: [{ slug: "531-bbb", title: "5/3/1 BBB" }],
          },
        ],
      } as unknown as UIMessage;

      await appendThreadMessages(threadId, [withTool]);
      const [loaded] = await loadThreadMessages(userId);

      // The recommendation card renders off this part; if it doesn't survive
      // the round trip the reply comes back as bare text after a reload.
      expect(JSON.stringify(loaded.parts)).toContain("tool-recommendPrograms");
      expect(JSON.stringify(loaded.parts)).toContain("531-bbb");
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("reuses one thread across turns rather than making a new one each time", async () => {
    const userId = await makeUser();
    try {
      const first = await currentThreadId(userId);
      const second = await currentThreadId(userId);
      expect(second).toBe(first);

      const rows = await db
        .select({ id: chatThreads.id })
        .from(chatThreads)
        .where(eq(chatThreads.userId, userId));
      expect(rows).toHaveLength(1);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("returns the newest messages when a conversation runs long", async () => {
    const userId = await makeUser();
    try {
      const threadId = await currentThreadId(userId);
      // Comfortably past the replay window.
      const many = Array.from({ length: THREAD_REPLAY_LIMIT + 10 }, (_, i) =>
        msg("user", `message ${i}`),
      );
      for (const m of many) await appendThreadMessages(threadId, [m]);

      const loaded = await loadThreadMessages(userId);
      expect(loaded).toHaveLength(THREAD_REPLAY_LIMIT);
      // The tail, not the head — the recent conversation is the useful part,
      // and the route rejects an over-long thread anyway.
      expect(JSON.stringify(loaded.at(-1)!.parts)).toContain(
        `message ${THREAD_REPLAY_LIMIT + 9}`,
      );
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("starts a clean conversation without destroying the old one", async () => {
    const userId = await makeUser();
    try {
      const oldThread = await currentThreadId(userId);
      await appendThreadMessages(oldThread, [msg("user", "old conversation")]);
      expect(await hasThreadHistory(userId)).toBe(true);

      await startNewThread(userId);

      // The new conversation reads empty...
      expect(await loadThreadMessages(userId)).toHaveLength(0);
      expect(await hasThreadHistory(userId)).toBe(false);
      // ...but the old messages are still on disk, not deleted.
      const kept = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, oldThread));
      expect(kept).toHaveLength(1);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("has nothing to load for a lifter who has never written", async () => {
    const userId = await makeUser();
    try {
      expect(await loadThreadMessages(userId)).toEqual([]);
      expect(await hasThreadHistory(userId)).toBe(false);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
