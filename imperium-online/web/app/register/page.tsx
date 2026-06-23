"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cityName, setCityName] = useState("Nova Roma");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(email, password, cityName);
      router.push("/play");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <h1>Found a city</h1>
      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="city">City name</label>
        <input id="city" value={cityName} onChange={(e) => setCityName(e.target.value)} required />

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <div className="error">{error}</div>}

        <div style={{ marginTop: 18 }}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Founding…" : "Found city"}
          </button>
        </div>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Already have a city? <Link href="/login">Log in</Link>.
      </p>
    </div>
  );
}
