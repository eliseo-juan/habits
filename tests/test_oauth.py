import base64
import hashlib
import secrets
from urllib.parse import parse_qs, urlparse

from tests.test_mcp import MCP_HEADERS

REDIRECT = "https://claude.ai/api/mcp/auth_callback"


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    return verifier, challenge


def register(client) -> dict:
    response = client.post(
        "/register",
        json={
            "redirect_uris": [REDIRECT],
            "client_name": "Claude",
            "token_endpoint_auth_method": "none",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


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


def test_oauth_flow_gives_a_working_mcp_token(client, alice):
    registered = register(client)
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


def test_read_scope_gives_a_read_only_token(client, alice):
    registered = register(client)
    verifier, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge, scope="read")
    code = code_from(login(client, request_id, alice.email, "secret-password"))
    access = exchange(client, registered["client_id"], code, verifier).json()["access_token"]

    created = client.post(
        "/habits", json={"name": "Nope"}, headers={"Authorization": f"Bearer {access}"}
    )
    assert created.status_code == 403


def test_wrong_password_shows_the_form_again(client, alice):
    registered = register(client)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)

    response = login(client, request_id, alice.email, "wrong")
    assert response.status_code == 401
    assert "Email o contraseña incorrectos" in response.text


def test_wrong_verifier_is_rejected(client, alice):
    registered = register(client)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)
    code = code_from(login(client, request_id, alice.email, "secret-password"))

    assert exchange(client, registered["client_id"], code, "not-the-verifier").status_code == 400


def test_login_request_expires(client, clock, alice):
    from datetime import timedelta

    registered = register(client)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)
    clock.now += timedelta(minutes=11)

    assert login(client, request_id, alice.email, "secret-password").status_code == 400
    assert client.get("/oauth/login", params={"request": "unknown"}).status_code == 400


def test_repeated_failed_logins_are_throttled(client, alice):
    registered = register(client)
    _, challenge = pkce()
    request_id = authorize(client, registered["client_id"], challenge)
    for _ in range(5):
        assert login(client, request_id, alice.email, "wrong").status_code == 401

    assert login(client, request_id, alice.email, "secret-password").status_code == 429
    api = client.post("/auth/login", json={"email": alice.email, "password": "secret-password"})
    assert api.status_code == 429
