"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function Landing() {
  const { token, ready } = useAuth();

  return (
    <div className="container">
      <div className="hero">
        <h1>IMPERIVM ONLINE</h1>
        <div className="divider">✦</div>
        <p className="tagline">
          A Roman-era async multiplayer city builder. Found your <em>colonia</em>, raise your
          buildings on real-world timers, and share one persistent world with every other player.
        </p>
        <div>
          {ready && token ? (
            <Link className="btn" href="/play">Enter your city</Link>
          ) : (
            <>
              <Link className="btn" href="/register" style={{ marginRight: 12 }}>Found a city</Link>
              <Link className="btn btn-ghost" href="/login">Log in</Link>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640, margin: "0 auto" }}>
        <h3>How it works</h3>
        <p style={{ margin: 0 }}>
          The server owns the world. You issue commands — <strong>build</strong> a timber camp,
          a quarry, a forum — and they complete on a timer that keeps ticking whether or not
          you&apos;re online. Close the tab, come back tomorrow: your resources accrued and your
          buildings finished. Everyone you meet on the map is playing in the same world.
        </p>
      </div>
    </div>
  );
}
