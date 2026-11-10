from aiohttp.web import Request
from homeassistant.components import webhook
from homeassistant.const import CONF_TOKEN, CONF_URL, CONF_WEBHOOK_ID, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.network import NoURLAvailableError

from .api import HabitsClient, HabitsError
from .const import DOMAIN, LOGGER
from .coordinator import HabitsConfigEntry, HabitsCoordinator

PLATFORMS = [Platform.SENSOR, Platform.TODO]


async def async_setup_entry(hass: HomeAssistant, entry: HabitsConfigEntry) -> bool:
    coordinator = HabitsCoordinator(hass, entry, _client(hass, entry))
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    async def handle_change(_hass: HomeAssistant, _webhook_id: str, _request: Request) -> None:
        await coordinator.async_request_refresh()

    webhook.async_register(
        hass,
        DOMAIN,
        entry.title,
        entry.data[CONF_WEBHOOK_ID],
        handle_change,
        local_only=True,
        allowed_methods=["POST"],
    )
    entry.async_on_unload(lambda: webhook.async_unregister(hass, entry.data[CONF_WEBHOOK_ID]))
    await _subscribe(hass, entry)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: HabitsConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: HabitsConfigEntry) -> None:
    try:
        await _client(hass, entry).unsubscribe(_webhook_url(hass, entry))
    except (HabitsError, NoURLAvailableError) as error:
        LOGGER.warning("Could not unsubscribe the webhook from Habits: %s", error)


async def _subscribe(hass: HomeAssistant, entry: HabitsConfigEntry) -> None:
    """Without a subscription the integration still works, only on the polling interval."""
    try:
        await entry.runtime_data.client.subscribe(_webhook_url(hass, entry))
    except NoURLAvailableError:
        LOGGER.warning(
            "Home Assistant has no local network URL; set one in Settings > System > Network "
            "for instant updates from Habits"
        )
    except HabitsError as error:
        LOGGER.warning("Could not subscribe to Habits changes: %s", error)


def _webhook_url(hass: HomeAssistant, entry: HabitsConfigEntry) -> str:
    return webhook.async_generate_url(
        hass, entry.data[CONF_WEBHOOK_ID], allow_external=False, prefer_external=False
    )


def _client(hass: HomeAssistant, entry: HabitsConfigEntry) -> HabitsClient:
    return HabitsClient(async_get_clientsession(hass), entry.data[CONF_URL], entry.data[CONF_TOKEN])
