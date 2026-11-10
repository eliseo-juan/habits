from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResultType

from custom_components.habits.const import DOMAIN

from .conftest import ME, TOKEN, URL


async def start(hass):
    return await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )


async def test_creates_entry_named_after_the_account(hass, aioclient_mock):
    aioclient_mock.get(f"{URL}/me", json=ME)
    flow = await start(hass)

    result = await hass.config_entries.flow.async_configure(
        flow["flow_id"], {"url": URL + "/", "token": TOKEN}
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Eliseo"
    assert result["result"].unique_id == "7"
    assert aioclient_mock.mock_calls[0][3]["Authorization"] == f"Bearer {TOKEN}"


async def test_rejected_token_shows_invalid_auth(hass, aioclient_mock):
    aioclient_mock.get(f"{URL}/me", status=401)
    flow = await start(hass)

    result = await hass.config_entries.flow.async_configure(
        flow["flow_id"], {"url": URL, "token": "bad"}
    )

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "invalid_auth"}


async def test_unreachable_server_shows_cannot_connect(hass, aioclient_mock):
    aioclient_mock.get(f"{URL}/me", status=502)
    flow = await start(hass)

    result = await hass.config_entries.flow.async_configure(
        flow["flow_id"], {"url": URL, "token": TOKEN}
    )

    assert result["errors"] == {"base": "cannot_connect"}


async def test_same_account_twice_aborts(hass, aioclient_mock, entry):
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{URL}/me", json=ME)
    flow = await start(hass)

    result = await hass.config_entries.flow.async_configure(
        flow["flow_id"], {"url": URL, "token": TOKEN}
    )

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_reauth_replaces_the_token(hass, aioclient_mock, entry):
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{URL}/me", json=ME)
    aioclient_mock.get(f"{URL}/today", json={"date": "2026-11-10", "items": []})
    flow = await entry.start_reauth_flow(hass)

    result = await hass.config_entries.flow.async_configure(flow["flow_id"], {"token": "hab_new"})

    assert result["reason"] == "reauth_successful"
    assert entry.data == {"url": URL, "token": "hab_new"}


async def test_reauth_with_another_accounts_token_aborts(hass, aioclient_mock, entry):
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{URL}/me", json={**ME, "id": 8})
    flow = await entry.start_reauth_flow(hass)

    result = await hass.config_entries.flow.async_configure(flow["flow_id"], {"token": "hab_other"})

    assert result["reason"] == "wrong_account"
    assert entry.data["token"] == TOKEN
