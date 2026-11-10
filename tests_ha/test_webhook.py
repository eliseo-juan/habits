from unittest.mock import patch

from homeassistant.config_entries import ConfigEntryState
from homeassistant.helpers.network import NoURLAvailableError

from .conftest import URL, WEBHOOK_ID, WEBHOOK_URL, item, today_body


def calls(aioclient_mock, method, path):
    return [c for c in aioclient_mock.mock_calls if c[0] == method and str(c[1]) == URL + path]


async def setup(hass, entry, aioclient_mock, webhooks_status=201):
    aioclient_mock.get(f"{URL}/today", json=today_body(item(1, "Meditar")))
    aioclient_mock.post(f"{URL}/webhooks", status=webhooks_status, json={})
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_setup_subscribes_the_local_webhook_url(hass, aioclient_mock, entry, internal_url):
    await setup(hass, entry, aioclient_mock)

    [subscription] = calls(aioclient_mock, "POST", "/webhooks")
    assert subscription[2] == {"url": WEBHOOK_URL}


async def test_a_ping_refreshes_today(
    hass, aioclient_mock, entry, internal_url, hass_client_no_auth
):
    await setup(hass, entry, aioclient_mock)
    aioclient_mock.clear_requests()
    aioclient_mock.get(f"{URL}/today", json=today_body(item(1, "Meditar", status="done")))
    client = await hass_client_no_auth()

    response = await client.post(f"/api/webhook/{WEBHOOK_ID}")
    await hass.async_block_till_done()

    assert response.status == 200
    assert len(calls(aioclient_mock, "GET", "/today")) == 1
    assert hass.states.get("sensor.eliseo_done_today").state == "1"


async def test_without_a_local_url_it_still_loads(hass, aioclient_mock, entry):
    with patch(
        "custom_components.habits.webhook.async_generate_url", side_effect=NoURLAvailableError
    ):
        await setup(hass, entry, aioclient_mock)

    assert entry.state is ConfigEntryState.LOADED
    assert calls(aioclient_mock, "POST", "/webhooks") == []


async def test_a_failed_subscription_still_loads(hass, aioclient_mock, entry, internal_url):
    await setup(hass, entry, aioclient_mock, webhooks_status=500)

    assert entry.state is ConfigEntryState.LOADED


async def test_removing_the_entry_unsubscribes(hass, aioclient_mock, entry, internal_url):
    await setup(hass, entry, aioclient_mock)
    aioclient_mock.get(
        f"{URL}/webhooks",
        json=[{"id": 3, "url": "http://other/hook"}, {"id": 4, "url": WEBHOOK_URL}],
    )
    aioclient_mock.delete(f"{URL}/webhooks/4", status=204)

    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert len(calls(aioclient_mock, "DELETE", "/webhooks/4")) == 1
    assert calls(aioclient_mock, "DELETE", "/webhooks/3") == []
