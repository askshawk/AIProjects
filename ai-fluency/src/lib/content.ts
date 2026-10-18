import fundamentals from "../../content/terms/fundamentals.json";
import salesCs from "../../content/terms/sales-cs.json";

/**
 * The term cards. They live as reviewable JSON in content/terms/ (see
 * scripts/build_review.py) and are bundled at build time, so reading them
 * never touches the database. Only study progress is stored there.
 */

export type Track = "fundamentals" | "sales-cs";

export type Term = {
  id: string;
  term: string;
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
};

export const TRACK_LABELS: Record<Track, string> = {
  fundamentals: "AI fundamentals",
  "sales-cs": "AI in sales and CS",
};

export const TERMS: Term[] = [...fundamentals, ...salesCs] as Term[];

const BY_ID = new Map(TERMS.map((t) => [t.id, t]));

export function getTerm(id: string): Term | undefined {
  return BY_ID.get(id);
}
