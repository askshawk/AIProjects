"""
Production configuration guards (Phase 8c).

The defaults in this project are deliberately friendly: a SQLite file, a known
JWT secret, CORS open to localhost. Every one of those is wrong in production,
and each fails silently — a deploy with the shipped secret looks perfectly
healthy while anyone who has read the repository can mint a token for any
account.

So `APP_ENV=production` turns those defaults into a refusal to boot. Failing at
startup is loud and immediate; failing at first login is quiet and much later.
"""

from __future__ import annotations

import os

DEV_JWT_SECRET = "dev-only-change-me"
DEFAULT_CORS = "http://localhost:3000"


def is_production(env: dict[str, str] | None = None) -> bool:
    env = os.environ if env is None else env
    return env.get("APP_ENV", "dev").lower() in ("production", "prod")


def production_problems(env: dict[str, str] | None = None) -> list[str]:
    """Everything wrong with this configuration for a public deployment.

    Pure and env-injectable so the rules are testable without setting process
    state. Returns an empty list when the configuration is fit to ship.
    """
    env = os.environ if env is None else env
    problems: list[str] = []

    if env.get("JWT_SECRET", DEV_JWT_SECRET) == DEV_JWT_SECRET:
        problems.append(
            "JWT_SECRET is still the development default — anyone with the "
            "repository could mint a token for any account. Generate one with: "
            'python -c "import secrets; print(secrets.token_hex(32))"'
        )

    origins = env.get("CORS_ORIGINS", DEFAULT_CORS)
    if origins == DEFAULT_CORS:
        problems.append(
            "CORS_ORIGINS is still localhost — set it to the deployed web "
            "origin, e.g. https://imperium.vercel.app"
        )
    if "*" in origins:
        problems.append(
            "CORS_ORIGINS contains '*', which cannot be combined with "
            "credentialed requests — list the exact origins instead"
        )

    if env.get("DATABASE_URL", "sqlite:///./imperium.db").startswith("sqlite"):
        problems.append(
            "DATABASE_URL still points at SQLite — a container filesystem is "
            "ephemeral, so the world would vanish on redeploy. Point it at "
            "Postgres."
        )

    if env.get("COOKIE_SECURE", "0") != "1":
        problems.append(
            "COOKIE_SECURE is not 1 — the session cookie would be sent over "
            "plain http, and SameSite=None requires Secure"
        )

    return problems


def assert_production_ready(env: dict[str, str] | None = None) -> None:
    """Refuse to start a production app on a development configuration."""
    if not is_production(env):
        return
    problems = production_problems(env)
    if problems:
        raise RuntimeError(
            "Refusing to start with APP_ENV=production:\n"
            + "\n".join(f"  - {p}" for p in problems)
        )
