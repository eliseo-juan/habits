import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.routing import Route
from starlette.staticfiles import StaticFiles

from app.api import account, habits, views
from app.auth.deps import Db, Now
from app.backup import backup_sqlite
from app.clock import utcnow
from app.config import get_settings
from app.db import get_sessionmaker
from app.errors import AppError
from app.mcp.server import BearerAuth, mcp
from app.notifications.actions import use_action_token
from app.notifications.scheduler import send_due_reminders

log = logging.getLogger(__name__)


def run_scheduled_jobs() -> None:
    settings = get_settings()
    now = utcnow()
    with get_sessionmaker()() as db:
        send_due_reminders(db, now, settings.secret_key, settings.public_url)
    backup_sqlite(settings.database_url, settings.backup_dir, now)


async def _scheduler_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(run_scheduled_jobs)
        except Exception:
            log.exception("scheduled jobs failed")
        await asyncio.sleep(60 - utcnow().second)


def create_app() -> FastAPI:
    mcp_app = mcp.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        host="0.0.0.0",
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        scheduler = asyncio.create_task(_scheduler_loop()) if get_settings().scheduler_enabled else None
        async with mcp.session_manager.run():
            yield
        if scheduler is not None:
            scheduler.cancel()
            with suppress(asyncio.CancelledError):
                await scheduler

    app = FastAPI(title="Habits", version="0.1.0", lifespan=lifespan)
    app.include_router(habits.router)
    app.include_router(views.router)
    app.include_router(account.router)
    app.router.routes.extend(Route(r.path, BearerAuth(r.endpoint)) for r in mcp_app.routes)

    @app.exception_handler(AppError)
    async def app_error(_request: Request, error: AppError):
        return JSONResponse({"code": error.code, "message": error.message}, status_code=error.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, error: RequestValidationError):
        message = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in error.errors())
        return JSONResponse({"code": "validation_error", "message": message}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_request: Request, error: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(error.status_code, "http_error")
        return JSONResponse({"code": code, "message": str(error.detail)}, status_code=error.status_code)

    @app.get("/health", tags=["ops"])
    def health(db: Db):
        db.execute(text("SELECT 1"))
        return {"status": "ok"}

    @app.post(
        "/notifications/actions/{token}/done",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["notifications"],
        summary="Single-use 'done' link sent with a reminder",
    )
    def notification_done(token: str, db: Db, now: Now):
        use_action_token(db, get_settings().secret_key, token, now)

    if web_dir := get_settings().web_dir:
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")

    return app


app = create_app()
