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
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlmodel import Session

from .db import get_session
from .models import User, utcnow

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
JWT_ALGORITHM = "HS256"
TOKEN_TTL = timedelta(days=7)  # long-lived; this is a slow async game, not a bank

# tokenUrl is only used by Swagger's "Authorize" button to know where to POST
# credentials; it doesn't change runtime behavior.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


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
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Decode the bearer token and load the user, or 401.

    Drop this into any route via `user: User = Depends(get_current_user)` to
    make it require a valid login.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise credentials_error

    user = session.get(User, user_id)
    if user is None:
        raise credentials_error
    return user
