from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.auth.deps import Db, Now, Reader
from app.errors import Invalid
from app.schemas import AwtrixOut, HabitStatsOut, MonthOut, TodayOut, YearOut
from app.services import views

router = APIRouter(tags=["views"])


@router.get("/today", response_model=TodayOut)
def today(principal: Reader, db: Db, now: Now, date: date | None = None):
    return views.today_view(db, principal.user, now, date)


@router.get("/stats/month", response_model=MonthOut)
def month(principal: Reader, db: Db, now: Now, month: Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]):
    year, number = (int(part) for part in month.split("-"))
    return views.month_view(db, principal.user, year, number, now)


@router.get("/stats/year", response_model=YearOut)
def year(principal: Reader, db: Db, now: Now, year: Annotated[int, Query(ge=2000, le=2100)]):
    return views.year_view(db, principal.user, year, now)


@router.get("/habits/{habit_id}/stats", response_model=HabitStatsOut)
def habit_stats(
    habit_id: int,
    principal: Reader,
    db: Db,
    now: Now,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
):
    if from_ and to and to < from_:
        raise Invalid("'to' cannot be before 'from'")
    return views.habit_stats(db, principal.user, habit_id, now, from_, to)


@router.get("/awtrix/today", response_model=AwtrixOut)
def awtrix_today(principal: Reader, db: Db, now: Now):
    return views.awtrix_summary(db, principal.user, now)
