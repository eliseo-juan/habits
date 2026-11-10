from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import HabitsError
from .coordinator import HabitsConfigEntry
from .entity import HabitsEntity

PARALLEL_UPDATES = 1


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HabitsConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([HabitsTodayList(entry.runtime_data)])


class HabitsTodayList(HabitsEntity, TodoListEntity):
    _attr_translation_key = "today"
    _attr_supported_features = TodoListEntityFeature.UPDATE_TODO_ITEM

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "today")

    @property
    def todo_items(self) -> list[TodoItem]:
        return [
            TodoItem(
                uid=str(item.habit_id),
                summary=item.name,
                status=TodoItemStatus.COMPLETED if item.settled else TodoItemStatus.NEEDS_ACTION,
                description=_progress(item),
            )
            for item in self.coordinator.data.items
            if item.to_do
        ]

    async def async_update_todo_item(self, item: TodoItem) -> None:
        today = self.coordinator.data
        current = next((i for i in today.items if i.to_do and str(i.habit_id) == item.uid), None)
        if current is None:
            raise HomeAssistantError(f"Habit {item.uid} is not due today")
        completing = item.status == TodoItemStatus.COMPLETED
        if completing == current.settled:
            return
        try:
            if completing:
                remaining = max(current.times_per_day - current.done_count, 1)
                await self.coordinator.client.add_done(current.habit_id, today.day, remaining)
            else:
                await self.coordinator.client.clear_day(current.habit_id, today.day)
        except HabitsError as error:
            raise HomeAssistantError(str(error)) from error
        await self.coordinator.async_request_refresh()


def _progress(item) -> str | None:
    if item.status == "skipped":
        return "skipped"
    if item.times_per_day > 1:
        return f"{item.done_count}/{item.times_per_day}"
    return None
