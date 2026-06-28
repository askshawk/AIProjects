"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  getMyAlliance, listAlliances, createAlliance, joinAlliance, leaveAlliance,
  getMessages, postMessage, type Alliance, type AllianceMessage,
} from "@/lib/api";
import { realtime } from "@/lib/realtime";
import TopBar from "@/components/TopBar";
import OrnateHeader from "@/components/OrnateHeader";

export default function AlliancesPage() {
  const { token, ready } = useAuth();
  const router = useRouter();
  const [mine, setMine] = useState<Alliance | null>(null);
  const [others, setOthers] = useState<Alliance[]>([]);
  const [messages, setMessages] = useState<AllianceMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const m = await getMyAlliance(token);
      setMine(m);
      if (m) setMessages(await getMessages(token, m.id));
      else setOthers(await listAlliances(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alliances");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Live chat: append messages pushed for my alliance.
  useEffect(() => {
    if (!mine) return;
    const unsub = realtime.subscribe((evt) => {
      if (evt.type === "alliance_message" && evt.alliance_id === mine.id) {
        setMessages((prev) => [...prev, { id: Date.now(), user: evt.user, body: evt.body, created_at: evt.created_at }]);
      }
    });
    return unsub;
  }, [mine]);

  // Keep the chat scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    if (!token || !mine || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    try { await postMessage(token, mine.id, body); } catch { /* surfaced on reload */ }
  }

  async function doCreate() {
    if (!token || !newName.trim()) return;
    setError(null);
    try { setMine(await createAlliance(token, newName.trim())); setNewName(""); load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to create"); }
  }

  async function doJoin(id: number) {
    if (!token) return;
    try { await joinAlliance(token, id); load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to join"); }
  }

  async function doLeave() {
    if (!token) return;
    await leaveAlliance(token);
    setMine(null); setMessages([]); load();
  }

  if (!ready || !token) return null;

  return (
    <>
      <TopBar />
      <div className="container">
        <OrnateHeader title="Alliances" subtitle="Band together — coordinate marches and hold a shared chat." />
        {error && <div className="error">{error}</div>}

        {mine ? (
          <div className="grid-2">
            <div className="card">
              <h3>{mine.name}</h3>
              <ul className="member-list">
                {mine.members.map((m) => (
                  <li key={m.user}><strong>{m.user}</strong> <span className="muted">· {m.role}</span></li>
                ))}
              </ul>
              <button className="btn btn-ghost" onClick={doLeave} style={{ marginTop: 12 }}>Leave alliance</button>
            </div>

            <div className="card">
              <h3>Alliance chat</h3>
              <div className="chat-log" ref={scrollRef}>
                {messages.length === 0 ? (
                  <p className="muted">No messages yet. Say something.</p>
                ) : messages.map((m) => (
                  <div className="chat-msg" key={m.id}>
                    <span className="chat-user">{m.user}</span>
                    <span className="chat-body">{m.body}</span>
                  </div>
                ))}
              </div>
              <div className="chat-input">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder="Message your alliance…"
                  maxLength={500}
                />
                <button className="btn" onClick={send} disabled={!draft.trim()}>Send</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 18 }}>
              <h3>Found an alliance</h3>
              <div className="chat-input">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Alliance name" maxLength={40} />
                <button className="btn" onClick={doCreate} disabled={!newName.trim()}>Create</button>
              </div>
            </div>
            <div className="card">
              <h3>Join an alliance</h3>
              {others.length === 0 ? (
                <p className="muted">No alliances yet. Be the first to found one.</p>
              ) : (
                <ul className="member-list">
                  {others.map((a) => (
                    <li key={a.id} className="join-row">
                      <span><strong>{a.name}</strong> <span className="muted">· {a.members.length} member{a.members.length === 1 ? "" : "s"}</span></span>
                      <button className="btn" onClick={() => doJoin(a.id)}>Join</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
