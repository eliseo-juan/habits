import httpx
import pytest

from app.admin import _channel_target
from app.db import get_sessionmaker
from app.models import NotificationChannel, NotificationLog
from app.notifications import scheduler
from app.services.users import create_user
from tests.conftest import NOW

PASSWORD = "admin-password"


class Outbox:
    def __init__(self):
        self.sent = []

    def __call__(self, config, notification):
        self.sent.append((config, notification))


@pytest.fixture
def outbox(monkeypatch) -> Outbox:
    box = Outbox()
    monkeypatch.setitem(scheduler.SENDERS, "expo", box)
    return box


@pytest.fixture
def admin(db):
    create_user(db, "root@example.com", "root", PASSWORD, "Europe/Madrid", "admin", NOW)
    db.commit()


def login(client, email: str, password: str) -> httpx.Response:
    return client.post("/admin/login", data={"username": email, "password": password})


@pytest.fixture
def reminder(client, alice):
    habit = client.post(
        "/habits",
        json={"name": "Meditate", "start_date": "2026-11-01", "schedule": {"type": "daily"}},
        headers=alice.auth(),
    ).json()
    client.put(
        "/push-devices",
        json={"token": "ExponentPushToken[abcdefghijklmnopqrstSECRETTAIL]"},
        headers=alice.auth(),
    )
    return client.post(
        f"/habits/{habit['id']}/reminders", json={"time_local": "20:00"}, headers=alice.auth()
    ).json()


def test_anonymous_visitors_are_sent_to_the_login(client):
    r = client.get("/admin/habit/list", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"].endswith("/admin/login")


def test_only_admins_can_sign_in(client, alice, admin):
    assert login(client, alice.email, "secret-password").status_code == 400
    assert login(client, "root@example.com", "wrong").status_code == 400
    r = login(client, "root@example.com", PASSWORD)
    assert r.status_code == 200
    assert client.get("/admin/habit/list").status_code == 200


def test_a_regular_web_session_does_not_open_the_admin(client, alice):
    client.post("/auth/login", json={"email": alice.email, "password": "secret-password"})
    r = client.get("/admin/habit/list", follow_redirects=False)
    assert r.status_code == 302


def test_secrets_never_show_up(client, admin, reminder):
    login(client, "root@example.com", PASSWORD)
    pages = [
        client.get("/admin/user/list").text,
        client.get("/admin/user/details/1").text,
        client.get("/admin/api-token/list").text,
        client.get("/admin/notification-channel/list").text,
        client.get("/admin/notification-channel/details/1").text,
        client.get("/admin/user/export/csv").text,
        client.get("/admin/notification-channel/export/csv").text,
    ]
    for page in pages:
        assert "argon2" not in page
        assert "SECRETTAIL" not in page


def test_channels_show_only_where_they_deliver():
    expo = NotificationChannel(type="expo", config={"token": "ExponentPushToken[abcdefghijklmnop]"})
    assert _channel_target(expo) == "ExponentPushToken[abcdefghijkl…"


def test_data_is_read_only(client, admin, reminder):
    login(client, "root@example.com", PASSWORD)
    assert client.get("/admin/habit/create").status_code == 403
    assert client.get("/admin/habit/edit/1").status_code == 403
    assert client.delete("/admin/habit/delete?pks=1").status_code == 403


def test_test_notification_reaches_the_channel_without_a_done_button(
    client, admin, reminder, outbox
):
    login(client, "root@example.com", PASSWORD)
    r = client.get("/admin/notification-channel/action/send-test?pks=1")
    assert r.status_code == 200
    assert "Test → expo #1: sent" in r.text
    config, notification = outbox.sent[0]
    assert config["token"] == "ExponentPushToken[abcdefghijklmnopqrstSECRETTAIL]"
    assert notification.done_url is None


def test_send_now_delivers_todays_reminder_once(client, admin, alice, reminder, outbox):
    login(client, "root@example.com", PASSWORD)
    client.get(f"/admin/reminder/action/send-now?pks={reminder['id']}")
    client.get(f"/admin/reminder/action/send-now?pks={reminder['id']}")
    assert len(outbox.sent) == 1
    notification = outbox.sent[0][1]
    assert notification.title == "Meditate"
    with get_sessionmaker()() as db:
        assert db.get(NotificationLog, (reminder["id"], NOW.date())) is not None
    path = notification.done_url.removeprefix("http://localhost:8000")
    assert client.post(path).status_code == 204
    assert client.get("/today", headers=alice.auth()).json()["items"][0]["status"] == "done"
