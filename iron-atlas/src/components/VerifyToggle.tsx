import { setVerified } from "@/lib/verificationActions";

/**
 * The control that flips a program's provenance badge.
 *
 * Worded as an imperative action ("Mark as..."), not a first-person statement
 * ("I've checked...") — the earlier first-person phrasing read like a
 * completed claim rather than a button, and got misread as one, which is how
 * a badly broken reconstruction ended up showing the strongest trust signal
 * the library has. The badge is the only accuracy signal the library
 * carries, so clicking it should feel like signing something, and reading it
 * should never be mistaken for having already signed.
 */
export function VerifyToggle({
  slug,
  verified,
}: {
  slug: string;
  verified: boolean;
}) {
  async function toggle() {
    "use server";
    await setVerified(slug, !verified);
  }

  return (
    <form action={toggle}>
      <button
        type="submit"
        className={
          verified
            ? "rounded-md border border-emerald-800 px-3 py-1.5 text-xs text-emerald-300 transition-colors hover:bg-emerald-950/40"
            : "rounded-md border px-3 py-1.5 text-xs transition-colors hover:border-emerald-800 hover:text-emerald-300"
        }
        title={
          verified
            ? "Remove the verified badge"
            : "Click to mark this as checked against the original source"
        }
      >
        {verified ? "✓ Verified — click to undo" : "Mark as checked against source"}
      </button>
    </form>
  );
}
