"""
Account endpoints: register (creates the user AND their starter city) and login.
Both return a JWT the client stores and sends as `Authorization: Bearer`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from .. import auth
from ..db import get_session
from ..models import User
from ..schemas import LoginRequest, RegisterRequest, TokenResponse
from ..world import found_city

router = APIRouter(tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, session: Session = Depends(get_session)) -> TokenResponse:
    existing = session.exec(select(User).where(User.email == body.email)).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    user = User(email=body.email, password_hash=auth.hash_password(body.password))
    session.add(user)
    session.flush()  # assigns user.id without ending the transaction

    found_city(session, user, body.city_name)  # places the city on the shared grid
    session.commit()
    session.refresh(user)

    return TokenResponse(access_token=auth.create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    user = session.exec(select(User).where(User.email == body.email)).first()
    if user is None or not auth.verify_password(body.password, user.password_hash):
        # Same message for "no such user" and "wrong password" — don't leak
        # which emails are registered.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    return TokenResponse(access_token=auth.create_access_token(user.id))
