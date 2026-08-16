"""
Account endpoints: register (creates the user AND their starter city), login,
logout, and a `/me` probe.

Register and login set an **httpOnly session cookie** — that is the credential
the browser uses. The JWT is still returned in the body so Swagger, curl and the
test suite can send it as `Authorization: Bearer`, but a browser never has to
store it anywhere a script could read.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from .. import auth
from ..db import get_session
from ..models import User
from ..auth import get_current_user
from ..schemas import LoginRequest, MeResponse, RegisterRequest, TokenResponse
from ..world import found_city

router = APIRouter(tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    response: Response,
    session: Session = Depends(get_session),
) -> TokenResponse:
    existing = session.exec(select(User).where(User.email == body.email)).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    user = User(email=body.email, password_hash=auth.hash_password(body.password))
    session.add(user)
    session.flush()  # assigns user.id without ending the transaction

    found_city(session, user, body.city_name)  # places the city on the shared grid
    session.commit()
    session.refresh(user)

    token = auth.create_access_token(user.id)
    auth.set_session_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    response: Response,
    session: Session = Depends(get_session),
) -> TokenResponse:
    user = session.exec(select(User).where(User.email == body.email)).first()
    if user is None or not auth.verify_password(body.password, user.password_hash):
        # Same message for "no such user" and "wrong password" — don't leak
        # which emails are registered.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    token = auth.create_access_token(user.id)
    auth.set_session_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    """Drop the session cookie. Deliberately unauthenticated: logging out of an
    already-expired session should quietly succeed, not 401."""
    auth.clear_session_cookie(response)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)) -> MeResponse:
    """Who the session cookie belongs to. The client calls this on load to
    decide whether it is signed in, since it can no longer read the token."""
    return MeResponse(id=user.id, email=user.email)
