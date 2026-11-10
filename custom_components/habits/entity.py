from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import HabitsCoordinator


class HabitsEntity(CoordinatorEntity[HabitsCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coordinator: HabitsCoordinator, key: str) -> None:
        super().__init__(coordinator)
        entry = coordinator.config_entry
        self._attr_unique_id = f"{entry.unique_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.unique_id)},
            name=entry.title,
            entry_type=DeviceEntryType.SERVICE,
        )
