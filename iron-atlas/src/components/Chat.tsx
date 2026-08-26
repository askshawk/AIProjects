"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import type { Recommendation } from "@/lib/recommend";
import { ProgramRecommendation } from "@/components/ProgramRecommendation";

const OPENERS = [
  "I want to get bigger arms and I train 4 days a week",
  "Intermediate lifter, 3 days a week, want to get stronger",
  "My gym only has dumbbells and a bench",
];

/**
 * The model reaches for **bold** on program names even when told to keep
 * formatting plain. Rendering just that one case beats either shipping literal
 * asterisks or pulling in a full markdown pipeline for text that the system
 * prompt already constrains to plain paragraphs.
 */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
        chunk.startsWith("**") && chunk.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {chunk.slice(2, -2)}
          </strong>
        ) : (
          chunk
        ),
      )}
    </>
  );
}

export function Chat() {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="space-y-4 py-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                What are you training for?
              </h1>
              <p className="mt-1 text-sm text-muted">
                Tell me your goals, how often you train, and what your gym has.
                I&apos;ll find a program from the library that fits and hand you
                the spreadsheet.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {OPENERS.map((opener) => (
                <button
                  key={opener}
                  onClick={() => send(opener)}
                  className="rounded-full border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent/60 hover:text-foreground"
                >
                  {opener}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <div
                    key={i}
                    className={
                      message.role === "user"
                        ? "ml-auto w-fit max-w-[85%] rounded-lg bg-surface-raised px-4 py-2.5 text-sm"
                        : "max-w-[90%] whitespace-pre-wrap text-sm leading-relaxed"
                    }
                  >
                    <Formatted text={part.text} />
                  </div>
                );
              }

              // The recommendation cards are rendered from the tool's real
              // output, not from the model's description of it.
              if (
                isToolUIPart(part) &&
                part.type === "tool-recommendPrograms"
              ) {
                if (part.state === "output-available") {
                  return (
                    <ProgramRecommendation
                      key={i}
                      recommendations={part.output as Recommendation[]}
                    />
                  );
                }
                return (
                  <p key={i} className="text-sm text-muted">
                    Searching the library…
                  </p>
                );
              }

              return null;
            })}
          </div>
        ))}

        {busy && messages.at(-1)?.role === "user" && (
          <p className="text-sm text-muted">Thinking…</p>
        )}

        {error && (
          <p className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-300">
            Something went wrong: {error.message}
          </p>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t bg-background pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell me about your training…"
          className="flex-1 rounded-md border bg-surface px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
