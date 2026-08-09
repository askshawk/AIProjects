"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useCities } from "@/lib/cityStore";
import WorldClockBadge from "@/components/WorldClockBadge";

export default function TopBar() {
  const { logout } = useAuth();
  const { cities, activeId, select } = useCities();
  const router = useRouter();
  return (
    <header className="topbar">
      <Link href="/" className="brand">IMPERIVM</Link>
      <nav>
        <WorldClockBadge />
        {cities.length > 0 && (
          <select
            className="city-switcher"
            value={activeId ?? ""}
            onChange={(e) => select(Number(e.target.value))}
            aria-label="Active city"
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.x},{c.y})</option>
            ))}
          </select>
        )}
        <Link href="/play">City</Link>
        <Link href="/map">World map</Link>
        <Link href="/reports">Reports</Link>
        <Link href="/alliances">Alliance</Link>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            logout();
            router.push("/login");
          }}
        >
          Log out
        </a>
      </nav>
    </header>
  );
}
