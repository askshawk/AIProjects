"""
Real-time event push (Phase 6) — WebSockets.

The server is still the single source of truth: pushes only tell the client
*when* to refetch, never *what* is true. The moment a state change resolves
(`catch_up`, `resolve_movement`), we push a tiny JSON event over WebSocket to
every connected client owned by the affected user(s); the client then calls the
existing REST endpoints to read authoritative state.

The hard parts:
 1. Cross-thread emit. catch_up / resolve_movement are SYNC code that may run
    in a sync request handler's threadpool OR in the APScheduler worker thread.
    Neither can `await websocket.send_json`. We capture the FastAPI event loop
    at startup (set_loop), then schedule sends onto it via
    asyncio.run_coroutine_threadsafe. So any thread can call push_to_user
    freely.
 2. Auth. Browser WebSocket can't set Authorization headers, so the JWT comes
    in as `?token=<jwt>` on the connect URL — verified with the same
    python-jose code the REST routes use.

Scope note: the connection registry is an in-process dict[user_id, set[ws]].
Fine on the free-tier single-uvicorn-worker deploy; horizontal scaling needs
Redis pub/sub. Mark as a TODO when that day comes.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlmodel import Session

from .auth import JWT_ALGORITHM, JWT_SECRET
from .db import get_session
from .models import User

log = logging.getLogger(__name__)
router = APIRouter(tags=["realtime"])

# The main asyncio event loop, captured in app lifespan. push_to_user uses it
# to schedule sends from non-async threads (the worker; sync request handlers).
_loop: asyncio.AbstractEventLoop | None = None

KEEPALIVE_SECONDS = 25  # keep idle proxies from dropping the socket


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


class ConnectionManager:
    """In-process map of user_id → open WebSockets. A user can have several
    (multiple tabs); we push to all of them."""

    def __init__(self) -> None:
        self._by_user: dict[int, set[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._by_user.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        sockets = self._by_user.get(user_id)
        if not sockets:
            return
        sockets.discard(ws)
        if not sockets:
            self._by_user.pop(user_id, None)

    def push_to_users(self, user_ids, event: dict[str, Any]) -> None:
        """push_to_user for several recipients (alliance chat, conquest)."""
        for uid in set(user_ids):
            self.push_to_user(uid, event)

    def push_to_user(self, user_id: int, event: dict[str, Any]) -> None:
        """Fire-and-forget. Safe to call from any thread (the worker, a sync
        route handler, etc.). If no one is connected, nothing happens — events
        are not buffered; clients refetch on (re)connect via the REST API."""
        sockets = self._by_user.get(user_id)
        if not sockets or _loop is None:
            return
        # Snapshot so disconnects mid-iteration don't mutate the live set.
        targets = list(sockets)
        asyncio.run_coroutine_threadsafe(self._broadcast(targets, event), _loop)

    async def _broadcast(self, sockets: list[WebSocket], event: dict[str, Any]) -> None:
        for ws in sockets:
            try:
                await ws.send_json(event)
            except Exception as exc:  # send fails → connection is dead; drop it
                log.debug("ws send failed, dropping: %s", exc)
                # Don't know the user_id here without a reverse map; the
                # WebSocketDisconnect path in the route will clean up on next
                # client action.


manager = ConnectionManager()


def _user_from_token(token: str, session: Session) -> User | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None
    return session.get(User, user_id)


@router.websocket("/ws")
async def ws_endpoint(
    websocket: WebSocket,
    token: str = "",
    session: Session = Depends(get_session),
) -> None:
    """One websocket per browser tab. Auth via ?token=<jwt>; on success we hold
    the connection open, sending an occasional ping to keep proxies from
    timing it out. Real events come in via push_to_user.

    Session is injected via Depends so tests can override get_session and use
    their in-memory DB (same pattern the REST routes use)."""
    user = _user_from_token(token, session)
    if user is None:
        # 4401 = custom-application code for "auth failed" (1000-2999 are reserved).
        await websocket.close(code=4401)
        return

    await manager.connect(user.id, websocket)
    try:
        while True:
            await asyncio.sleep(KEEPALIVE_SECONDS)
            await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover — defensive
        log.debug("ws loop ended: %s", exc)
    finally:
        manager.disconnect(user.id, websocket)


# Convenience wrappers other modules import. Centralised here so the event
# vocabulary stays in one file — see ServerEvent in web/lib/realtime.ts for
# the matching client types.
def emit_build_done(user_id: int, city_id: int, building: str, target_level: int) -> None:
    manager.push_to_user(user_id, {
        "type": "build_done",
        "city_id": city_id,
        "building": building,
        "target_level": target_level,
    })


def emit_recruit_done(user_id: int, city_id: int, unit_type: str, count: int) -> None:
    manager.push_to_user(user_id, {
        "type": "recruit_done",
        "city_id": city_id,
        "unit_type": unit_type,
        "count": count,
    })


def emit_attack_resolved(user_id: int, report_id: int, outcome: str, role: str) -> None:
    """role is 'attacker' or 'defender' from this user's perspective."""
    manager.push_to_user(user_id, {
        "type": "attack_resolved",
        "report_id": report_id,
        "outcome": outcome,
        "role": role,
    })


def emit_army_returned(user_id: int, city_id: int) -> None:
    manager.push_to_user(user_id, {
        "type": "army_returned",
        "city_id": city_id,
    })


def emit_city_founded(user_id: int, city_id: int) -> None:
    manager.push_to_user(user_id, {"type": "city_founded", "city_id": city_id})


def emit_city_captured(captor_id: int, loser_id: int, city_id: int) -> None:
    manager.push_to_user(captor_id, {"type": "city_captured", "city_id": city_id, "role": "captor"})
    manager.push_to_user(loser_id, {"type": "city_captured", "city_id": city_id, "role": "loser"})


def emit_queued(user_id: int) -> None:
    """Generic 'something queued' signal for multi-tab sync — the client just
    refetches; we don't need to be specific."""
    manager.push_to_user(user_id, {"type": "queued"})
