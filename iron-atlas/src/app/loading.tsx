/**
 * Applies to every route segment that doesn't define its own loading.tsx —
 * which today is all of them. Every page here does at least one DB round
 * trip with no Suspense boundary, so without this a navigation is a blank
 * screen until the whole page resolves.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-48 rounded bg-surface" />
      <div className="h-4 w-full max-w-md rounded bg-surface" />
      <div className="space-y-2 pt-2">
        <div className="h-20 rounded-lg bg-surface" />
        <div className="h-20 rounded-lg bg-surface" />
        <div className="h-20 rounded-lg bg-surface" />
      </div>
    </div>
  );
}
