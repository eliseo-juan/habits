import httpx

PUSH_URL = "https://exp.host/--/api/v2/push/send"


class DeviceNotRegistered(Exception):
    """The push service says the token is dead (app uninstalled or token rotated)."""


def send_expo(config: dict, notification, client: httpx.Client | None = None) -> None:
    """Sends a native push through Expo's push service, which relays to FCM / APNs."""
    body = {
        "to": config["token"],
        "title": notification.title,
        "priority": "high",
        "channelId": "reminders",
        "data": {
            "habitId": notification.habit_id,
            "doneUrl": notification.done_url,
            "skipUrl": notification.skip_url,
            "snoozeUrl": notification.snooze_url,
        },
    }
    if notification.message:
        body["body"] = notification.message
    if notification.done_url:
        body["categoryId"] = (
            "habit-reminder"  # gives the notification its Hecho / Ignorar / Posponer buttons
        )
    with client or httpx.Client(timeout=10) as http:
        response = http.post(PUSH_URL, json=body, headers={"Accept": "application/json"})
        response.raise_for_status()
    ticket = response.json().get("data") or {}
    if ticket.get("status") == "ok":
        return
    if (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
        raise DeviceNotRegistered(config["token"])
    raise RuntimeError(f"expo push failed: {ticket.get('message', ticket)}")
