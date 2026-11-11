import httpx
import pytest

from app.services import webhooks
from tests.test_api import create_habit
from tests.test_mcp import call

HOOK = "http://ha.lan:8123/api/webhook/abc"


@pytest.fixture
def delivered(monkeypatch):
    urls = []
    monkeypatch.setattr(webhooks, "deliver", urls.append)
    return urls


def subscribe(client, account, url=HOOK):
    return client.post("/webhooks", json={"url": url}, headers=account.auth())


def test_subscribing_twice_returns_the_same_webhook(client, alice):
    first = subscribe(client, alice)
    again = subscribe(client, alice)

    assert first.status_code == 201
    assert again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    assert client.get("/webhooks", headers=alice.auth("read")).json() == [first.json()]


def test_read_tokens_cannot_subscribe(client, alice):
    response = client.post("/webhooks", json={"url": HOOK}, headers=alice.auth("read"))

    assert response.status_code == 403


def test_only_http_urls_are_accepted(client, alice):
    assert subscribe(client, alice, "file:///etc/passwd").status_code == 422


def test_subscriptions_are_capped(client, alice):
    for n in range(webhooks.MAX_PER_USER):
        assert subscribe(client, alice, f"{HOOK}{n}").status_code == 201

    assert subscribe(client, alice, f"{HOOK}-extra").status_code == 422


def test_log_changes_notify_only_the_owners_webhooks(client, alice, bob, delivered):
    subscribe(client, alice)
    subscribe(client, bob, "http://bob.lan/hook")
    habit = create_habit(client, alice)
    delivered.clear()
    logs = f"/habits/{habit['id']}/logs/2026-11-09"

    client.post(f"{logs}/done", headers=alice.auth())
    client.put(logs, json={"done_count": 1}, headers=alice.auth())
    client.delete(logs, headers=alice.auth())

    assert delivered == [HOOK, HOOK, HOOK]


def test_habit_changes_notify(client, alice, delivered):
    subscribe(client, alice)

    habit = create_habit(client, alice)
    client.patch(f"/habits/{habit['id']}", json={"name": "Read"}, headers=alice.auth())
    client.post(
        f"/habits/{habit['id']}/schedules",
        json={"effective_from": "2026-11-09", "type": "daily"},
        headers=alice.auth(),
    )
    client.delete(f"/habits/{habit['id']}", headers=alice.auth())

    assert delivered == [HOOK] * 4


def test_marks_from_the_mcp_notify(client, alice, delivered):
    subscribe(client, alice)
    habit = create_habit(client, alice)
    delivered.clear()

    call(client, alice, "mark_done", habit_id=habit["id"])

    assert delivered == [HOOK]


def test_rejected_writes_do_not_notify(client, alice, delivered):
    subscribe(client, alice)
    habit = create_habit(client, alice)
    delivered.clear()

    client.post(f"/habits/{habit['id']}/logs/2026-12-01/done", headers=alice.auth())

    assert delivered == []


def test_unsubscribed_webhooks_stop_receiving(client, alice, bob, delivered):
    webhook = subscribe(client, alice).json()

    assert client.delete(f"/webhooks/{webhook['id']}", headers=bob.auth()).status_code == 404
    assert client.delete(f"/webhooks/{webhook['id']}", headers=alice.auth()).status_code == 204
    create_habit(client, alice)

    assert delivered == []


def test_a_failing_subscriber_does_not_raise(monkeypatch):
    def refuse(url, **_):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "post", refuse)

    webhooks._post(HOOK)
