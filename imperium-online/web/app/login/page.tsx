"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.push("/play");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <h1>Log in</h1>
      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <div className="error">{error}</div>}

        <div style={{ marginTop: 18 }}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Entering…" : "Enter"}
          </button>
        </div>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        No city yet? <Link href="/register">Found one</Link>.
      </p>
    </div>
  );
}
