import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-sm space-y-3 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted">
        Whatever was here has moved or never existed.
      </p>
      <div className="flex justify-center gap-3 pt-1">
        <Link
          href="/programs"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          Browse programs
        </Link>
        <Link
          href="/"
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
