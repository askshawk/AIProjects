"""
Database engine + session plumbing.

One knob: DATABASE_URL. Unset → a local SQLite file (zero setup for dev). Set it
to a Postgres URL in production and nothing else changes — that's the whole
point of going through SQLModel/SQLAlchemy.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./imperium.db")

# check_same_thread is a SQLite-only quirk: the background worker touches the DB
# from a different thread than the request handlers, and SQLite blocks that by
# default. Harmless to omit on Postgres (we only pass it for sqlite URLs).
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def init_db() -> None:
    """Create tables if they don't exist. Called once on startup.

    Importing models here (not at module top) guarantees they're registered on
    SQLModel.metadata before create_all runs, without a circular import.
    """
    from . import models  # noqa: F401  (import for side effect: table registration)

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one Session per request, always closed."""
    with Session(engine) as session:
        yield session
