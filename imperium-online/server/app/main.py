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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import realtime
from .db import init_db
from .routers import auth, cities, movements, world
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
)

app.include_router(auth.router)
app.include_router(cities.router)
app.include_router(world.router)
app.include_router(movements.router)
app.include_router(realtime.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
