import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

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

export const metadata: Metadata = {
  title: "Iron Atlas",
  description:
    "A library of lifting programs from the coaches worth reading, adapted to your gym and exported to a spreadsheet.",
  appleWebApp: { capable: true, title: "Iron Atlas", statusBarStyle: "black-translucent" },
};

const NAV = [
  { href: "/coach", label: "Coach" },
  { href: "/programs", label: "Programs" },
  { href: "/programs/authors", label: "Coaches" },
  { href: "/exercises", label: "Exercises" },
  { href: "/train", label: "Train" },
  { href: "/history", label: "History" },
  { href: "/gym", label: "Your gym" },
  { href: "/account", label: "Account" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-10 border-b bg-surface/60 backdrop-blur">
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
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
