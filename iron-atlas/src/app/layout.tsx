import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";
import { notAffiliatedWith } from "@/lib/disclosure";
import { siteUrl } from "@/lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  // Installed as a standalone app, so the layout should run under the status
  // bar rather than leaving a white band on a dark UI.
  viewportFit: "cover",
};

const DESCRIPTION =
  "A library of lifting programs built on published training methods, fitted to your equipment and logged as you lift.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Iron Atlas", template: "%s · Iron Atlas" },
  description: DESCRIPTION,
  appleWebApp: {
    capable: true,
    title: "Iron Atlas",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Iron Atlas",
    description: DESCRIPTION,
    siteName: "Iron Atlas",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Iron Atlas",
    description: DESCRIPTION,
  },
};

const NAV = [
  { href: "/coach", label: "Ask a coach" },
  { href: "/programs", label: "Programs" },
  { href: "/programs/authors", label: "Coaches" },
  { href: "/exercises", label: "Exercises" },
  { href: "/train", label: "Train" },
  { href: "/history", label: "History" },
  { href: "/gym", label: "Gym" },
  { href: "/account", label: "Account" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header
          className="sticky top-0 z-10 border-b bg-surface/60 backdrop-blur"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          {/* Seven links don't fit a phone. Scroll them sideways rather than
              wrapping to a second line, which pushed the page into horizontal
              overflow and left the header background short of the viewport. */}
          <nav className="mx-auto flex max-w-6xl items-center gap-5 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href="/" className="shrink-0 font-semibold tracking-tight">
              Iron<span className="text-accent">Atlas</span>
            </Link>
            <div className="flex shrink-0 gap-4 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap text-muted transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <ServiceWorker />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t px-4 py-6 text-xs text-muted">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p>{notAffiliatedWith("any coach in the library")}</p>
            <div className="flex gap-4">
              <Link href="/about" className="hover:text-foreground">
                About
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
              <a
                href="https://github.com/askshawk/AIProjects/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                Report an issue
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
