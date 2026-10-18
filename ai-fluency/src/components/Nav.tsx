import Link from "next/link";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/study", label: "Study" },
  { href: "/terms", label: "Glossary" },
];

export function Nav({ current }: { current: string }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          AI <span className="text-accent">Fluency</span>
        </Link>
        <div className="flex gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 ${
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
