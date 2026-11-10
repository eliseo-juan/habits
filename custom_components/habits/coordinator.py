from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import HabitsAuthError, HabitsClient, HabitsError, Today
from .const import DOMAIN, LOGGER, SCAN_INTERVAL

type HabitsConfigEntry = ConfigEntry[HabitsCoordinator]


class HabitsCoordinator(DataUpdateCoordinator[Today]):
    def __init__(self, hass: HomeAssistant, entry: HabitsConfigEntry, client: HabitsClient) -> None:
        super().__init__(
            hass,
            logger=LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=SCAN_INTERVAL,
        )
        self.client = client

    async def _async_update_data(self) -> Today:
        try:
            return await self.client.today()
        except HabitsAuthError as error:
            raise ConfigEntryAuthFailed(str(error)) from error
        except HabitsError as error:
            raise UpdateFailed(str(error)) from error
