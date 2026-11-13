from datetime import UTC, datetime

import httpx
import pytest

from app.db import get_sessionmaker
from app.models import NotificationChannel
from app.notifications.expo import DeviceNotRegistered, send_expo
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


def test_title_starts_with_the_habit_icon(client, alice, reminder):
    client.patch(f"/habits/{reminder['habit']['id']}", json={"icon": "🧘"}, headers=alice.auth())
    outbox = Outbox()
    assert run(at(7, 31), outbox) == 1
    assert outbox.sent[0][1].title == "🧘 Meditate"


def test_skips_habits_already_done_or_skipped(client, alice, reminder):
    habit_id = reminder["habit"]["id"]
    client.post(f"/habits/{habit_id}/logs/2026-11-09/done", headers=alice.auth())
    client.put(f"/habits/{habit_id}/logs/2026-11-10", json={"skipped": True}, headers=alice.auth())
    outbox = Outbox()
    assert run(at(7, 31), outbox) == 0
    assert run(at(7, 31, day=10), outbox) == 0
    assert run(at(7, 31, day=11), outbox) == 1


def test_limit_habits_are_never_reminded(client, alice):
    habit = client.post(
        "/habits",
        json={"name": "Sugar", "kind": "limit", "schedule": {"type": "daily"}},
        headers=alice.auth(),
    ).json()
    client.post("/channels", json={"config": {"topic": "alice-habits"}}, headers=alice.auth())
    client.post(
        f"/habits/{habit['id']}/reminders", json={"time_local": "08:30"}, headers=alice.auth()
    )
    assert run(at(7, 31), Outbox()) == 0


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


def _sent_path(outbox, url_field):
    return getattr(outbox.sent[0][1], url_field).removeprefix("https://habits.test")


def test_skip_link_skips_the_day_and_shares_the_single_use(client, alice, reminder):
    outbox = Outbox()
    run(at(7, 30), outbox)
    assert outbox.sent[0][1].message == ""
    assert client.post(_sent_path(outbox, "skip_url")).status_code == 204
    assert client.post(_sent_path(outbox, "done_url")).status_code == 404
    assert client.get("/today", headers=alice.auth()).json()["items"][0]["status"] == "skipped"


def test_snooze_link_reminds_again_in_an_hour_with_fresh_buttons(client, clock, alice, reminder):
    outbox = Outbox()
    run(at(7, 30), outbox)
    clock.now = at(7, 31)
    assert client.post(_sent_path(outbox, "snooze_url")).status_code == 204
    assert run(at(8, 30), outbox) == 0
    assert run(at(8, 31), outbox) == 1
    assert run(at(8, 35), outbox) == 0
    clock.now = at(8, 32)
    assert client.post(_sent_path(outbox, "done_url")).status_code == 204
    assert run(at(9, 30), outbox) == 0


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


TOKEN = "ExponentPushToken[abc123]"


def test_push_device_registration_is_idempotent_and_hidden_from_channels(client, alice, bob):
    for _ in range(2):
        r = client.put("/push-devices", json={"token": TOKEN}, headers=alice.auth())
        assert r.status_code == 204
    # the same phone signing in as another user takes the token over
    client.put("/push-devices", json={"token": TOKEN}, headers=bob.auth())
    with get_sessionmaker()() as db:
        owners = [c.user_id for c in db.query(NotificationChannel).filter_by(type="expo")]
    assert len(owners) == 1
    assert client.get("/channels", headers=bob.auth()).json() == []
    client.post("/push-devices/unregister", json={"token": TOKEN}, headers=bob.auth())
    with get_sessionmaker()() as db:
        assert db.query(NotificationChannel).filter_by(type="expo").count() == 0


def test_push_token_must_look_like_an_expo_token(client, alice):
    r = client.put("/push-devices", json={"token": "nope"}, headers=alice.auth())
    assert r.status_code == 422


def test_reminder_goes_to_the_push_device_and_skips_done_habits(client, alice, reminder):
    client.put("/push-devices", json={"token": TOKEN}, headers=alice.auth())
    seen = []

    def fake(config, notification):
        seen.append((config, notification))

    with get_sessionmaker()() as db:
        from app.notifications import scheduler

        old = scheduler.SENDERS.copy()
        scheduler.SENDERS.update(ntfy=fake, expo=fake)
        try:
            assert send_due_reminders(db, at(7, 31), "test-secret", "https://habits.test") == 1
        finally:
            scheduler.SENDERS.update(old)
    assert {c.get("token") for c, _ in seen} == {TOKEN, None}
    assert all(n.habit_id == reminder["habit"]["id"] for _, n in seen)


def test_dead_push_device_is_dropped(client, alice, reminder):
    client.put("/push-devices", json={"token": TOKEN}, headers=alice.auth())

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"data": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}
        )

    http = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(DeviceNotRegistered):
        send_expo({"token": TOKEN}, Notification("t", "m", "u", 1), client=http)

    from app.notifications import scheduler

    def dead(config, notification):
        raise DeviceNotRegistered(config["token"])

    old = scheduler.SENDERS.copy()
    scheduler.SENDERS.update(expo=dead, ntfy=lambda c, n: None)
    try:
        with get_sessionmaker()() as db:
            send_due_reminders(db, at(7, 31), "test-secret", "https://habits.test")
    finally:
        scheduler.SENDERS.update(old)
    with get_sessionmaker()() as db:
        assert db.query(NotificationChannel).filter_by(type="expo").count() == 0


def test_send_expo_payload():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = request.read()
        return httpx.Response(200, json={"data": {"status": "ok"}})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    send_expo(
        {"token": TOKEN}, Notification("Leer", "Pendiente de hoy", "https://h/d", 7), client=http
    )
    assert TOKEN.encode() in seen["body"]
    assert b'"habitId":7' in seen["body"]
    assert b'"categoryId":"habit-reminder"' in seen["body"]
    assert b'"doneUrl":"https://h/d"' in seen["body"]


def test_notifications_without_a_done_link_have_no_button():
    bodies = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(request.read())
        return httpx.Response(200, json={"data": {"status": "ok"}})

    def http() -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(handler))

    plain = Notification("SmartHabits", "Test notification")
    send_ntfy({"server": "https://ntfy.example/", "topic": "t"}, plain, client=http())
    send_expo({"token": TOKEN}, plain, client=http())
    assert b'"actions"' not in bodies[0]
    assert b'"categoryId"' not in bodies[1]
