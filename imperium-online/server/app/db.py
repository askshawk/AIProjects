"""
Database engine + session plumbing.

One knob: DATABASE_URL. Unset → a local SQLite file (zero setup for dev). Set it
to a Postgres URL in production and nothing else changes — that's the whole
point of going through SQLModel/SQLAlchemy.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./imperium.db")

# check_same_thread is a SQLite-only quirk: the background worker touches the DB
# from a different thread than the request handlers, and SQLite blocks that by
# default. Harmless to omit on Postgres (we only pass it for sqlite URLs).
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def init_db() -> None:
    """Bring the schema up to date on startup.

    Alembic owns the schema (see migrations/). `create_all` is kept only as the
    zero-setup path for a brand-new database: it adds missing TABLES but never
    missing COLUMNS, which is exactly the asymmetry that made three columns need
    hand-run ALTERs before migrations existed. So a database that Alembic has
    never seen gets created and stamped; anything else is upgraded properly.

    Set IMPERIUM_SKIP_MIGRATIONS=1 to leave the schema alone (tests build their
    own in-memory database and don't want either mechanism running).
    """
    if os.getenv("IMPERIUM_SKIP_MIGRATIONS") == "1":
        return

    from . import models  # noqa: F401  (import for side effect: table registration)

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect

    root = Path(__file__).resolve().parent.parent
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "migrations"))

    if inspect(engine).has_table("alembic_version"):
        command.upgrade(cfg, "head")          # tracked already — migrate forward
    else:
        SQLModel.metadata.create_all(engine)  # fresh (or pre-Alembic) database
        command.stamp(cfg, "head")            # …now it's tracked


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one Session per request, always closed."""
    with Session(engine) as session:
        yield session
