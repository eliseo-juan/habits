from datetime import UTC, datetime

import httpx
import pytest

from app.db import get_sessionmaker
from app.notifications.ntfy import Notification, send_ntfy
from app.notifications.scheduler import send_due_reminders


class Outbox:
    def __init__(self, fail: bool = False):
        self.sent: list[tuple[dict, Notification]] = []
        self.fail = fail

    def __call__(self, config: dict, notification: Notification) -> None:
        if self.fail:
            raise httpx.ConnectError("down")
        self.sent.append((config, notification))


def at(hour: int, minute: int, day: int = 9, month: int = 11, year: int = 2026) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


def run(now: datetime, outbox: Outbox) -> int:
    with get_sessionmaker()() as db:
        return send_due_reminders(db, now, "test-secret", "https://habits.test", sender=outbox)


@pytest.fixture
def reminder(client, alice):
    habit = client.post(
        "/habits",
        json={"name": "Meditate", "start_date": "2026-11-01", "schedule": {"type": "daily"}},
        headers=alice.auth(),
    ).json()
    client.post(
        "/channels",
        json={"config": {"topic": "alice-habits", "access_token": "tk"}},
        headers=alice.auth(),
    )
    created = client.post(
        f"/habits/{habit['id']}/reminders", json={"time_local": "08:30"}, headers=alice.auth()
    ).json()
    return {"habit": habit, "reminder": created}


def test_sends_once_within_grace_window(reminder):
    outbox = Outbox()
    assert run(at(7, 29), outbox) == 0
    assert run(at(7, 30), outbox) == 1
    assert run(at(7, 35), outbox) == 0
    assert run(at(7, 40), outbox) == 0
    config, notification = outbox.sent[0]
    assert config == {"server": "https://ntfy.sh/", "topic": "alice-habits", "access_token": "tk"}
    assert notification.title == "Meditate"
    assert notification.done_url.startswith("https://habits.test/notifications/actions/")


def test_skips_habits_already_done_or_skipped(client, alice, reminder):
    habit_id = reminder["habit"]["id"]
    client.post(f"/habits/{habit_id}/logs/2026-11-09/done", headers=alice.auth())
    client.put(f"/habits/{habit_id}/logs/2026-11-10", json={"skipped": True}, headers=alice.auth())
    outbox = Outbox()
    assert run(at(7, 31), outbox) == 0
    assert run(at(7, 31, day=10), outbox) == 0
    assert run(at(7, 31, day=11), outbox) == 1


def test_respects_reminder_weekdays(client, alice, reminder):
    client.patch(
        f"/reminders/{reminder['reminder']['id']}", json={"weekdays": [1]}, headers=alice.auth()
    )
    outbox = Outbox()
    assert run(at(7, 30), outbox) == 0
    assert run(at(7, 30, day=10), outbox) == 1


def test_local_time_follows_daylight_saving(reminder):
    outbox = Outbox()
    assert run(at(7, 30, day=1, month=7, year=2027), outbox) == 0
    assert run(at(6, 30, day=1, month=7, year=2027), outbox) == 1


def test_failed_delivery_is_retried(reminder):
    assert run(at(7, 30), Outbox(fail=True)) == 0
    outbox = Outbox()
    assert run(at(7, 31), outbox) == 1


def test_no_channel_sends_nothing(client, alice, reminder):
    channel_id = client.get("/channels", headers=alice.auth()).json()[0]["id"]
    client.patch(f"/channels/{channel_id}", json={"enabled": False}, headers=alice.auth())
    assert run(at(7, 30), Outbox()) == 0


def test_done_link_is_single_use_and_marks_the_day(client, alice, reminder):
    outbox = Outbox()
    run(at(7, 30), outbox)
    path = outbox.sent[0][1].done_url.removeprefix("https://habits.test")
    assert client.post(path).status_code == 204
    assert client.post(path).status_code == 404
    log = client.get("/today", headers=alice.auth()).json()["items"][0]
    assert log["status"] == "done"
    tampered = path.replace("/done", "").rsplit(".", 1)[0] + ".0000/done"
    assert client.post(tampered).status_code == 404


def test_send_ntfy_payload():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = request.read()
        return httpx.Response(200)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    send_ntfy(
        {"server": "https://ntfy.example/", "topic": "t", "access_token": "tk"},
        Notification("Leer ñ", "Pendiente de hoy", "https://h/done"),
        client=client,
    )
    assert seen["url"] == "https://ntfy.example/"
    assert seen["auth"] == "Bearer tk"
    assert '"title":"Leer \\u00f1"' in seen["body"].decode() or "Leer ñ" in seen["body"].decode()
    assert b'"url":"https://h/done"' in seen["body"]
