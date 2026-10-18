import Link from "next/link";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/study", label: "Study" },
  { href: "/play", label: "Play" },
  { href: "/practice", label: "Practice" },
  { href: "/ask", label: "Ask" },
  { href: "/progress", label: "Progress" },
  { href: "/terms", label: "Glossary" },
];

/** `current` is the section root, e.g. "/play" for every game page. */
export function Nav({ current }: { current: string }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      {/* Seven sections don't fit a phone side by side; they scroll sideways
          under the logo rather than wrapping. */}
      <nav className="mx-auto max-w-2xl px-4 pt-3">
        <Link href="/" className="font-semibold tracking-tight">
          AI <span className="text-accent">Fluency</span>
        </Link>
        <div className="-mx-4 mt-2 flex gap-1 overflow-x-auto px-4 pb-2.5 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 ${
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
