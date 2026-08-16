"""
FastAPI application entry point.

Wires together: DB init, CORS for the Next.js dev origin, the background worker
(started/stopped with the app via the lifespan), and the route modules.

Run it:
    cd imperium-online/server
    pip install -r requirements.txt
    cp .env.example .env        # optional; sane defaults if you skip it
    uvicorn app.main:app --reload
    # interactive API docs at http://localhost:8000/docs
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import ratelimit, realtime
from .db import init_db
from .routers import alliances, auth, cities, movements, world
from .worker import start_worker, stop_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables, capture the asyncio loop (the realtime push helper
    # uses it to schedule sends from the worker thread / sync handlers), then
    # kick off the background event resolver.
    init_db()
    realtime.set_loop(asyncio.get_running_loop())
    start_worker()
    yield
    # Shutdown: stop the scheduler cleanly.
    stop_worker()


app = FastAPI(title="Imperium Online", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Budget every request before it reaches a route.

    Middleware rather than a per-route dependency so a new endpoint is covered
    the moment it exists — the failure mode of the dependency approach is an
    unprotected route nobody remembers to annotate. CORS preflights are exempt:
    an OPTIONS that 429s would surface in the browser as an opaque CORS error
    rather than as rate limiting.
    """
    if request.method != "OPTIONS":
        try:
            ratelimit.enforce(request)
        except HTTPException as exc:
            return JSONResponse(
                {"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers
            )
    return await call_next(request)

# Allow the Next.js dev server (and any extra origins) to call the API.
origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # `Date` isn't CORS-safelisted; the client reads it to correct for a skewed
    # local clock when interpolating army positions between two timestamps.
    expose_headers=["Date"],
)

app.include_router(auth.router)
app.include_router(cities.router)
app.include_router(world.router)
app.include_router(movements.router)
app.include_router(alliances.router)
app.include_router(realtime.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
