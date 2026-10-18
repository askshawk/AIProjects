"use client";

import { useState } from "react";
import { CallRoom } from "@/components/CallRoom";

type PersonaCard = { id: string; name: string; role: string; blurb: string };

export function LiveCalls({ personas, topics }: { personas: PersonaCard[]; topics: string[] }) {
  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [topic, setTopic] = useState("");
  const [inCall, setInCall] = useState(false);
  const [callKey, setCallKey] = useState(0);

  if (persona && inCall) {
    return (
      <CallRoom
        key={callKey}
        setup={{ mode: "live", personaId: persona.id, topic: topic || undefined }}
        buyer={persona}
        onExit={() => setInCall(false)}
      />
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Live calls</h1>
      <p className="mt-1 text-sm text-muted">
        Pick a buyer. They&apos;ll open the call; answer like you would for real. Honest and specific beats confident and
        vague.
      </p>
      <div className="mt-4 space-y-2" role="radiogroup" aria-label="Buyer">
        {personas.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={persona?.id === p.id}
            onClick={() => setPersona(p)}
            className={`block w-full rounded-2xl border p-4 text-left ${persona?.id === p.id ? "border-accent bg-accent-soft" : "bg-surface"}`}
          >
            <span className="font-medium">
              {p.name}, {p.role}
            </span>
            <span className="mt-0.5 block text-sm text-muted">{p.blurb}</span>
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-medium" htmlFor="topic">
        Focus (optional)
      </label>
      <select
        id="topic"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className="mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-base"
      >
        <option value="">Whatever this buyer cares about</option>
        {topics.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          setCallKey((k) => k + 1);
          setInCall(true);
        }}
        disabled={!persona}
        className="mt-5 w-full rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        Start the call
      </button>
    </div>
  );
}
