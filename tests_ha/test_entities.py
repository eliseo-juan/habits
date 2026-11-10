import pytest
from homeassistant.components.todo import DOMAIN as TODO_DOMAIN
from homeassistant.config_entries import ConfigEntryState
from homeassistant.exceptions import HomeAssistantError

from .conftest import URL, item, today_body

TODO = "todo.eliseo_today"


async def setup(hass, entry, aioclient_mock, *items):
    aioclient_mock.get(f"{URL}/today", json=today_body(*items))
    aioclient_mock.post(f"{URL}/webhooks", json={})
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def todo_items(hass):
    response = await hass.services.async_call(
        TODO_DOMAIN, "get_items", {"entity_id": TODO}, blocking=True, return_response=True
    )
    return response[TODO]["items"]


async def test_sensors_count_todays_habits(hass, aioclient_mock, entry):
    await setup(
        hass,
        entry,
        aioclient_mock,
        item(1, "Meditar"),
        item(2, "Leer", status="done", done_count=1),
        item(3, "Correr", status="skipped"),
        item(4, "Agua", done_count=1, times_per_day=3),
        item(5, "Azúcar", kind="limit"),
    )

    assert hass.states.get("sensor.eliseo_pending_today").state == "2"
    assert hass.states.get("sensor.eliseo_done_today").state == "1"
    assert hass.states.get("sensor.eliseo_due_today").state == "4"
    assert hass.states.get(TODO).state == "2"


async def test_due_sensor_exposes_habit_colors_and_status(hass, aioclient_mock, entry):
    await setup(
        hass,
        entry,
        aioclient_mock,
        item(1, "Meditar", color="#3a9bff", icon="mdi:meditation"),
        item(2, "Leer", status="done", done_count=1),
        item(5, "Azúcar", kind="limit", color="#ff0000"),
    )

    habits = hass.states.get("sensor.eliseo_due_today").attributes["habits"]

    assert habits == [
        {
            "id": 1,
            "name": "Meditar",
            "color": "#3a9bff",
            "icon": "mdi:meditation",
            "status": "pending",
            "done_count": 0,
            "times_per_day": 1,
            "priority": 0,
        },
        {
            "id": 2,
            "name": "Leer",
            "color": None,
            "icon": None,
            "status": "done",
            "done_count": 1,
            "times_per_day": 1,
            "priority": 0,
        },
    ]
    assert "habits" not in hass.states.get("sensor.eliseo_pending_today").attributes


async def test_todo_lists_habits_with_progress(hass, aioclient_mock, entry):
    await setup(
        hass,
        entry,
        aioclient_mock,
        item(1, "Meditar"),
        item(3, "Correr", status="skipped"),
        item(4, "Agua", done_count=1, times_per_day=3),
        item(5, "Azúcar", kind="limit"),
    )

    assert await todo_items(hass) == [
        {"uid": "1", "summary": "Meditar", "status": "needs_action"},
        {"uid": "3", "summary": "Correr", "status": "completed", "description": "skipped"},
        {"uid": "4", "summary": "Agua", "status": "needs_action", "description": "1/3"},
    ]


async def test_checking_a_habit_completes_its_remaining_count(hass, aioclient_mock, entry):
    await setup(hass, entry, aioclient_mock, item(4, "Agua", done_count=1, times_per_day=3))
    aioclient_mock.post(f"{URL}/habits/4/logs/2026-11-10/done", json={})

    await hass.services.async_call(
        TODO_DOMAIN,
        "update_item",
        {"entity_id": TODO, "item": "Agua", "status": "completed"},
        blocking=True,
    )

    post = next(call for call in aioclient_mock.mock_calls if str(call[1]).endswith("/done"))
    assert post[2] == {"count": 2}


async def test_unchecking_a_habit_clears_the_day(hass, aioclient_mock, entry):
    await setup(hass, entry, aioclient_mock, item(2, "Leer", status="done", done_count=1))
    aioclient_mock.delete(f"{URL}/habits/2/logs/2026-11-10", status=204)

    await hass.services.async_call(
        TODO_DOMAIN,
        "update_item",
        {"entity_id": TODO, "item": "Leer", "status": "needs_action"},
        blocking=True,
    )

    assert any(call[0] == "DELETE" for call in aioclient_mock.mock_calls)


async def test_server_error_on_check_surfaces_to_the_user(hass, aioclient_mock, entry):
    await setup(hass, entry, aioclient_mock, item(1, "Meditar"))
    aioclient_mock.post(f"{URL}/habits/1/logs/2026-11-10/done", status=403)

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            TODO_DOMAIN,
            "update_item",
            {"entity_id": TODO, "item": "Meditar", "status": "completed"},
            blocking=True,
        )


async def test_rejected_token_starts_reauth(hass, aioclient_mock, entry):
    aioclient_mock.get(f"{URL}/today", status=401)
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert any(
        flow["context"]["source"] == "reauth" for flow in hass.config_entries.flow.async_progress()
    )


async def test_unload(hass, aioclient_mock, entry):
    await setup(hass, entry, aioclient_mock, item(1, "Meditar"))

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED
