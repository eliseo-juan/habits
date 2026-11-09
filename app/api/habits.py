from datetime import date

from fastapi import APIRouter, status

from app.auth.deps import Db, Now, Reader, Writer
from app.schemas import (
    HabitCreate,
    HabitOut,
    HabitUpdate,
    LogDone,
    LogOut,
    LogPut,
    ReminderIn,
    ReminderOut,
    ReminderUpdate,
    ScheduleCreate,
)
from app.services import habits, logs, reminders
from app.services.habits import habit_out, user_today

router = APIRouter(tags=["habits"])


@router.get("/habits", response_model=list[HabitOut])
def list_habits(principal: Reader, db: Db, now: Now, include_archived: bool = False):
    today = user_today(principal.user, now)
    return [habit_out(h, today) for h in habits.list_habits(db, principal.user, include_archived)]


@router.post("/habits", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
def create_habit(data: HabitCreate, principal: Writer, db: Db, now: Now):
    habit = habits.create_habit(db, principal.user, data, now)
    return habit_out(habit, user_today(principal.user, now))


@router.get("/habits/{habit_id}", response_model=HabitOut)
def get_habit(habit_id: int, principal: Reader, db: Db, now: Now):
    return habit_out(
        habits.get_habit(db, principal.user, habit_id), user_today(principal.user, now)
    )


@router.patch("/habits/{habit_id}", response_model=HabitOut)
def update_habit(habit_id: int, data: HabitUpdate, principal: Writer, db: Db, now: Now):
    habit = habits.update_habit(db, principal.user, habit_id, data)
    return habit_out(habit, user_today(principal.user, now))


@router.delete(
    "/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Archive a habit"
)
def archive_habit(habit_id: int, principal: Writer, db: Db):
    habits.archive_habit(db, principal.user, habit_id)


@router.post(
    "/habits/{habit_id}/schedules", response_model=HabitOut, status_code=status.HTTP_201_CREATED
)
def set_schedule(habit_id: int, data: ScheduleCreate, principal: Writer, db: Db, now: Now):
    habit = habits.set_schedule(db, principal.user, habit_id, data)
    return habit_out(habit, user_today(principal.user, now))


@router.put("/habits/{habit_id}/logs/{day}", response_model=LogOut)
def put_log(habit_id: int, day: date, data: LogPut, principal: Writer, db: Db, now: Now):
    return logs.set_log(db, principal, habit_id, day, data, now)


@router.post("/habits/{habit_id}/logs/{day}/done", response_model=LogOut)
def add_done(
    habit_id: int, day: date, principal: Writer, db: Db, now: Now, data: LogDone | None = None
):
    return logs.add_done(db, principal, habit_id, day, (data or LogDone()).count, now)


@router.delete("/habits/{habit_id}/logs/{day}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(habit_id: int, day: date, principal: Writer, db: Db):
    logs.delete_log(db, principal, habit_id, day)


@router.get("/habits/{habit_id}/reminders", response_model=list[ReminderOut])
def list_reminders(habit_id: int, principal: Reader, db: Db):
    return [
        reminders.reminder_out(r) for r in reminders.list_reminders(db, principal.user, habit_id)
    ]


@router.post(
    "/habits/{habit_id}/reminders", response_model=ReminderOut, status_code=status.HTTP_201_CREATED
)
def create_reminder(habit_id: int, data: ReminderIn, principal: Writer, db: Db):
    return reminders.reminder_out(reminders.create_reminder(db, principal.user, habit_id, data))


@router.patch("/reminders/{reminder_id}", response_model=ReminderOut)
def update_reminder(reminder_id: int, data: ReminderUpdate, principal: Writer, db: Db):
    return reminders.reminder_out(reminders.update_reminder(db, principal.user, reminder_id, data))


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(reminder_id: int, principal: Writer, db: Db):
    reminders.delete_reminder(db, principal.user, reminder_id)
