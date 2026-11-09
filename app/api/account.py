from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import security
from app.auth.deps import SESSION_COOKIE, Db, Now, Reader, SessionWriter, Writer
from app.config import get_settings
from app.errors import NotFound, Unauthorized
from app.models import ApiToken, User
from app.schemas import (
    ChannelIn,
    ChannelOut,
    ChannelUpdate,
    LoginIn,
    MeOut,
    MeUpdate,
    TokenCreate,
    TokenCreated,
    TokenOut,
)
from app.services import reminders, users

router = APIRouter(tags=["account"])


def _me(user: User) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        timezone=user.timezone,
        day_cutoff=user.day_cutoff,
        role=user.role,
    )


def _token_out(token: ApiToken) -> TokenOut:
    return TokenOut(
        id=token.id, name=token.name, scope=token.scopes, created_at=token.created_at, last_used=token.last_used
    )


@router.post("/auth/login", response_model=MeOut)
def login(data: LoginIn, response: Response, db: Db, now: Now):
    user = users.find_user(db, data.email)
    if user is None or user.disabled or not security.verify_password(user.password_hash, data.password):
        raise Unauthorized("wrong email or password")
    session_token = security.create_session(db, user, now)
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        session_token,
        max_age=int(security.SESSION_TTL.total_seconds()),
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="strict",
    )
    return _me(user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Db):
    if cookie := request.cookies.get(SESSION_COOKIE):
        security.end_session(db, cookie)
    response.delete_cookie(SESSION_COOKIE)


@router.get("/me", response_model=MeOut)
def me(principal: Reader):
    return _me(principal.user)


@router.patch("/me", response_model=MeOut)
def update_me(data: MeUpdate, principal: Writer, db: Db):
    return _me(users.update_me(db, principal.user, data))


def _get_token(db: Session, user: User, token_id: int) -> ApiToken:
    token = db.get(ApiToken, token_id)
    if token is None or token.user_id != user.id:
        raise NotFound(f"token {token_id} not found")
    return token


@router.get("/tokens", response_model=list[TokenOut])
def list_tokens(principal: SessionWriter, db: Db):
    rows = db.scalars(select(ApiToken).where(ApiToken.user_id == principal.user.id).order_by(ApiToken.id))
    return [_token_out(t) for t in rows]


@router.post("/tokens", response_model=TokenCreated, status_code=status.HTTP_201_CREATED)
def create_token(data: TokenCreate, principal: SessionWriter, db: Db, now: Now):
    token, plaintext = security.create_api_token(db, principal.user, data.name, data.scope, now)
    db.commit()
    return TokenCreated(**_token_out(token).model_dump(), token=plaintext)


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_token(token_id: int, principal: SessionWriter, db: Db):
    db.delete(_get_token(db, principal.user, token_id))
    db.commit()


@router.get("/channels", response_model=list[ChannelOut])
def list_channels(principal: Reader, db: Db):
    return [reminders.channel_out(c) for c in reminders.list_channels(db, principal.user)]


@router.post("/channels", response_model=ChannelOut, status_code=status.HTTP_201_CREATED)
def create_channel(data: ChannelIn, principal: Writer, db: Db):
    return reminders.channel_out(reminders.create_channel(db, principal.user, data))


@router.patch("/channels/{channel_id}", response_model=ChannelOut)
def update_channel(channel_id: int, data: ChannelUpdate, principal: Writer, db: Db):
    return reminders.channel_out(reminders.update_channel(db, principal.user, channel_id, data))


@router.delete("/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(channel_id: int, principal: Writer, db: Db):
    reminders.delete_channel(db, principal.user, channel_id)
