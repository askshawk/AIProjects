import Link from "next/link";

const LINKS = [
  { href: "/", label: "Timer" },
  { href: "/week", label: "Week" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ current }: { current: string }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Focus <span className="text-accent">Log</span>
        </Link>
        <div className="flex gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className={`rounded-full px-2.5 py-1.5 ${
                current === l.href ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
