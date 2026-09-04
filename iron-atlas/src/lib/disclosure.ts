/**
 * The one non-affiliation claim the app makes about every coach in the
 * library. This used to be typed out separately on each page — the homepage,
 * About, the footer, the authors index, an author page, a program page, an
 * exported spreadsheet, and a badge tooltip — and it drifted: an audit found
 * four of those eight had silently lost the "sponsored by" clause. One
 * function, one wording, interpolated per page.
 */
export function notAffiliatedWith(subject: string): string {
  return `Iron Atlas isn't affiliated with, endorsed by, or sponsored by ${subject}.`;
}
