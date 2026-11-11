import hashlib
import secrets
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import TooManyAttempts, Unauthorized
from app.models import ApiToken, User, WebSession

SESSION_TTL = timedelta(days=30)
_hasher = PasswordHasher()


class LoginThrottle:
    """Blocks an email after repeated wrong passwords, so a public login can't be brute-forced."""

    def __init__(self, max_failures: int = 5, window: timedelta = timedelta(minutes=15)):
        self.max_failures = max_failures
        self.window = window
        self._failures: dict[str, list[datetime]] = defaultdict(list)

    def _recent(self, email: str, now: datetime) -> list[datetime]:
        recent = [t for t in self._failures[email] if now - t < self.window]
        self._failures[email] = recent
        return recent

    def blocked(self, email: str, now: datetime) -> bool:
        return len(self._recent(email.strip().lower(), now)) >= self.max_failures

    def failed(self, email: str, now: datetime) -> None:
        self._recent(email.strip().lower(), now).append(now)


@dataclass(frozen=True)
class Principal:
    user: User
    can_write: bool
    source: str
    can_manage_tokens: bool = False


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def authenticate(
    db: Session, throttle: LoginThrottle, email: str, password: str, now: datetime
) -> User:
    if throttle.blocked(email, now):
        raise TooManyAttempts("too many failed logins, try again later")
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or user.disabled or not verify_password(user.password_hash, password):
        throttle.failed(email, now)
        raise Unauthorized("wrong email or password")
    return user


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


def revoke_api_token(db: Session, plaintext: str, now: datetime) -> None:
    token = db.scalar(select(ApiToken).where(ApiToken.token_hash == hash_secret(plaintext)))
    if token is not None and token.revoked_at is None:
        token.revoked_at = now
        db.commit()


def create_session(db: Session, user: User, now: datetime) -> str:
    plaintext = secrets.token_urlsafe(32)
    db.add(WebSession(id=hash_secret(plaintext), user_id=user.id, expires_at=now + SESSION_TTL))
    db.flush()
    return plaintext


def principal_from_token(db: Session, plaintext: str, now: datetime) -> Principal | None:
    token = db.scalar(select(ApiToken).where(ApiToken.token_hash == hash_secret(plaintext)))
    if token is None or token.revoked_at is not None:
        return None
    user = db.get(User, token.user_id)
    if user is None or user.disabled:
        return None
    token.last_used = now
    db.commit()
    return Principal(
        user=user,
        can_write=token.scopes in ("write", "device"),
        source=token.name,
        can_manage_tokens=token.scopes == "device",
    )


def principal_from_session(db: Session, plaintext: str, now: datetime) -> Principal | None:
    session = db.get(WebSession, hash_secret(plaintext))
    if session is None or session.expires_at <= now:
        return None
    user = db.get(User, session.user_id)
    if user is None or user.disabled:
        return None
    return Principal(
        user=user, can_write=True, source="app", can_manage_tokens=True
    )


def end_session(db: Session, plaintext: str) -> None:
    session = db.get(WebSession, hash_secret(plaintext))
    if session is not None:
        db.delete(session)
        db.commit()
