from collections.abc import Callable
from dataclasses import dataclass

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription, SensorStateClass
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import Today
from .coordinator import HabitsConfigEntry
from .entity import HabitsEntity

PARALLEL_UPDATES = 0


@dataclass(frozen=True, kw_only=True)
class HabitsSensorDescription(SensorEntityDescription):
    value: Callable[[Today], int]


SENSORS = (
    HabitsSensorDescription(
        key="pending",
        translation_key="pending",
        state_class=SensorStateClass.MEASUREMENT,
        value=lambda today: sum(item.to_do and item.status == "pending" for item in today.items),
    ),
    HabitsSensorDescription(
        key="done",
        translation_key="done",
        state_class=SensorStateClass.MEASUREMENT,
        value=lambda today: sum(item.to_do and item.status == "done" for item in today.items),
    ),
    HabitsSensorDescription(
        key="due",
        translation_key="due",
        state_class=SensorStateClass.MEASUREMENT,
        value=lambda today: sum(item.to_do for item in today.items),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HabitsConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities(HabitsSensor(entry.runtime_data, description) for description in SENSORS)


class HabitsSensor(HabitsEntity, SensorEntity):
    entity_description: HabitsSensorDescription

    def __init__(self, coordinator, description: HabitsSensorDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> int:
        return self.entity_description.value(self.coordinator.data)
