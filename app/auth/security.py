import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ApiToken, User, WebSession

SESSION_TTL = timedelta(days=30)
_hasher = PasswordHasher()


@dataclass(frozen=True)
class Principal:
    user: User
    can_write: bool
    source: str
    via_session: bool = False


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    if password_hash is None:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError, InvalidHashError:
        return False


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def create_api_token(
    db: Session, user: User, name: str, scope: str, now: datetime
) -> tuple[ApiToken, str]:
    plaintext = "hab_" + secrets.token_urlsafe(32)
    token = ApiToken(
        user_id=user.id, name=name, token_hash=hash_secret(plaintext), scopes=scope, created_at=now
    )
    db.add(token)
    db.flush()
    return token, plaintext


def create_session(db: Session, user: User, now: datetime) -> str:
    plaintext = secrets.token_urlsafe(32)
    db.add(WebSession(id=hash_secret(plaintext), user_id=user.id, expires_at=now + SESSION_TTL))
    db.flush()
    return plaintext


def principal_from_token(db: Session, plaintext: str, now: datetime) -> Principal | None:
    token = db.scalar(select(ApiToken).where(ApiToken.token_hash == hash_secret(plaintext)))
    if token is None:
        return None
    user = db.get(User, token.user_id)
    if user is None or user.disabled:
        return None
    token.last_used = now
    db.commit()
    return Principal(user=user, can_write=token.scopes == "write", source=token.name)


def principal_from_session(db: Session, plaintext: str, now: datetime) -> Principal | None:
    session = db.get(WebSession, hash_secret(plaintext))
    if session is None or session.expires_at <= now:
        return None
    user = db.get(User, session.user_id)
    if user is None or user.disabled:
        return None
    return Principal(user=user, can_write=True, source="app", via_session=True)


def end_session(db: Session, plaintext: str) -> None:
    session = db.get(WebSession, hash_secret(plaintext))
    if session is not None:
        db.delete(session)
        db.commit()
