"""Read-only back office at /admin for accounts with the admin role, plus notification test actions."""

from typing import ClassVar

from fastapi import FastAPI
from sqladmin import Admin, Flash, ModelView, action
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response

from app.auth import security
from app.auth.deps import SESSION_COOKIE
from app.clock import utcnow
from app.config import get_settings
from app.db import get_sessionmaker
from app.errors import AppError
from app.models import (
    ApiToken,
    Habit,
    HabitSchedule,
    Log,
    NotificationChannel,
    NotificationLog,
    Reminder,
    User,
    Webhook,
)
from app.notifications.message import Notification
from app.notifications.scheduler import Delivery, DueReminder, deliver, send_reminder
from app.services import rules

TEST_NOTIFICATION = Notification(title="SmartHabits", message="Test notification")


class AdminAuth(AuthenticationBackend):
    """Signs in with the app's own accounts and web session cookie; only admins get in."""

    def __init__(self, throttle: security.LoginThrottle):
        settings = get_settings()
        super().__init__(
            settings.secret_key,
            session_cookie="habits_admin_flash",
            path="/admin",
            https_only=settings.cookie_secure,
            same_site="strict",
        )
        self.throttle = throttle

    async def login(self, request: Request) -> Response | bool:
        form = await request.form()
        with get_sessionmaker()() as db:
            now = utcnow()
            try:
                user = security.authenticate(
                    db,
                    self.throttle,
                    str(form.get("username", "")),
                    str(form.get("password", "")),
                    now,
                )
            except AppError:
                return False
            if user.role != "admin":
                return False
            session_token = security.create_session(db, user, now)
            db.commit()
        response = RedirectResponse(request.url_for("admin:index"), status_code=302)
        response.set_cookie(
            SESSION_COOKIE,
            session_token,
            max_age=int(security.SESSION_TTL.total_seconds()),
            httponly=True,
            secure=get_settings().cookie_secure,
            samesite="strict",
        )
        return response

    async def logout(self, request: Request) -> Response | bool:
        if cookie := request.cookies.get(SESSION_COOKIE):
            with get_sessionmaker()() as db:
                security.end_session(db, cookie)
        response = RedirectResponse(request.url_for("admin:login"), status_code=302)
        response.delete_cookie(SESSION_COOKIE)
        return response

    async def authenticate(self, request: Request) -> bool:
        cookie = request.cookies.get(SESSION_COOKIE)
        if not cookie:
            return False
        with get_sessionmaker()() as db:
            principal = security.principal_from_session(db, cookie, utcnow())
        if principal is None or principal.user.role != "admin":
            return False
        request.state.admin_user_id = principal.user.id
        return True

    async def get_user_id(self, request: Request) -> int | None:
        return getattr(request.state, "admin_user_id", None)


class ReadOnlyView(ModelView):
    """Data is only browsed here: edits go through the app so domain rules hold."""

    can_create = False
    can_edit = False
    can_delete = False
    page_size = 50


def _back(request: Request, view: ModelView) -> RedirectResponse:
    target = request.headers.get("referer") or str(
        request.url_for("admin:list", identity=view.identity)
    )
    return RedirectResponse(target, status_code=302)


def _flash_deliveries(request: Request, label: str, deliveries: list[Delivery]) -> None:
    for delivery in deliveries:
        channel = f"{label} → {delivery.channel.type} #{delivery.channel.id}"
        if delivery.error is None:
            Flash.success(request, f"{channel}: sent")
        else:
            Flash.error(request, f"{channel}: {delivery.error}")


def _channel_target(channel: NotificationChannel) -> str:
    return str(channel.config.get("token", ""))[:30] + "…"


class UserView(ReadOnlyView, model=User):
    icon = "fa-solid fa-user"
    column_list = (
        User.id,
        User.email,
        User.display_name,
        User.role,
        User.timezone,
        User.day_cutoff,
        User.disabled,
        User.created_at,
    )
    column_details_exclude_list = (User.password_hash,)
    column_export_exclude_list = (User.password_hash,)
    column_searchable_list = (
        User.email,
        User.display_name,
    )


class HabitView(ReadOnlyView, model=Habit):
    icon = "fa-solid fa-list-check"
    column_list = (
        Habit.id,
        Habit.user_id,
        Habit.name,
        Habit.kind,
        Habit.priority,
        Habit.start_date,
        Habit.end_date,
        Habit.archived,
        Habit.created_at,
    )
    column_searchable_list = (Habit.name,)
    column_sortable_list = (
        Habit.id,
        Habit.name,
        Habit.priority,
        Habit.start_date,
    )


class HabitScheduleView(ReadOnlyView, model=HabitSchedule):
    name = "Schedule"
    icon = "fa-solid fa-calendar"
    column_list = (
        HabitSchedule.id,
        HabitSchedule.habit_id,
        HabitSchedule.effective_from,
        HabitSchedule.schedule_type,
        HabitSchedule.times_per_day,
        HabitSchedule.weekdays,
        HabitSchedule.period_unit,
        HabitSchedule.period_target,
    )
    column_default_sort: ClassVar[list] = [
        (HabitSchedule.habit_id, False),
        (HabitSchedule.effective_from, False),
    ]


class LogView(ReadOnlyView, model=Log):
    icon = "fa-solid fa-check"
    column_list = (
        Log.habit_id,
        Log.date,
        Log.done_count,
        Log.skipped,
        Log.note,
        Log.source,
        Log.updated_at,
    )
    column_default_sort = (Log.date, True)
    column_sortable_list = (
        Log.date,
        Log.habit_id,
        Log.updated_at,
    )


class ReminderView(ReadOnlyView, model=Reminder):
    icon = "fa-solid fa-bell"
    column_list = (
        Reminder.id,
        Reminder.habit_id,
        Reminder.time_local,
        Reminder.weekdays,
        Reminder.enabled,
    )

    @action(
        name="send_now",
        label="Send now",
        confirmation_message="Send today's reminder now to every enabled channel of its user?",
    )
    async def send_now(self, request: Request) -> Response:
        settings = get_settings()
        now = utcnow()
        with get_sessionmaker()() as db:
            for pk in filter(None, request.query_params.get("pks", "").split(",")):
                reminder = db.get(Reminder, int(pk))
                habit = db.get(Habit, reminder.habit_id) if reminder else None
                user = db.get(User, habit.user_id) if habit else None
                if user is None:
                    Flash.error(request, f"Reminder #{pk} not found")
                    continue
                day = rules.logical_date(now, user.timezone, user.day_cutoff)
                item = DueReminder(reminder, habit, user, day)
                deliveries = send_reminder(db, item, now, settings.secret_key, settings.public_url)
                if deliveries is None:
                    Flash.warning(
                        request,
                        f"Reminder #{pk}: already sent for {day} or its user has no enabled channel",
                    )
                else:
                    _flash_deliveries(request, f"Reminder #{pk}", deliveries)
        return _back(request, self)


class NotificationLogView(ReadOnlyView, model=NotificationLog):
    name = "Sent reminder"
    icon = "fa-solid fa-paper-plane"
    column_list = (
        NotificationLog.reminder_id,
        NotificationLog.date,
        NotificationLog.sent_at,
        NotificationLog.action_used_at,
    )
    column_default_sort = (NotificationLog.sent_at, True)


class NotificationChannelView(ReadOnlyView, model=NotificationChannel):
    name = "Channel"
    icon = "fa-solid fa-tower-broadcast"
    column_list = (
        NotificationChannel.id,
        NotificationChannel.user_id,
        NotificationChannel.type,
        NotificationChannel.config,
        NotificationChannel.enabled,
    )
    column_details_list = column_list
    column_export_exclude_list = (NotificationChannel.config,)
    column_labels: ClassVar[dict] = {NotificationChannel.config: "Target"}
    column_formatters: ClassVar[dict] = {
        NotificationChannel.config: lambda channel, _attr: _channel_target(channel)
    }
    column_formatters_detail = column_formatters

    @action(name="send_test", label="Send test notification")
    async def send_test(self, request: Request) -> Response:
        with get_sessionmaker()() as db:
            for pk in filter(None, request.query_params.get("pks", "").split(",")):
                channel = db.get(NotificationChannel, int(pk))
                if channel is None:
                    Flash.error(request, f"Channel #{pk} not found")
                    continue
                _flash_deliveries(request, "Test", deliver(db, [channel], TEST_NOTIFICATION))
        return _back(request, self)


class WebhookView(ReadOnlyView, model=Webhook):
    icon = "fa-solid fa-link"
    column_list = (
        Webhook.id,
        Webhook.user_id,
        Webhook.url,
        Webhook.created_at,
    )


class ApiTokenView(ReadOnlyView, model=ApiToken):
    name = "API token"
    icon = "fa-solid fa-key"
    column_list = (
        ApiToken.id,
        ApiToken.user_id,
        ApiToken.name,
        ApiToken.scopes,
        ApiToken.created_at,
        ApiToken.last_used,
        ApiToken.revoked_at,
    )
    column_details_exclude_list = (ApiToken.token_hash,)
    column_export_exclude_list = (ApiToken.token_hash,)


VIEWS = [
    UserView,
    HabitView,
    HabitScheduleView,
    LogView,
    ReminderView,
    NotificationLogView,
    NotificationChannelView,
    WebhookView,
    ApiTokenView,
]


def mount_admin(app: FastAPI) -> None:
    admin = Admin(
        app,
        session_maker=get_sessionmaker(),
        title="SmartHabits admin",
        authentication_backend=AdminAuth(app.state.login_throttle),
    )
    for view in VIEWS:
        admin.add_view(view)
