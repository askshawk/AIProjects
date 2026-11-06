"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { discardAction, finishAction, startAction } from "@/app/actions";
import { CATEGORIES, CATEGORY_INFO, formatMinutes, type Category } from "@/lib/categories";
import { suggestedMinutes } from "@/lib/stats";

export type ActiveSession = { id: number; category: Category; plannedMinutes: number | null; startedAt: string };

const LENGTHS = [25, 60, 90, 120];

/** "1:05:09" or "25:00". */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/*
 * iOS only lets a page make sound after a tap, so the audio context is created
 * when you press Start and reused for the alarm. If the app was closed and
 * reopened in between, there's no sound; the screen still says time's up.
 * For a real alarm with the app closed, use the iOS Shortcut in Settings.
 */
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}
function chime() {
  if (!audio) return;
  const now = audio.currentTime;
  [0, 0.35, 0.7].forEach((offset) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.3);
    osc.connect(gain).connect(audio!.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.32);
  });
}

export function TimerPanel({
  active,
  autoStart,
}: {
  active: ActiveSession | null;
  autoStart: { category: Category; minutes: number | null } | null;
}) {
  const router = useRouter();
  const fired = useRef(false);
  const [, startTransition] = useTransition();

  // Opened from an iOS Shortcut with ?start=...: start once, then drop the
  // query so a reload doesn't start it again.
  useEffect(() => {
    if (!autoStart || fired.current) return;
    fired.current = true;
    startTransition(async () => {
      if (!active) await startAction(autoStart.category, autoStart.minutes);
      router.replace("/");
    });
  }, [autoStart, active, router]);

  return active ? <Running key={active.id} session={active} /> : <Picker />;
}

function Picker() {
  const [category, setCategory] = useState<Category | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [pending, startTransition] = useTransition();

  function choose(c: Category) {
    setCategory(c);
    setMinutes(CATEGORY_INFO[c].defaultMinutes);
    setCustom("");
  }

  const customMinutes = Number(custom);
  const length = custom ? (Number.isInteger(customMinutes) && customMinutes > 0 && customMinutes <= 1440 ? customMinutes : NaN) : minutes;
  const valid = !Number.isNaN(length);

  return (
    <section aria-label="Start a session" className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIES.map((c) => {
          const selected = c === category;
          return (
            <button
              key={c}
              type="button"
              onClick={() => choose(c)}
              aria-pressed={selected}
              className={`rounded-2xl border bg-surface p-4 text-left transition ${selected ? "ring-2 ring-accent" : "hover:bg-surface-raised"}`}
            >
              <span className="block h-1.5 w-8 rounded-full" style={{ background: CATEGORY_INFO[c].color }} aria-hidden />
              <span className="mt-3 block text-lg font-semibold">{CATEGORY_INFO[c].label}</span>
              <span className="block text-xs text-muted">{CATEGORY_INFO[c].hint}</span>
            </button>
          );
        })}
      </div>

      {category && (
        <div className="space-y-3 rounded-2xl border bg-surface p-4">
          <p className="text-sm font-medium">How long?</p>
          <div className="flex flex-wrap gap-2">
            {LENGTHS.map((m) => (
              <Chip key={m} selected={!custom && minutes === m} onClick={() => (setMinutes(m), setCustom(""))}>
                {formatMinutes(m)}
              </Chip>
            ))}
            <Chip selected={!custom && minutes === null} onClick={() => (setMinutes(null), setCustom(""))}>
              No limit
            </Chip>
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input
                inputMode="numeric"
                placeholder="Other"
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
                className="w-20 rounded-full border bg-background px-3 py-1.5 text-foreground"
                aria-label="Custom length in minutes"
              />
              min
            </label>
          </div>
          <button
            type="button"
            disabled={pending || !valid}
            onClick={() => {
              unlockAudio();
              startTransition(() => startAction(category, length));
            }}
            className="w-full rounded-xl bg-accent px-4 py-3 text-lg font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Starting..." : `Start ${CATEGORY_INFO[category].label}`}
          </button>
          {category !== "gaming" && (
            <p className="text-xs text-muted">Turn on your iPhone Focus mode too, or use the Shortcut from Settings to do both at once.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-3 py-1.5 text-sm ${selected ? "border-accent bg-accent-soft font-medium text-accent" : "bg-background"}`}
    >
      {children}
    </button>
  );
}

function Running({ session }: { session: ActiveSession }) {
  const started = new Date(session.startedAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  const chimed = useRef(false);
  const info = CATEGORY_INFO[session.category];

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = (now - started) / 1000;
  const planned = session.plannedMinutes ? session.plannedMinutes * 60 : null;
  const remaining = planned === null ? null : planned - elapsed;
  const done = remaining !== null && remaining <= 0;

  useEffect(() => {
    document.title = done ? "Time's up · Focus Log" : `${clock(remaining ?? elapsed)} · ${info.label}`;
    if (done && !chimed.current) {
      chimed.current = true;
      chime();
    }
  }, [done, remaining, elapsed, info.label]);

  useEffect(() => () => void (document.title = "Focus Log"), []);

  return (
    <section aria-label="Running session" className="rounded-2xl border bg-surface p-5 text-center">
      <p className="flex items-center justify-center gap-2 text-sm font-medium">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: info.color }} aria-hidden />
        {info.label}
        <span className="text-muted">· {planned === null ? "stopwatch" : `${formatMinutes(session.plannedMinutes!)} block`}</span>
      </p>

      <p className="mt-4 text-6xl font-semibold tabular-nums tracking-tight" aria-live="off">
        {done ? "Done" : clock(remaining ?? elapsed)}
      </p>
      <p className="mt-1 text-sm text-muted" role="status">
        {done
          ? `Time's up. ${clock(-remaining!)} over.`
          : `Started ${new Date(started).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
      </p>

      {planned !== null && (
        <div className="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-grid" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (elapsed / planned) * 100)}%`, background: info.color }} />
        </div>
      )}

      {stopping ? (
        <FinishForm session={session} onCancel={() => setStopping(false)} />
      ) : (
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => setStopping(true)} className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-white">
            Stop and save
          </button>
          <DiscardButton id={session.id} />
        </div>
      )}
    </section>
  );
}

function FinishForm({ session, onCancel }: { session: ActiveSession; onCancel: () => void }) {
  const [state, action, pending] = useActionState(finishAction, undefined);
  const [suggested] = useState(() => suggestedMinutes(new Date(session.startedAt), session.plannedMinutes, new Date()));
  const isGaming = session.category === "gaming";

  return (
    <form action={action} className="mt-6 space-y-3 text-left">
      <input type="hidden" name="id" value={session.id} />
      <label className="block text-sm font-medium">
        Minutes
        <input
          name="minutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          required
          defaultValue={suggested}
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2.5 text-base"
        />
        <span className="mt-1 block text-xs font-normal text-muted">Fix it if you forgot to stop, or started before you tapped Start.</span>
      </label>
      <label className="block text-sm font-medium">
        {isGaming ? "What did you play?" : "What did you get done?"}
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          placeholder={isGaming ? "Optional" : "Optional, but future you will thank you"}
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2.5 text-base"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-60">
          {pending ? "Saving..." : "Save session"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border px-4 py-3 text-sm">
          Keep going
        </button>
      </div>
    </form>
  );
}

function DiscardButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Discard this session? It won't be saved.")) startTransition(() => discardAction(id));
      }}
      className="rounded-xl border px-4 py-3 text-sm text-muted disabled:opacity-60"
    >
      Discard
    </button>
  );
}
