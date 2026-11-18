import httpx

from app.notifications.message import Notification

PUSH_URL = "https://exp.host/--/api/v2/push/send"


class DeviceNotRegistered(Exception):
    """The push service says the token is dead (app uninstalled or token rotated)."""


def send_expo(config: dict, notification: Notification, client: httpx.Client | None = None) -> None:
    """Sends a native push through Expo's push service, which relays to FCM / APNs."""
    buttons = bool(notification.done_url)
    data = {
        "habitId": notification.habit_id,
        "doneUrl": notification.done_url,
        "skipUrl": notification.skip_url,
        "snoozeUrl": notification.snooze_url,
    }
    body: dict = {"to": config["token"], "priority": "high", "data": data}
    if buttons and config.get("platform") == "android":
        # Android shows a push that carries a title and body by itself whenever the app is in the background, so the
        # app never gets to add the Hecho / Ignorar / Posponer buttons. Sent without them (data-only), the app
        # receives it and shows it itself, buttons included.
        data["title"] = notification.title
        data["message"] = notification.message
        return _post(body, config, client)
    body["title"] = notification.title
    body["channelId"] = "reminders"
    if notification.message:
        body["body"] = notification.message
    if buttons:
        body["categoryId"] = (
            "habit-reminder"  # gives the notification its Hecho / Ignorar / Posponer buttons
        )
    return _post(body, config, client)


def _post(body: dict, config: dict, client: httpx.Client | None) -> None:
    with client or httpx.Client(timeout=10) as http:
        response = http.post(PUSH_URL, json=body, headers={"Accept": "application/json"})
        response.raise_for_status()
    ticket = response.json().get("data") or {}
    if ticket.get("status") == "ok":
        return
    if (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
        raise DeviceNotRegistered(config["token"])
    raise RuntimeError(f"expo push failed: {ticket.get('message', ticket)}")
