import json

MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def rpc(client, account, method, params=None, scope="write"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    headers = MCP_HEADERS | (account.auth(scope) if account else {})
    return client.post("/mcp", content=json.dumps(body), headers=headers, follow_redirects=False)


def call(client, account, tool, scope="write", **arguments):
    response = rpc(client, account, "tools/call", {"name": tool, "arguments": arguments}, scope)
    assert response.status_code == 200, response.text
    result = response.json()["result"]
    if result.get("isError"):
        return {"error": result["content"][0]["text"]}
    return result.get("structuredContent", {}).get("result", result.get("structuredContent"))


def test_mcp_requires_token(client):
    response = rpc(client, None, "tools/list")
    assert response.status_code == 401


def test_mcp_lists_tools(client, alice):
    response = rpc(client, alice, "tools/list")
    assert response.status_code == 200, response.text
    names = {tool["name"] for tool in response.json()["result"]["tools"]}
    assert {"today", "mark_done", "create_habit", "month_stats", "change_schedule"} <= names


def test_mcp_habit_flow(client, alice):
    habit = call(client, alice, "create_habit", name="Stretch", start_date="2026-11-01")
    assert habit["schedule"] == {
        "type": "daily",
        "times_per_day": 1,
        "effective_from": "2026-11-01",
    }

    done = call(client, alice, "mark_done", habit_id=habit["id"], day="2026-11-08")
    assert done == {
        "habit_id": habit["id"],
        "date": "2026-11-08",
        "done_count": 1,
        "skipped": False,
    }
    call(client, alice, "skip", habit_id=habit["id"], day="2026-11-07")

    today = call(client, alice, "today", scope="read")
    assert today["date"] == "2026-11-09"
    assert today["items"] == [
        {"id": habit["id"], "name": "Stretch", "kind": "build", "status": "pending", "done": "0/1"}
    ]

    month = call(client, alice, "month_stats", scope="read", month="2026-11")["habits"][0]
    assert month["days"][:9] == "------sx."

    stats = call(client, alice, "habit_stats", scope="read", habit_id=habit["id"])
    assert (stats["done"], stats["failed"], stats["skipped"]) == (1, 6, 1)

    logs = client.get(f"/habits/{habit['id']}/stats", headers=alice.auth()).json()
    assert logs["done"] == 1


def test_mcp_source_and_isolation(client, alice, bob):
    habit = call(client, alice, "create_habit", name="Stretch", start_date="2026-11-01")
    call(client, alice, "mark_done", habit_id=habit["id"])
    log = client.put(
        f"/habits/{habit['id']}/logs/2026-11-09", json={"done_count": 1}, headers=alice.auth()
    )
    assert log.json()["source"] == "test-write"

    assert "not found" in call(client, bob, "mark_done", habit_id=habit["id"])["error"]
    assert call(client, bob, "list_habits") == []


def test_mcp_read_token_cannot_write(client, alice):
    result = call(client, alice, "create_habit", scope="read", name="x")
    assert "read-only" in result["error"]


def test_mcp_change_schedule_keeps_logs(client, alice):
    habit = call(client, alice, "create_habit", name="Gym", start_date="2026-11-01")
    call(client, alice, "mark_done", habit_id=habit["id"], day="2026-11-03")
    changed = call(
        client,
        alice,
        "change_schedule",
        habit_id=habit["id"],
        effective_from="2026-11-02",
        schedule_type="times_per_period",
        period_unit="week",
        period_target=3,
    )
    assert changed["schedule"]["type"] == "times_per_period"
    month = call(client, alice, "month_stats", month="2026-11")["habits"][0]
    assert month["days"][2] == "x"


def test_mcp_limit_habit_counts_slips_against_the_allowance(client, alice):
    habit = call(
        client,
        alice,
        "create_habit",
        name="Sugar",
        kind="limit",
        schedule_type="times_per_period",
        period_unit="week",
        period_target=1,
        start_date="2026-11-02",
    )
    assert habit["kind"] == "limit"
    call(client, alice, "mark_done", habit_id=habit["id"], day="2026-11-03")

    month = call(client, alice, "month_stats", month="2026-11")["habits"][0]
    assert month["days"][1:8] == "xoxxxxx"

    call(client, alice, "mark_done", habit_id=habit["id"], day="2026-11-05")
    month = call(client, alice, "month_stats", month="2026-11")["habits"][0]
    assert month["days"][1:8] == "xox-xxx"
    assert month["percentage"] == 0.0

    today = call(client, alice, "today", scope="read")["items"][0]
    assert (today["kind"], today["status"], today["period"]) == ("limit", "pending", "0/1")
