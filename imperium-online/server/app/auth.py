"""
Authentication: password hashing + JWT issue/verify + a FastAPI dependency that
turns a bearer token into the current User.

Hand-rolled on purpose (bcrypt + python-jose) so the moving parts are visible.
`fastapi-users` is the drop-in upgrade once the slice is proven.
"""

from __future__ import annotations

import os
from datetime import timedelta

import bcrypt
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlmodel import Session

from .db import get_session
from .models import User, utcnow

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
JWT_ALGORITHM = "HS256"
TOKEN_TTL = timedelta(days=7)  # long-lived; this is a slow async game, not a bank

# The session cookie is the real credential. It's httpOnly, so a cross-site
# script can't read it the way it could read localStorage — that swap is the
# point of the change.
COOKIE_NAME = "imperium_session"

# In production the browser talks to an API on a different domain, so the
# cookie has to be SameSite=None (and therefore Secure). Locally both live on
# localhost, where Lax works and Secure would stop the cookie being set at all
# over plain http.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0") == "1"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "none" if COOKIE_SECURE else "lax")

# tokenUrl is only used by Swagger's "Authorize" button to know where to POST
# credentials; it doesn't change runtime behavior. auto_error is off because a
# request may authenticate by cookie instead — see get_current_user.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(TOKEN_TTL.total_seconds()),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        COOKIE_NAME,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def user_from_token(token: str, session: Session) -> User | None:
    """Decode a JWT and load its user, or None. Shared by the REST dependency
    and the WebSocket handshake so there is one definition of a valid session."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None
    return session.get(User, user_id)


def _encode(plain: str) -> bytes:
    # bcrypt hashes at most 72 bytes and raises on longer input, so truncate
    # explicitly (standard practice). UTF-8 so non-ASCII passwords work.
    return plain.encode("utf-8")[:72]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_encode(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_encode(plain), hashed.encode("utf-8"))


def create_access_token(user_id: int) -> str:
    """Sign a JWT whose subject is the user id."""
    payload = {"sub": str(user_id), "exp": utcnow() + TOKEN_TTL}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Load the user from the session cookie, or 401.

    The browser authenticates by cookie. A bearer token is still accepted so
    Swagger's Authorize button, curl and the test suite keep working.

    An explicit header wins over the cookie: the header is a deliberate act,
    while a cookie is ambient and may be stale. (The test suite drove this out
    — a client that had registered two users held the second one's cookie, and
    cookie-first silently authenticated every later request as the wrong
    account no matter which token was sent.)

    Drop this into any route via `user: User = Depends(get_current_user)` to
    make it require a valid login.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    raw = token or request.cookies.get(COOKIE_NAME)
    if not raw:
        raise credentials_error
    user = user_from_token(raw, session)
    if user is None:
        raise credentials_error
    return user
