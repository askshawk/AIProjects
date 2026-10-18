import fundamentals from "../../content/terms/fundamentals.json";
import fundamentals2 from "../../content/terms/fundamentals-2.json";
import salesCs from "../../content/terms/sales-cs.json";
import salesCs2 from "../../content/terms/sales-cs-2.json";

/**
 * The term cards. They live as reviewable JSON in content/terms/ (see
 * scripts/build_review.py) and are bundled at build time, so reading them
 * never touches the database. Only study progress is stored there.
 */

export type Track = "fundamentals" | "sales-cs";

export type Term = {
  id: string;
  term: string;
  /** A definition of 12 words or fewer, for quick-match games. */
  short: string;
  aka?: string[];
  track: Track;
  topic: string;
  plain: string;
  technical: string;
  customerLine: string;
  followUp: { q: string; a: string };
  misconception: { claim: string; truth: string };
  related: string[];
  sources: { title: string; url: string }[];
  status: "draft" | "approved";
  needsBetterSource?: boolean;
  /** Set on cards you made from your own course notes. */
  custom?: { course: string; noteId?: number };
};

export const TRACK_LABELS: Record<Track, string> = {
  fundamentals: "AI fundamentals",
  "sales-cs": "AI in sales and CS",
};

export const TERMS: Term[] = [...fundamentals, ...fundamentals2, ...salesCs, ...salesCs2] as Term[];

const BY_ID = new Map(TERMS.map((t) => [t.id, t]));

/** A built-in card by id. For your own cards too, use getAllTerms() in lib/terms.ts. */
export function getTerm(id: string): Term | undefined {
  return BY_ID.get(id);
}

/** The topic units, in the order they first appear. Boss battles are per unit. */
export function topicsOf(terms: Term[]): { track: Track; topic: string }[] {
  const seen = new Map<string, { track: Track; topic: string }>();
  for (const t of terms) if (!seen.has(t.topic)) seen.set(t.topic, { track: t.track, topic: t.topic });
  return [...seen.values()];
}
