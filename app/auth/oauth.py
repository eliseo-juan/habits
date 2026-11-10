"""OAuth 2.1 for remote MCP clients (claude.ai, the Claude apps): the user logs in with their password
and the client gets an ordinary API token, so it shows up and can be revoked like any other."""

import secrets
import time
from datetime import timedelta
from html import escape
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from mcp.server.auth.provider import (
    AuthorizationCode,
    AuthorizationParams,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import clock
from app.auth.security import authenticate, create_api_token, hash_secret
from app.db import get_sessionmaker
from app.errors import AppError
from app.models import OAuthClient, OAuthGrant, User

SCOPES = ["read", "write"]
GRANT_TTL = timedelta(minutes=10)


class HabitsOAuthProvider:
    def __init__(self, public_url: str):
        self.public_url = public_url

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        with get_sessionmaker()() as db:
            row = db.get(OAuthClient, client_id)
            return OAuthClientInformationFull.model_validate(row.info) if row else None

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        now = clock.utcnow()
        request_id = secrets.token_urlsafe(32)
        with get_sessionmaker()() as db:
            db.execute(delete(OAuthGrant).where(OAuthGrant.expires_at < now))
            db.add(
                OAuthGrant(
                    id=request_id,
                    client_id=client.client_id,
                    params=params.model_dump(mode="json"),
                    expires_at=now + GRANT_TTL,
                )
            )
            db.commit()
        return f"{self.public_url}/oauth/login?{urlencode({'request': request_id})}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        with get_sessionmaker()() as db:
            grant = _grant_for_code(db, authorization_code)
            if grant is None or grant.client_id != client.client_id:
                return None
            remaining = (grant.expires_at - clock.utcnow()).total_seconds()
            params = AuthorizationParams.model_validate(grant.params)
            return AuthorizationCode(
                code=authorization_code,
                scopes=params.scopes or ["write"],
                expires_at=time.time() + remaining,
                client_id=client.client_id,
                code_challenge=params.code_challenge,
                redirect_uri=params.redirect_uri,
                redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
                resource=params.resource,
                subject=str(grant.user_id),
            )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        with get_sessionmaker()() as db:
            grant = _grant_for_code(db, authorization_code.code)
            user = db.get(User, grant.user_id) if grant else None
            if grant is None or user is None or user.disabled:
                raise TokenError("invalid_grant", "authorization code already used")
            db.delete(grant)
            scope = "write" if "write" in authorization_code.scopes else "read"
            _, plaintext = create_api_token(
                db, user, (client.client_name or "oauth")[:64], scope, clock.utcnow()
            )
            db.commit()
        return OAuthToken(access_token=plaintext, scope=" ".join(authorization_code.scopes))

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> None:
        return None

    async def exchange_refresh_token(self, client, refresh_token, scopes) -> OAuthToken:
        raise TokenError("invalid_grant", "refresh tokens are not issued")

    async def load_access_token(self, token: str) -> None:
        return None

    async def revoke_token(self, token) -> None:
        return None


LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def create_client(db: Session, name: str, redirect_uris: list[str], now) -> str:
    for uri in redirect_uris:
        parsed = urlparse(uri)
        loopback = parsed.scheme == "http" and parsed.hostname in LOOPBACK_HOSTS
        if not (parsed.scheme == "https" and parsed.netloc) and not loopback:
            raise AppError(f"redirect URI must be https or a loopback address: {uri}")
    client = OAuthClientInformationFull(
        client_id=secrets.token_urlsafe(24),
        client_name=name,
        redirect_uris=redirect_uris,
        token_endpoint_auth_method="none",  # noqa: S106 public PKCE client, not a password
        grant_types=["authorization_code"],
        response_types=["code"],
        scope=" ".join(SCOPES),
    )
    db.add(
        OAuthClient(
            client_id=client.client_id,
            info=client.model_dump(mode="json", exclude_none=True),
            created_at=now,
        )
    )
    db.commit()
    return client.client_id


def _grant_for_code(db: Session, code: str) -> OAuthGrant | None:
    grant = db.scalar(select(OAuthGrant).where(OAuthGrant.code_hash == hash_secret(code)))
    if grant is None or grant.user_id is None or grant.expires_at <= clock.utcnow():
        return None
    return grant


router = APIRouter(include_in_schema=False)


def _pending_grant(
    db: Session, request_id: str
) -> tuple[OAuthGrant, OAuthClientInformationFull] | None:
    grant = db.get(OAuthGrant, request_id)
    if grant is None or grant.user_id is not None or grant.expires_at <= clock.utcnow():
        return None
    client = db.get(OAuthClient, grant.client_id)
    return (grant, OAuthClientInformationFull.model_validate(client.info)) if client else None


@router.get("/oauth/login", response_class=HTMLResponse)
def login_page(request: str):
    with get_sessionmaker()() as db:
        pending = _pending_grant(db, request)
        if pending is None:
            return _expired()
        return _page(request, pending[1].client_name or "Una aplicación")


@router.post("/oauth/login")
def login_submit(http: Request, request: str = Form(), email: str = Form(), password: str = Form()):
    now = clock.utcnow()
    with get_sessionmaker()() as db:
        pending = _pending_grant(db, request)
        if pending is None:
            return _expired()
        grant, client = pending
        try:
            user = authenticate(db, http.app.state.login_throttle, email, password, now)
        except AppError as error:
            message = (
                "Demasiados intentos. Prueba más tarde."
                if error.status_code == 429
                else "Email o contraseña incorrectos."
            )
            return _page(
                request, client.client_name or "Una aplicación", email, message, error.status_code
            )
        code = secrets.token_urlsafe(32)
        grant.user_id = user.id
        grant.code_hash = hash_secret(code)
        grant.expires_at = now + GRANT_TTL
        db.commit()
        params = AuthorizationParams.model_validate(grant.params)
    return RedirectResponse(
        construct_redirect_uri(str(params.redirect_uri), code=code, state=params.state),
        status_code=302,
    )


def _expired() -> HTMLResponse:
    body = "<h1>Enlace caducado</h1><p>Vuelve a conectar desde Claude.</p>"
    return HTMLResponse(_layout(body), status_code=400)


def _page(
    request_id: str, client_name: str, email: str = "", error: str | None = None, status: int = 200
) -> HTMLResponse:
    body = f"""
      <h1>Hábitos</h1>
      <p><b>{escape(client_name)}</b> quiere leer y marcar tus hábitos.</p>
      {f'<p class="error">{escape(error)}</p>' if error else ""}
      <form method="post" action="/oauth/login">
        <input type="hidden" name="request" value="{escape(request_id)}">
        <input name="email" type="email" placeholder="Email" value="{escape(email)}" autocomplete="username" required autofocus>
        <input name="password" type="password" placeholder="Contraseña" autocomplete="current-password" required>
        <button>Permitir acceso</button>
      </form>"""
    return HTMLResponse(_layout(body), status_code=status)


def _layout(body: str) -> str:
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hábitos · Acceso</title>
<style>
  body {{ margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #0b0d12; color: #f4f4f5;
         font: 16px/1.5 system-ui, sans-serif; }}
  main {{ width: min(360px, calc(100% - 32px)); }}
  h1 {{ font-size: 28px; margin: 0 0 8px; }}
  p {{ color: #a1a1aa; }}
  .error {{ color: #fb7185; }}
  form {{ display: grid; gap: 12px; margin-top: 24px; }}
  input, button {{ font: inherit; padding: 12px 14px; border-radius: 14px; border: 1px solid #ffffff1a; }}
  input {{ background: #ffffff0d; color: inherit; }}
  button {{ background: #4fd1a5; color: #062a1e; font-weight: 600; border: 0; cursor: pointer; }}
</style></head>
<body><main>{body}</main></body></html>"""
