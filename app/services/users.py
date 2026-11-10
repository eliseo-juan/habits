from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.errors import Invalid
from app.models import User
from app.schemas import MeUpdate


def create_user(
    db: Session,
    email: str,
    display_name: str,
    password: str | None,
    timezone: str,
    role: str,
    now: datetime,
) -> User:
    email = email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise Invalid(f"user {email} already exists")
    user = User(
        email=email,
        display_name=display_name,
        password_hash=hash_password(password) if password else None,
        timezone=timezone,
        role=role,
        created_at=now,
        disabled=False,
    )
    db.add(user)
    db.commit()
    return user


def find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def update_me(db: Session, user: User, data: MeUpdate) -> User:
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None:
            raise Invalid(f"{field} cannot be null")
        setattr(user, field, value)
    db.commit()
    return user
