from datetime import datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.auth.security import Principal, principal_from_session, principal_from_token
from app.clock import utcnow
from app.db import get_db
from app.errors import Forbidden, Unauthorized

SESSION_COOKIE = "habits_session"

Db = Annotated[Session, Depends(get_db)]
Now = Annotated[datetime, Depends(utcnow)]


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


def current_principal(request: Request, db: Db, now: Now) -> Principal:
    token = bearer_token(request)
    if token is not None:
        principal = principal_from_token(db, token, now)
    elif cookie := request.cookies.get(SESSION_COOKIE):
        principal = principal_from_session(db, cookie, now)
    else:
        principal = None
    if principal is None:
        raise Unauthorized("missing or invalid credentials")
    return principal


def writer(principal: Annotated[Principal, Depends(current_principal)]) -> Principal:
    if not principal.can_write:
        raise Forbidden("this token is read-only")
    return principal


def session_writer(principal: Annotated[Principal, Depends(current_principal)]) -> Principal:
    if not principal.via_session:
        raise Forbidden("token management needs a web session")
    return principal


Reader = Annotated[Principal, Depends(current_principal)]
Writer = Annotated[Principal, Depends(writer)]
SessionWriter = Annotated[Principal, Depends(session_writer)]
