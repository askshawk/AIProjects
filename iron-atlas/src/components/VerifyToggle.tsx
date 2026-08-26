import { setVerified } from "@/lib/verificationActions";

/**
 * The control that flips a program's provenance badge. Deliberately worded as
 * a claim about having read the source, not a preference — the badge is the
 * only accuracy signal the library carries, so it should feel like signing
 * something.
 */
export function VerifyToggle({ slug, verified }: { slug: string; verified: boolean }) {
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
            : "Mark this as checked against the original source"
        }
      >
        {verified ? "Verified — undo" : "I've checked this against the source"}
      </button>
    </form>
  );
}
