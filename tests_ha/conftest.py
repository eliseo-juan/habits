import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.habits.const import DOMAIN

URL = "https://habits.test"
TOKEN = "hab_secret"
ME = {
    "id": 7,
    "email": "me@example.com",
    "display_name": "Eliseo",
    "timezone": "Europe/Madrid",
    "day_cutoff": "00:00:00",
    "role": "admin",
}


def today_body(*items):
    return {"date": "2026-11-10", "items": list(items)}


def item(habit_id, name, status="pending", done_count=0, times_per_day=1):
    return {
        "habit_id": habit_id,
        "name": name,
        "color": None,
        "icon": None,
        "priority": 0,
        "status": status,
        "done_count": done_count,
        "times_per_day": times_per_day,
        "period_done": None,
        "period_target": None,
    }


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    return


@pytest.fixture
def entry():
    return MockConfigEntry(
        domain=DOMAIN, title="Eliseo", unique_id="7", data={"url": URL, "token": TOKEN}
    )
