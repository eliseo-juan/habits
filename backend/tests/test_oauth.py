import base64
import hashlib
import secrets
from urllib.parse import parse_qs, urlparse

from app import cli
from tests.test_mcp import MCP_HEADERS

REDIRECT = "https://claude.ai/api/mcp/auth_callback"


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    return verifier, challenge


def register(capsys) -> dict:
    assert cli.main(["create-oauth-client", "Claude", "--redirect-uri", REDIRECT]) == 0
    return {"client_id": capsys.readouterr().out.strip().splitlines()[-1]}


def authorize(client, client_id: str, challenge: str, scope: str | None = None) -> str:
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": "xyz",
    }
    if scope:
        params["scope"] = scope
    response = client.get("/authorize", params=params, follow_redirects=False)
    assert response.status_code == 302, response.text
    login_url = urlparse(response.headers["location"])
    assert login_url.path == "/oauth/login"
    return parse_qs(login_url.query)["request"][0]


def login(client, request_id: str, email: str, password: str):
    return client.post(
        "/oauth/login",
        data={"request": request_id, "email": email, "password": password},
        follow_redirects=False,
    )


def code_from(response) -> str:
    assert response.status_code == 302, response.text
    location = urlparse(response.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == REDIRECT
    query = parse_qs(location.query)
    assert query["state"] == ["xyz"]
    return query["code"][0]


def exchange(client, client_id: str, code: str, verifier: str):
    return client.post(
        "/token",
        data={
            "grant_type": "authorization_code",
            "client_id": client_id,
            "code": code,
            "redirect_uri": REDIRECT,
            "code_verifier": verifier,
        },
    )


def tools_list(client, token: str):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    return client.post(
        "/mcp", json=body, headers=MCP_HEADERS | {"Authorization": f"Bearer {token}"}
    )


def test_unauthenticated_mcp_points_to_resource_metadata(client):
    response = client.post("/mcp", json={}, headers=MCP_HEADERS)
    assert response.status_code == 401
    assert (
        'resource_metadata="http://localhost:8000/.well-known/oauth-protected-resource/mcp"'
        in response.headers["www-authenticate"]
    )

    resource = client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert resource["resource"] == "http://localhost:8000/mcp"
    assert resource["authorization_servers"] == ["http://localhost:8000/"]

    server = client.get("/.well-known/oauth-authorization-server").json()
    assert server["registration_endpoint"] == "http://localhost:8000/register"
    assert server["code_challenge_methods_supported"] == ["S256"]
    assert server["token_endpoint_auth_methods_supported"] == [
        "none",
        "client_secret_post",
        "client_secret_basic",
    ]


def test_oauth_flow_gives_a_working_mcp_token(client, alice, capsys):
    registered = register(capsys)
    verifier, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)

    page = client.get("/oauth/login", params={"request": request_id})
    assert page.status_code == 200
    assert "Claude" in page.text

    code = code_from(login(client, request_id, alice.email, "secret-password"))
    token = exchange(client, registered["client_id"], code, verifier)
    assert token.status_code == 200, token.text
    access = token.json()["access_token"]
    assert access.startswith("hab_")

    assert tools_list(client, access).status_code == 200
    tokens = client.get("/tokens", headers={"Authorization": f"Bearer {access}"})
    assert tokens.status_code == 403

    again = exchange(client, registered["client_id"], code, verifier)
    assert again.status_code == 400


def test_read_scope_gives_a_read_only_token(client, alice, capsys):
    registered = register(capsys)
    verifier, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge, scope="read")
    code = code_from(login(client, request_id, alice.email, "secret-password"))
    access = exchange(client, registered["client_id"], code, verifier).json()["access_token"]

    created = client.post(
        "/habits", json={"name": "Nope"}, headers={"Authorization": f"Bearer {access}"}
    )
    assert created.status_code == 403


def test_wrong_password_shows_the_form_again(client, alice, capsys):
    registered = register(capsys)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)

    response = login(client, request_id, alice.email, "wrong")
    assert response.status_code == 401
    assert "Email o contraseña incorrectos" in response.text


def test_wrong_verifier_is_rejected(client, alice, capsys):
    registered = register(capsys)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)
    code = code_from(login(client, request_id, alice.email, "secret-password"))

    assert exchange(client, registered["client_id"], code, "not-the-verifier").status_code == 400


def test_login_request_expires(client, clock, alice, capsys):
    from datetime import timedelta

    registered = register(capsys)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)
    clock.now += timedelta(minutes=11)

    assert login(client, request_id, alice.email, "secret-password").status_code == 400
    assert client.get("/oauth/login", params={"request": "unknown"}).status_code == 400


def test_reused_login_link_tells_the_user_they_may_already_be_connected(client, alice, capsys):
    registered = register(capsys)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)
    code_from(login(client, request_id, alice.email, "secret-password"))

    again = login(client, request_id, alice.email, "secret-password")
    assert again.status_code == 400
    assert "Si Claude ya aparece conectado" in again.text


def test_login_form_can_only_be_submitted_once(client, capsys):
    registered = register(capsys)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)

    page = client.get("/oauth/login", params={"request": request_id})
    assert "this.querySelector('button').disabled = true" in page.text


def test_repeated_failed_logins_are_throttled(client, alice, capsys):
    registered = register(capsys)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)
    for _ in range(5):
        assert login(client, request_id, alice.email, "wrong").status_code == 401

    assert login(client, request_id, alice.email, "secret-password").status_code == 429
    api = client.post("/auth/login", json={"email": alice.email, "password": "secret-password"})
    assert api.status_code == 429


def dcr(client, **overrides):
    body = {
        "client_name": "OpenClaw",
        "redirect_uris": ["http://127.0.0.1:8976/callback"],
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    } | overrides
    return client.post("/register", json=body)


def test_dynamic_registration_of_a_public_loopback_client(client):
    response = dcr(client)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["client_id"] and body["client_id_issued_at"]
    assert "client_secret" not in body
    assert body["redirect_uris"] == ["http://127.0.0.1:8976/callback"]
    assert body["client_name"] == "OpenClaw"
    assert body["token_endpoint_auth_method"] == "none"


def test_confidential_dynamic_client_gets_a_secret(client):
    body = dcr(client, token_endpoint_auth_method="client_secret_post").json()
    assert body["client_secret"]
    assert body["client_secret_expires_at"] == 0


def test_dynamic_client_completes_authorization_code_with_pkce(client, alice):
    registered = dcr(client).json()
    redirect = "http://127.0.0.1:8976/callback"
    verifier, challenge = pkce()
    response = client.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": registered["client_id"],
            "redirect_uri": redirect,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "xyz",
        },
        follow_redirects=False,
    )
    assert response.status_code == 302, response.text
    request_id = parse_qs(urlparse(response.headers["location"]).query)["request"][0]
    page = client.get("/oauth/login", params={"request": request_id})
    assert "127.0.0.1:8976" in page.text

    done = login(client, request_id, alice.email, "secret-password")
    location = urlparse(done.headers["location"])
    assert location.netloc == "127.0.0.1:8976"
    code = parse_qs(location.query)["code"][0]
    token = client.post(
        "/token",
        data={
            "grant_type": "authorization_code",
            "client_id": registered["client_id"],
            "code": code,
            "redirect_uri": redirect,
            "code_verifier": verifier,
        },
    )
    assert token.status_code == 200, token.text
    assert tools_list(client, token.json()["access_token"]).status_code == 200


def test_loopback_client_may_use_another_port_but_not_another_path_or_host(client):
    registered = dcr(client).json()
    _, challenge = pkce()

    def status(uri):
        return client.get(
            "/authorize",
            params={
                "response_type": "code",
                "client_id": registered["client_id"],
                "redirect_uri": uri,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
            follow_redirects=False,
        ).status_code

    assert status("http://127.0.0.1:51234/callback") == 302
    assert status("http://127.0.0.1:8976/other") == 400
    assert status("http://localhost:8976/callback") == 400
    assert status("https://evil.example/callback") == 400


def test_public_client_must_use_pkce(client):
    registered = dcr(client).json()
    response = client.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": registered["client_id"],
            "redirect_uri": "http://127.0.0.1:8976/callback",
        },
        follow_redirects=False,
    )
    assert response.status_code == 302
    location = response.headers["location"]
    assert "error=invalid_request" in location and "/oauth/login" not in location


def test_dynamic_registration_rejects_unsafe_redirect_uris(client):
    for uri in (
        "http://evil.example/callback",
        "http://localhost.evil.example/callback",
        "ftp://claude.ai/x",
        "https://app.example/cb#frag",
        "com.evil.app:/callback",
    ):
        response = dcr(client, redirect_uris=[uri])
        assert response.status_code == 400, uri
    assert dcr(client, redirect_uris=[]).status_code == 400
    accepted = ["https://app.example/cb", "http://localhost:3118/cb", "http://[::1]:3118/cb"]
    assert dcr(client, redirect_uris=accepted).status_code == 201


def test_dynamic_clients_are_stored_and_survive_restarts(client):
    from app.db import get_sessionmaker
    from app.models import OAuthClient

    client_id = dcr(client).json()["client_id"]
    with get_sessionmaker()() as db:
        assert db.get(OAuthClient, client_id) is not None


def test_registration_is_rate_limited(client):
    statuses = [dcr(client).status_code for _ in range(12)]
    assert statuses[:10] == [201] * 10
    assert statuses[10:] == [429, 429]


def test_registration_limit_resets_after_the_window(client, clock):
    from datetime import timedelta

    for _ in range(10):
        dcr(client)
    assert dcr(client).status_code == 429
    clock.now += timedelta(hours=1, minutes=1)
    assert dcr(client).status_code == 201


def test_terminal_registered_clients_still_work_next_to_dynamic_ones(client, alice, capsys):
    dcr(client)
    registered = register(capsys)
    verifier, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)
    code = code_from(login(client, request_id, alice.email, "secret-password"))
    assert exchange(client, registered["client_id"], code, verifier).status_code == 200


def test_unknown_redirect_uri_is_rejected(client, alice, capsys):
    registered = register(capsys)
    _, challenge = pkce()
    response = client.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": registered["client_id"],
            "redirect_uri": "https://evil.example/callback",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert response.status_code == 400


def test_cli_rejects_redirect_uris_that_are_not_https_or_loopback(client):
    rejected = [
        "http://evil.example/callback",
        "http://localhost.evil.example/callback",
        "ftp://claude.ai/x",
        "claude.ai/callback",
    ]
    for uri in rejected:
        assert cli.main(["create-oauth-client", "X", "--redirect-uri", uri]) == 1
    accepted = [
        "http://localhost:3118/callback",
        "http://127.0.0.1:3118/callback",
        "http://[::1]:3118/callback",
    ]
    for uri in accepted:
        assert cli.main(["create-oauth-client", "Claude Code", "--redirect-uri", uri]) == 0
