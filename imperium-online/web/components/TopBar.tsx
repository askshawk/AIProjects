"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function TopBar() {
  const { logout } = useAuth();
  const router = useRouter();
  return (
    <header className="topbar">
      <Link href="/" style={{ fontWeight: 700, textDecoration: "none", letterSpacing: "0.04em" }}>
        IMPERIVM
      </Link>
      <nav>
        <Link href="/play">City</Link>
        <Link href="/map">World map</Link>
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
