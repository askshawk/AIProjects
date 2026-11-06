import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e13" },
  ],
  // Installed as a standalone app, the layout runs under the status bar.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: { default: "Focus Log", template: "%s · Focus Log" },
  description: "Track focus time and gaming time.",
  appleWebApp: { capable: true, title: "Focus Log", statusBarStyle: "default" },
  // A personal app behind a passcode: keep it out of search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body
        className="min-h-full font-sans"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
