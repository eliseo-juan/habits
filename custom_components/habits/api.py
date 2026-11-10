from dataclasses import dataclass
from datetime import date
from typing import Any

from aiohttp import ClientError, ClientResponseError, ClientSession


class HabitsError(Exception):
    pass


class HabitsAuthError(HabitsError):
    pass


@dataclass(frozen=True)
class TodayItem:
    habit_id: int
    name: str
    status: str
    done_count: int
    times_per_day: int

    @property
    def settled(self) -> bool:
        return self.status in ("done", "skipped")


@dataclass(frozen=True)
class Today:
    day: date
    items: list[TodayItem]


class HabitsClient:
    def __init__(self, session: ClientSession, url: str, token: str) -> None:
        self._session = session
        self._url = url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"}

    async def me(self) -> dict[str, Any]:
        return await self._request("GET", "/me")

    async def today(self) -> Today:
        body = await self._request("GET", "/today")
        return Today(
            day=date.fromisoformat(body["date"]),
            items=[
                TodayItem(
                    habit_id=item["habit_id"],
                    name=item["name"],
                    status=item["status"],
                    done_count=item["done_count"],
                    times_per_day=item["times_per_day"],
                )
                for item in body["items"]
            ],
        )

    async def add_done(self, habit_id: int, day: date, count: int) -> None:
        await self._request(
            "POST", f"/habits/{habit_id}/logs/{day.isoformat()}/done", json={"count": count}
        )

    async def clear_day(self, habit_id: int, day: date) -> None:
        await self._request("DELETE", f"/habits/{habit_id}/logs/{day.isoformat()}")

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            async with self._session.request(
                method, self._url + path, headers=self._headers, **kwargs
            ) as response:
                if response.status in (401, 403):
                    raise HabitsAuthError(f"{method} {path} answered {response.status}")
                response.raise_for_status()
                if response.status == 204:
                    return None
                return await response.json()
        except ClientResponseError as error:
            raise HabitsError(f"{method} {path} answered {error.status}") from error
        except (ClientError, TimeoutError) as error:
            raise HabitsError(f"{method} {path} failed: {error}") from error
