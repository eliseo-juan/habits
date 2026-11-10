from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

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
    attributes: Callable[[Today], dict[str, Any]] | None = None


def _habits(today: Today) -> dict[str, Any]:
    """Every habit due today with what a display needs: color, icon and status."""
    return {
        "habits": [
            {
                "id": item.habit_id,
                "name": item.name,
                "color": item.color,
                "icon": item.icon,
                "status": item.status,
                "done_count": item.done_count,
                "times_per_day": item.times_per_day,
                "priority": item.priority,
            }
            for item in today.items
            if item.to_do
        ]
    }


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
        attributes=_habits,
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
    _unrecorded_attributes = frozenset({"habits"})

    def __init__(self, coordinator, description: HabitsSensorDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> int:
        return self.entity_description.value(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self.entity_description.attributes is None:
            return None
        return self.entity_description.attributes(self.coordinator.data)
