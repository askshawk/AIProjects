// Real-time event client (Phase 6).
//
// One shared WebSocket per logged-in tab, opened by AuthProvider when the
// token becomes available and closed on logout. A tiny pub/sub lets pages
// subscribe to server events; the server uses these only to tell the client
// *when* to refetch — pages still call the REST endpoints for authoritative
// state. Reconnects with exponential backoff so a flaky network or a server
// restart self-heals.

export type ServerEvent =
  | { type: "build_done"; city_id: number; building: string; target_level: number }
  | { type: "recruit_done"; city_id: number; unit_type: string; count: number }
  | { type: "attack_resolved"; report_id: number; outcome: "attacker_won" | "defender_won"; role: "attacker" | "defender" }
  | { type: "army_returned"; city_id: number }
  | { type: "city_founded"; city_id: number }
  | { type: "city_captured"; city_id: number; role: "captor" | "loser" }
  | { type: "alliance_message"; alliance_id: number; user: string; body: string; created_at: string }
  | { type: "queued" }
  | { type: "ping" };

type Listener = (e: ServerEvent) => void;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function wsUrl(token: string): string {
  // Convert http(s)://host → ws(s)://host and append the token.
  const httpsToWss = API_URL.replace(/^http/, "ws");
  return `${httpsToWss}/ws?token=${encodeURIComponent(token)}`;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private subs = new Set<Listener>();
  private token: string | null = null;
  // Reconnect state — exponential backoff capped at 30s.
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wantOpen = false;

  /** Open (or reopen) with a token. Idempotent: calling with the same token
      while connected does nothing. */
  connect(token: string): void {
    if (this.token === token && this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.token = token;
    this.wantOpen = true;
    this.attempts = 0;
    this._open();
  }

  /** Permanently close. Cancels any pending reconnect. */
  close(): void {
    this.wantOpen = false;
    this.token = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Subscribe to every server event. Returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }

  private _open(): void {
    if (!this.token || !this.wantOpen) return;
    try {
      this.ws = new WebSocket(wsUrl(this.token));
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => { this.attempts = 0; };
    this.ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as ServerEvent;
        // Ping is just keepalive; the rest are interesting.
        if (event.type === "ping") return;
        for (const fn of this.subs) fn(event);
      } catch {
        // Malformed message — ignore.
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (this.wantOpen) this._scheduleReconnect();
    };
    // onerror always precedes onclose; let onclose handle reconnect.
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 500 * 2 ** Math.min(this.attempts, 6));
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._open();
    }, delay);
  }
}

// One client per tab — the AuthProvider connects/closes it; pages just import.
export const realtime = new RealtimeClient();
