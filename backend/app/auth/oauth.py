"""OAuth 2.1 for remote MCP clients (claude.ai, the Claude apps): the user logs in with their password
and the client gets an ordinary API token, so it shows up and can be revoked like any other."""

import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta
from html import escape
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from mcp.server.auth.handlers.metadata import MetadataHandler
from mcp.server.auth.provider import (
    AuthorizationCode,
    AuthorizationParams,
    RegistrationError,
    TokenError,
    construct_redirect_uri,
)
from mcp.server.auth.routes import REGISTRATION_PATH, build_metadata, cors_middleware
from mcp.server.auth.settings import RevocationOptions
from mcp.shared.auth import InvalidRedirectUriError, OAuthClientInformationFull, OAuthToken
from pydantic import AnyHttpUrl, AnyUrl
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from starlette.routing import Route

from app import clock
from app.auth.security import authenticate, create_api_token, hash_secret
from app.db import get_sessionmaker
from app.errors import AppError
from app.models import OAuthClient, OAuthGrant, User

SCOPES = ["read", "write"]
GRANT_TTL = timedelta(minutes=10)


LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
MAX_REDIRECT_URIS = 5
MAX_CLIENT_NAME = 100


def _is_loopback(uri: str) -> bool:
    parsed = urlparse(uri)
    return parsed.scheme == "http" and parsed.hostname in LOOPBACK_HOSTS


def validate_redirect_uris(redirect_uris: list[str]) -> None:
    """https, or http on a loopback address (native apps, RFC 8252). Nothing else can receive a code."""
    if not redirect_uris:
        raise AppError("at least one redirect URI is required")
    if len(redirect_uris) > MAX_REDIRECT_URIS:
        raise AppError(f"at most {MAX_REDIRECT_URIS} redirect URIs")
    for uri in redirect_uris:
        parsed = urlparse(uri)
        if len(uri) > 2048 or parsed.fragment or parsed.username or parsed.password:
            raise AppError(f"invalid redirect URI: {uri[:100]}")
        if not (parsed.scheme == "https" and parsed.netloc) and not _is_loopback(uri):
            raise AppError(f"redirect URI must be https or a loopback address: {uri[:100]}")


class OAuthClientRecord(OAuthClientInformationFull):
    def validate_redirect_uri(self, redirect_uri: AnyUrl | None) -> AnyUrl:
        """Exact match, except that a loopback URI may use any port (RFC 8252 §7.3): native apps
        pick a free port on every run."""
        if (
            redirect_uri is not None
            and self.redirect_uris
            and redirect_uri not in self.redirect_uris
        ):
            asked = urlparse(str(redirect_uri))
            for registered in self.redirect_uris:
                known = urlparse(str(registered))
                if (
                    _is_loopback(str(registered))
                    and _is_loopback(str(redirect_uri))
                    and (known.hostname, known.path, known.query)
                    == (asked.hostname, asked.path, asked.query)
                ):
                    return redirect_uri
            raise InvalidRedirectUriError(
                f"Redirect URI '{redirect_uri}' not registered for client"
            )
        return super().validate_redirect_uri(redirect_uri)


class RegistrationThrottle:
    """Caps POST /register per client address and overall, so the public endpoint can't be used to
    fill the database. In memory: it resets on restart, which is fine for a rate limit."""

    def __init__(
        self,
        per_address: int = 10,
        overall: int = 100,
        window: timedelta = timedelta(hours=1),
    ):
        self.per_address = per_address
        self.overall = overall
        self.window = window
        self._hits: dict[str, list[datetime]] = defaultdict(list)

    def allow(self, address: str, now: datetime) -> bool:
        for key in list(self._hits):
            self._hits[key] = [t for t in self._hits[key] if now - t < self.window]
            if not self._hits[key]:
                del self._hits[key]
        if (
            len(self._hits[address]) >= self.per_address
            or sum(len(v) for v in self._hits.values()) >= self.overall
        ):
            return False
        self._hits[address].append(now)
        return True


class HabitsOAuthProvider:
    def __init__(self, public_url: str):
        self.public_url = public_url

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        with get_sessionmaker()() as db:
            row = db.get(OAuthClient, client_id)
            return OAuthClientRecord.model_validate(row.info) if row else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        """Dynamic registration (RFC 7591): stored like a client created from the terminal."""
        try:
            validate_redirect_uris([str(u) for u in client_info.redirect_uris or []])
        except AppError as error:
            raise RegistrationError("invalid_redirect_uri", error.message) from error
        if client_info.client_name:
            client_info.client_name = client_info.client_name[:MAX_CLIENT_NAME]
        with get_sessionmaker()() as db:
            db.add(
                OAuthClient(
                    client_id=client_info.client_id,
                    info=client_info.model_dump(mode="json", exclude_none=True),
                    created_at=clock.utcnow(),
                )
            )
            db.commit()

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


def create_client(db: Session, name: str, redirect_uris: list[str], now) -> str:
    validate_redirect_uris(redirect_uris)
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


def harden_auth_routes(
    routes: list[Route], public_url: str, throttle: RegistrationThrottle, registration_options
) -> list[Route]:
    """Adjust the SDK's routes: rate-limit /register, and advertise public clients (PKCE is always
    required: /authorize rejects a request without an S256 challenge)."""
    metadata = build_metadata(
        AnyHttpUrl(public_url), None, registration_options, RevocationOptions()
    )
    metadata.token_endpoint_auth_methods_supported = [
        "none",
        "client_secret_post",
        "client_secret_basic",
    ]
    hardened = []
    for route in routes:
        if route.path == "/.well-known/oauth-authorization-server":
            route = Route(
                route.path,
                endpoint=cors_middleware(MetadataHandler(metadata).handle, ["GET", "OPTIONS"]),
                methods=["GET", "OPTIONS"],
            )
        elif route.path == REGISTRATION_PATH:
            route = Route(
                route.path, endpoint=_throttled(route.endpoint, throttle), methods=route.methods
            )
        hardened.append(route)
    return hardened


class _throttled:  # a class, so Starlette treats it as an ASGI app and not a request handler
    def __init__(self, endpoint, throttle: RegistrationThrottle):
        self.endpoint = endpoint
        self.throttle = throttle

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] == "POST":
            address = scope["client"][0] if scope.get("client") else "unknown"
            if not self.throttle.allow(address, clock.utcnow()):
                response = JSONResponse(
                    {
                        "error": "temporarily_unavailable",
                        "error_description": "too many registrations, try again later",
                    },
                    status_code=429,
                    headers={"Retry-After": "3600"},
                )
                return await response(scope, receive, send)
        return await self.endpoint(scope, receive, send)


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
        return _page(
            request, pending[1].client_name or "Una aplicación", target=_target(pending[0])
        )


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
                request,
                client.client_name or "Una aplicación",
                email,
                message,
                error.status_code,
                _target(grant),
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


def _target(grant: OAuthGrant) -> str:
    """Where the code will be sent: with open registration, the name alone proves nothing."""
    return urlparse(str(grant.params.get("redirect_uri", ""))).netloc


def _expired() -> HTMLResponse:
    body = (
        "<h1>Enlace usado o caducado</h1>"
        "<p>Si Claude ya aparece conectado, no tienes que hacer nada. Si no, vuelve a conectar desde Claude.</p>"
    )
    return HTMLResponse(_layout(body), status_code=400)


def _page(
    request_id: str,
    client_name: str,
    email: str = "",
    error: str | None = None,
    status: int = 200,
    target: str = "",
) -> HTMLResponse:
    body = f"""
      <h1>Hábitos</h1>
      <p><b>{escape(client_name)}</b> quiere leer y marcar tus hábitos.</p>
      {f"<p>Te devolverá a <b>{escape(target)}</b>. Si no lo reconoces, cierra esta página.</p>" if target else ""}
      {f'<p class="error">{escape(error)}</p>' if error else ""}
      <form method="post" action="/oauth/login" onsubmit="this.querySelector('button').disabled = true">
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
