import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { CityProvider } from "@/lib/cityStore";
import { ToastProvider } from "@/lib/toast";
import Toaster from "@/components/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Imperium Online",
  description: "A Roman-era async multiplayer city builder.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <CityProvider>
            <ToastProvider>
              {children}
              <Toaster />
            </ToastProvider>
          </CityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
