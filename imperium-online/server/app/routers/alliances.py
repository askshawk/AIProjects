"""
Alliances + chat (Phase 7D).

A player belongs to at most one alliance (enforced by the unique user_id on
AllianceMembership). Chat messages persist and are pushed live to every member
over the Phase 6 WebSocket — no new transport, just a new event type.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from .. import realtime
from ..auth import get_current_user
from ..db import get_session
from ..models import Alliance, AllianceMembership, Message, User
from ..schemas import (
    AllianceCreateRequest,
    AllianceOut,
    MemberOut,
    MessageOut,
    MessageRequest,
)

router = APIRouter(prefix="/alliances", tags=["alliances"])


def _label(email: str) -> str:
    return email.split("@", 1)[0]


def _membership(session: Session, user_id: int) -> AllianceMembership | None:
    return session.exec(
        select(AllianceMembership).where(AllianceMembership.user_id == user_id)
    ).first()


def _member_user_ids(session: Session, alliance_id: int) -> list[int]:
    return list(session.exec(
        select(AllianceMembership.user_id).where(AllianceMembership.alliance_id == alliance_id)
    ).all())


def _alliance_out(session: Session, alliance: Alliance, viewer_id: int) -> AllianceOut:
    rows = session.exec(
        select(AllianceMembership, User)
        .join(User, AllianceMembership.user_id == User.id)
        .where(AllianceMembership.alliance_id == alliance.id)
    ).all()
    members = [MemberOut(user=_label(u.email), role=m.role) for m, u in rows]
    mine = next((m.role for m, _ in rows if m.user_id == viewer_id), None)
    return AllianceOut(id=alliance.id, name=alliance.name, members=members, mine_role=mine)


@router.post("", response_model=AllianceOut, status_code=status.HTTP_201_CREATED)
def create_alliance(
    body: AllianceCreateRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AllianceOut:
    if _membership(session, user.id) is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Leave your current alliance first")
    name = body.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Alliance needs a name")
    if session.exec(select(Alliance).where(Alliance.name == name)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "That name is taken")

    alliance = Alliance(name=name, founder_id=user.id)
    session.add(alliance)
    session.flush()
    session.add(AllianceMembership(alliance_id=alliance.id, user_id=user.id, role="founder"))
    session.commit()
    session.refresh(alliance)
    return _alliance_out(session, alliance, user.id)


@router.get("/me", response_model=AllianceOut | None)
def my_alliance(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AllianceOut | None:
    m = _membership(session, user.id)
    if m is None:
        return None
    return _alliance_out(session, session.get(Alliance, m.alliance_id), user.id)


@router.get("", response_model=list[AllianceOut])
def list_alliances(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[AllianceOut]:
    """All alliances — so a player can find one to join."""
    return [_alliance_out(session, a, user.id) for a in session.exec(select(Alliance)).all()]


@router.post("/{alliance_id}/join", response_model=AllianceOut)
def join_alliance(
    alliance_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AllianceOut:
    if _membership(session, user.id) is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Leave your current alliance first")
    alliance = session.get(Alliance, alliance_id)
    if alliance is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such alliance")
    session.add(AllianceMembership(alliance_id=alliance_id, user_id=user.id, role="member"))
    session.commit()
    return _alliance_out(session, alliance, user.id)


@router.post("/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_alliance(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    m = _membership(session, user.id)
    if m is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You're not in an alliance")
    alliance_id = m.alliance_id
    session.delete(m)
    session.commit()
    # If the alliance is now empty, dissolve it (and its messages).
    if not _member_user_ids(session, alliance_id):
        for msg in session.exec(select(Message).where(Message.alliance_id == alliance_id)).all():
            session.delete(msg)
        alliance = session.get(Alliance, alliance_id)
        if alliance:
            session.delete(alliance)
        session.commit()


@router.get("/{alliance_id}/messages", response_model=list[MessageOut])
def get_messages(
    alliance_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[MessageOut]:
    m = _membership(session, user.id)
    if m is None or m.alliance_id != alliance_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Members only")
    rows = session.exec(
        select(Message, User).join(User, Message.user_id == User.id)
        .where(Message.alliance_id == alliance_id)
        .order_by(Message.created_at)
        .limit(100)
    ).all()
    return [MessageOut(id=msg.id, user=_label(u.email), body=msg.body, created_at=msg.created_at) for msg, u in rows]


@router.post("/{alliance_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def post_message(
    alliance_id: int,
    body: MessageRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MessageOut:
    m = _membership(session, user.id)
    if m is None or m.alliance_id != alliance_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Members only")
    text = body.body.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty message")

    msg = Message(alliance_id=alliance_id, user_id=user.id, body=text[:500])
    session.add(msg)
    session.commit()
    session.refresh(msg)

    label = _label(user.email)
    # Push live to every member (including the sender's other tabs).
    realtime.manager.push_to_users(
        _member_user_ids(session, alliance_id),
        {
            "type": "alliance_message",
            "alliance_id": alliance_id,
            "user": label,
            "body": msg.body,
            "created_at": msg.created_at.replace(tzinfo=None).isoformat() + "+00:00",
        },
    )
    return MessageOut(id=msg.id, user=label, body=msg.body, created_at=msg.created_at)
