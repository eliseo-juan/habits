from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class Notification:
    title: str
    message: str
    done_url: str | None = None
    habit_id: int | None = None


def send_ntfy(config: dict, notification: Notification, client: httpx.Client | None = None) -> None:
    """Publishes through ntfy's JSON API, which carries UTF-8 titles that plain headers can't."""
    headers = (
        {"Authorization": f"Bearer {config['access_token']}"} if config.get("access_token") else {}
    )
    body = {
        "topic": config["topic"],
        "title": notification.title,
        "message": notification.message,
    }
    if notification.done_url:
        body["actions"] = [
            {
                "action": "http",
                "label": "Hecho",
                "url": notification.done_url,
                "method": "POST",
                "clear": True,
            }
        ]
    with client or httpx.Client(timeout=10) as http:
        http.post(
            str(config["server"]).rstrip("/") + "/", json=body, headers=headers
        ).raise_for_status()
