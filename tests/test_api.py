DAILY = {"type": "daily"}


def create_habit(client, account, **overrides):
    body = {"name": "Meditate", "start_date": "2026-11-01", "schedule": DAILY} | overrides
    response = client.post("/habits", json=body, headers=account.auth())
    assert response.status_code == 201, response.text
    return response.json()


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_requests_without_credentials_are_rejected(client):
    response = client.get("/habits")
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_create_and_read_habit(client, alice):
    habit = create_habit(client, alice, schedule={"type": "weekdays", "weekdays": [0, 2, 4]})
    assert habit["schedule"] == {
        "type": "weekdays",
        "times_per_day": 1,
        "weekdays": [0, 2, 4],
        "period_unit": None,
        "period_target": None,
        "effective_from": "2026-11-01",
    }
    assert client.get(f"/habits/{habit['id']}", headers=alice.auth("read")).json()["name"] == "Meditate"


def test_start_date_defaults_to_users_today(client, alice):
    habit = create_habit(client, alice, start_date=None)
    assert habit["start_date"] == "2026-11-09"


def test_end_date_before_start_is_422(client, alice):
    response = client.post(
        "/habits",
        json={"name": "x", "start_date": "2026-11-05", "end_date": "2026-11-01", "schedule": DAILY},
        headers=alice.auth(),
    )
    assert response.status_code == 422
    assert set(response.json()) == {"code", "message"}


def test_invalid_schedule_is_422(client, alice):
    response = client.post(
        "/habits", json={"name": "x", "schedule": {"type": "times_per_period", "period_unit": "week"}}, headers=alice.auth()
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_read_token_cannot_write(client, alice):
    response = client.post("/habits", json={"name": "x", "schedule": DAILY}, headers=alice.auth("read"))
    assert response.status_code == 403


def test_delete_archives_and_keeps_history(client, alice):
    habit = create_habit(client, alice)
    client.post(f"/habits/{habit['id']}/logs/2026-11-08/done", headers=alice.auth())
    assert client.delete(f"/habits/{habit['id']}", headers=alice.auth()).status_code == 204
    assert client.get("/habits", headers=alice.auth()).json() == []
    archived = client.get("/habits?include_archived=true", headers=alice.auth()).json()
    assert archived[0]["archived"] is True
    stats = client.get(f"/habits/{habit['id']}/stats", headers=alice.auth()).json()
    assert stats["done"] == 1


def test_mark_and_correct_past_days(client, alice):
    habit = create_habit(client, alice, schedule={"type": "daily", "times_per_day": 2})
    url = f"/habits/{habit['id']}/logs/2026-11-03"
    first = client.post(f"{url}/done", headers=alice.auth()).json()
    assert first["done_count"] == 1
    assert first["source"] == "test-write"
    assert client.post(f"{url}/done", json={"count": 1}, headers=alice.auth()).json()["done_count"] == 2

    put = {"done_count": 0, "skipped": True, "note": "sick"}
    assert client.put(url, json=put, headers=alice.auth()).json()["skipped"] is True
    assert client.put(url, json=put, headers=alice.auth()).json()["skipped"] is True

    assert client.delete(url, headers=alice.auth()).status_code == 204
    assert client.delete(url, headers=alice.auth()).status_code == 404


def test_future_day_cannot_be_done(client, alice):
    habit = create_habit(client, alice)
    response = client.post(f"/habits/{habit['id']}/logs/2026-11-10/done", headers=alice.auth())
    assert response.status_code == 422


def test_today_uses_user_timezone(client, alice, clock):
    habit = create_habit(client, alice)
    clock.now = clock.now.replace(hour=23, minute=30)
    today = client.get("/today", headers=alice.auth()).json()
    assert today["date"] == "2026-11-10"
    assert today["items"][0]["habit_id"] == habit["id"]
    assert today["items"][0]["status"] == "pending"


def test_today_hides_times_per_week_once_target_met(client, alice):
    habit = create_habit(client, alice, schedule={"type": "times_per_period", "period_unit": "week", "period_target": 2})
    client.post(f"/habits/{habit['id']}/logs/2026-11-09/done", headers=alice.auth())
    item = client.get("/today", headers=alice.auth()).json()["items"][0]
    assert (item["period_done"], item["period_target"], item["status"]) == (1, 2, "done")

    client.post(f"/habits/{habit['id']}/logs/2026-11-08/done", headers=alice.auth())
    client.delete(f"/habits/{habit['id']}/logs/2026-11-09", headers=alice.auth())
    assert client.get("/today?date=2026-11-10", headers=alice.auth()).json()["items"][0]["status"] == "pending"


def test_schedule_change_from_past_date_keeps_logs(client, alice):
    habit = create_habit(client, alice)
    client.post(f"/habits/{habit['id']}/logs/2026-11-03/done", headers=alice.auth())
    response = client.post(
        f"/habits/{habit['id']}/schedules",
        json={"effective_from": "2026-11-02", "type": "weekdays", "weekdays": [0]},
        headers=alice.auth(),
    )
    assert response.status_code == 201
    assert [s["effective_from"] for s in response.json()["schedules"]] == ["2026-11-01", "2026-11-02"]
    month = client.get("/stats/month?month=2026-11", headers=alice.auth()).json()
    days = month["habits"][0]["days"]
    assert days["2026-11-03"] == "done"
    assert days["2026-11-04"] == "not_due"
    assert days["2026-11-02"] == "failed"


def test_month_and_year_views(client, alice):
    habit = create_habit(client, alice)
    for day in range(1, 9):
        client.post(f"/habits/{habit['id']}/logs/2026-11-{day:02d}/done", headers=alice.auth())
    month = client.get("/stats/month?month=2026-11", headers=alice.auth()).json()
    assert month["habits"][0]["percentage"] == 100.0
    assert month["habits"][0]["days"]["2026-11-09"] == "pending"
    assert month["habits"][0]["days"]["2026-11-20"] == "pending"
    year = client.get("/stats/year?year=2026", headers=alice.auth()).json()
    months = {m["month"]: m["percentage"] for m in year["habits"][0]["months"]}
    assert months["2026-11"] == 100.0
    assert months["2026-10"] is None
    assert len(year["habits"][0]["days"]) == 365
    assert client.get("/stats/month?month=2026-13", headers=alice.auth()).status_code == 422


def test_habit_stats_streaks(client, alice):
    habit = create_habit(client, alice)
    for day in (1, 2, 3, 5, 6, 7, 8):
        client.post(f"/habits/{habit['id']}/logs/2026-11-{day:02d}/done", headers=alice.auth())
    stats = client.get(f"/habits/{habit['id']}/stats", headers=alice.auth()).json()
    assert (stats["current_streak"], stats["best_streak"], stats["failed"]) == (4, 4, 1)
    ranged = client.get(f"/habits/{habit['id']}/stats?from=2026-11-01&to=2026-11-03", headers=alice.auth()).json()
    assert ranged["percentage"] == 100.0
    assert client.get(f"/habits/{habit['id']}/stats?from=2026-11-05&to=2026-11-01", headers=alice.auth()).status_code == 422


def test_stats_start_date_change_keeps_logs(client, alice):
    habit = create_habit(client, alice)
    client.post(f"/habits/{habit['id']}/logs/2026-11-08/done", headers=alice.auth())
    before = client.get(f"/habits/{habit['id']}/stats", headers=alice.auth()).json()
    client.patch(f"/habits/{habit['id']}", json={"stats_start_date": "2026-11-08"}, headers=alice.auth())
    after = client.get(f"/habits/{habit['id']}/stats", headers=alice.auth()).json()
    assert before["percentage"] < after["percentage"] == 100.0
    month = client.get("/stats/month?month=2026-11", headers=alice.auth()).json()
    assert month["habits"][0]["days"]["2026-11-08"] == "done"


def test_awtrix_summary_with_read_token(client, alice):
    meditate = create_habit(client, alice)
    create_habit(client, alice, name="Read")
    client.post(f"/habits/{meditate['id']}/logs/2026-11-08/done", headers=alice.auth())
    client.post(f"/habits/{meditate['id']}/logs/2026-11-09/done", headers=alice.auth())
    summary = client.get("/awtrix/today", headers=alice.auth("read")).json()
    assert (summary["pending"], summary["done"], summary["total"]) == (1, 1, 2)
    assert summary["pending_habits"][0]["name"] == "Read"
    assert summary["top_streaks"] == [{"name": "Meditate", "streak": 2}]
    response = client.post(f"/habits/{meditate['id']}/logs/2026-11-07/done", headers=alice.auth("read"))
    assert response.status_code == 403


def test_reminders_crud(client, alice):
    habit = create_habit(client, alice)
    created = client.post(
        f"/habits/{habit['id']}/reminders", json={"time_local": "08:30", "weekdays": [0, 1]}, headers=alice.auth()
    ).json()
    assert created["time_local"] == "08:30:00"
    updated = client.patch(f"/reminders/{created['id']}", json={"weekdays": None}, headers=alice.auth()).json()
    assert updated["weekdays"] is None
    assert len(client.get(f"/habits/{habit['id']}/reminders", headers=alice.auth()).json()) == 1
    assert client.delete(f"/reminders/{created['id']}", headers=alice.auth()).status_code == 204


def test_login_session_and_tokens(client, alice):
    assert client.post("/auth/login", json={"email": alice.email, "password": "nope"}).status_code == 401
    assert client.post("/tokens", json={"name": "x", "scope": "read"}, headers=alice.auth()).status_code == 403

    login = client.post("/auth/login", json={"email": "ALICE@example.com", "password": "secret-password"})
    assert login.status_code == 200
    created = client.post("/tokens", json={"name": "mcp", "scope": "write"})
    assert created.status_code == 201
    token = created.json()["token"]
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).json()["email"] == alice.email
    names = [t["name"] for t in client.get("/tokens").json()]
    assert names == ["test-write", "awtrix", "mcp"]
    assert "token" not in client.get("/tokens").json()[0]
    assert client.delete(f"/tokens/{created.json()['id']}").status_code == 204
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401

    client.post("/auth/logout")
    client.cookies.clear()
    assert client.get("/me").status_code == 401


def test_update_me_timezone(client, alice):
    assert client.patch("/me", json={"timezone": "Mars/Base"}, headers=alice.auth()).status_code == 422
    me = client.patch("/me", json={"timezone": "America/New_York"}, headers=alice.auth()).json()
    assert me["timezone"] == "America/New_York"


def test_channels_hide_access_token(client, alice):
    created = client.post(
        "/channels", json={"config": {"topic": "alice-habits", "access_token": "tk_secret"}}, headers=alice.auth()
    ).json()
    assert created["has_access_token"] is True
    assert "tk_secret" not in str(client.get("/channels", headers=alice.auth()).json())


def test_other_users_resources_are_not_found(client, alice, bob):
    habit = create_habit(client, alice)
    reminder = client.post(f"/habits/{habit['id']}/reminders", json={"time_local": "08:00"}, headers=alice.auth()).json()
    channel = client.post("/channels", json={"config": {"topic": "alice"}}, headers=alice.auth()).json()
    h = f"/habits/{habit['id']}"
    attempts = [
        ("get", h, None),
        ("patch", h, {"name": "mine"}),
        ("delete", h, None),
        ("post", f"{h}/schedules", {"effective_from": "2026-11-01", "type": "daily"}),
        ("put", f"{h}/logs/2026-11-08", {"done_count": 1}),
        ("post", f"{h}/logs/2026-11-08/done", None),
        ("delete", f"{h}/logs/2026-11-08", None),
        ("get", f"{h}/stats", None),
        ("get", f"{h}/reminders", None),
        ("post", f"{h}/reminders", {"time_local": "09:00"}),
        ("patch", f"/reminders/{reminder['id']}", {"enabled": False}),
        ("delete", f"/reminders/{reminder['id']}", None),
        ("patch", f"/channels/{channel['id']}", {"enabled": False}),
        ("delete", f"/channels/{channel['id']}", None),
    ]
    for method, url, body in attempts:
        response = client.request(method, url, json=body, headers=bob.auth())
        assert response.status_code == 404, (method, url, response.status_code)
    assert client.get("/habits", headers=bob.auth()).json() == []
    assert client.get("/today", headers=bob.auth()).json()["items"] == []
    assert client.get("/stats/month?month=2026-11", headers=bob.auth()).json()["habits"] == []
    assert client.get("/channels", headers=bob.auth()).json() == []
    assert client.get(h, headers=alice.auth()).json()["name"] == "Meditate"


def test_tokens_of_other_users_cannot_be_revoked(client, alice, bob):
    client.post("/auth/login", json={"email": alice.email, "password": "secret-password"})
    alice_token_id = client.get("/tokens").json()[0]["id"]
    client.cookies.clear()
    client.post("/auth/login", json={"email": bob.email, "password": "secret-password"})
    assert client.delete(f"/tokens/{alice_token_id}").status_code == 404
    assert client.get("/me", headers=alice.auth()).status_code == 200
