"""Tells subscribers that a user's habits or logs changed. The POST carries no data: they fetch what they need."""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Invalid, NotFound
from app.models import User, Webhook

MAX_PER_USER = 10

log = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="webhooks")


def list_webhooks(db: Session, user: User) -> list[Webhook]:
    return list(db.scalars(select(Webhook).where(Webhook.user_id == user.id).order_by(Webhook.id)))


def subscribe(db: Session, user: User, url: str, now: datetime) -> tuple[Webhook, bool]:
    existing = list_webhooks(db, user)
    for webhook in existing:
        if webhook.url == url:
            return webhook, False
    if len(existing) >= MAX_PER_USER:
        raise Invalid(f"at most {MAX_PER_USER} webhooks per account")
    webhook = Webhook(user_id=user.id, url=url, created_at=now)
    db.add(webhook)
    db.commit()
    return webhook, True


def unsubscribe(db: Session, user: User, webhook_id: int) -> None:
    webhook = db.get(Webhook, webhook_id)
    if webhook is None or webhook.user_id != user.id:
        raise NotFound(f"webhook {webhook_id} not found")
    db.delete(webhook)
    db.commit()


def notify_changed(db: Session, user_id: int) -> None:
    for url in db.scalars(select(Webhook.url).where(Webhook.user_id == user_id)):
        deliver(url)


def deliver(url: str) -> None:
    _executor.submit(_post, url)


def _post(url: str) -> None:
    try:
        httpx.post(url, timeout=5).raise_for_status()
    except httpx.HTTPError as error:
        log.warning("webhook %s failed: %s", url, error)
