# neurocad/core/engine/lib/botinv/max.py

"""
MAX Bot API client — thin wrapper over platform-api2.max.ru.

Only httpx is used: no third-party MAX SDK. The three methods
the inventory bot needs are:

  - send_message(...)       → POST /messages
  - answer_callback(...)    → POST /answers
  - set_webhook(...)        → POST /subscriptions  (one-time setup)
  - delete_webhook(...)     → DELETE /subscriptions (for re-registration)

WEBHOOK HANDLING
================
The /botinv/max/webhook endpoint (in route.py) receives Update
objects from MAX and forwards them to handle_update(), which
parses the event, calls the inventory service, and sends a reply
back via the API.

Two event types matter here:

  - message_created — the user sent a message (a room like "#405",
    an inventory number, or "1"/"2"/"3" for a candidate pick).
  - message_callback — the user tapped an inline button. The
    callback_id is used to answer the tap, and the button payload
    carries the chosen item's id.

IDENTITY
========
MAX does not authenticate users the way the web app does — there
is no JWT. The user is identified by their MAX user_id, which is
in every Update. The mapping from MAX user_id to the internal
BotInv user is done by the webhook handler in route.py: it looks
up user_id in the `botinv_max_users` table (or a simple mapping
in .env, if you prefer — see route.py).

SECURITY
========
If MAX_WEBHOOK_SECRET is set in .env, MAX sends it back in the
X-Max-Bot-Api-Secret header on every webhook call. verify_webhook_secret()
checks that header; the webhook endpoint rejects requests where it
does not match.

TLS / CA BUNDLE
===============
platform-api2.max.ru is signed by a Russian Trusted Root CA
(Ministry of Digital Development) which is NOT in the default
certifi bundle shipped with httpx. If the system CA store
(/etc/ssl/certs/ca-certificates.crt on Debian/Ubuntu) already
contains that root (see `update-ca-certificates`), we point httpx
at it explicitly via `verify=` — otherwise outbound calls fail
with CERTIFICATE_VERIFY_FAILED.

The order in this file matters: the SSL_CERT_FILE / REQUESTS_CA_BUNDLE
environment variables are set BEFORE httpx is imported, so httpx
picks them up when it initialises its default SSL context.
"""

from __future__ import annotations

import logging
import os

# Point httpx (and any other HTTP client that reads these vars)
# at the system CA bundle. Must happen BEFORE `import httpx` —
# httpx caches its default SSL context on first use. `setdefault`
# keeps any value the caller may have set deliberately.
_SYSTEM_CA_FILE = "/etc/ssl/certs/ca-certificates.crt"
if os.path.exists(_SYSTEM_CA_FILE):
    os.environ.setdefault("SSL_CERT_FILE", _SYSTEM_CA_FILE)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", _SYSTEM_CA_FILE)

from typing import Any, Dict, List, Optional

import httpx

from .....config import settings

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_API_BASE = "https://platform-api2.max.ru"

# Timeout for outgoing API calls. MAX requires the webhook endpoint
# to respond within 30 seconds; our own API calls should be much
# faster than that, but we leave headroom for slow networks.
_HTTP_TIMEOUT = httpx.Timeout(20.0, connect=10.0)

# A single httpx client per process. Reusing the connection pool
# is faster and avoids socket churn when the bot sends several
# messages in a row.
_client: Optional[httpx.AsyncClient] = None


def _get_verify_path() -> Any:
    """
    Return the value to pass to httpx as `verify=`.

    Prefer the system CA bundle (`/etc/ssl/certs/ca-certificates.crt`)
    because that is where the Russian Trusted Root CA lives after
    `sudo update-ca-certificates`. Fall back to httpx's default
    (True) if the file is not present — that keeps this module
    working on systems where the CA store lives elsewhere.

    A missing system file does NOT crash — httpx falls back to
    certifi, and outbound calls will simply fail with the usual
    CERTIFICATE_VERIFY_FAILED, which is a clearer signal than a
    hard crash at import time.
    """
    if os.path.exists(_SYSTEM_CA_FILE):
        return _SYSTEM_CA_FILE
    return True


def _get_client() -> httpx.AsyncClient:
    """Lazy-init the shared httpx client."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=MAX_API_BASE,
            timeout=_HTTP_TIMEOUT,
            headers={"Content-Type": "application/json"},
            verify=_get_verify_path(),
        )
    return _client


async def close_client() -> None:
    """
    Close the shared client. Called from the app's lifespan
    shutdown. Safe to call if the client was never created.
    """
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


# ---------------------------------------------------------------------------
# Outgoing API calls
# ---------------------------------------------------------------------------

async def _authorized_post(
    path: str,
    json_body: Dict[str, Any],
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    POST to the MAX API with the bot token in the Authorization
    header. MAX no longer accepts the token as a query parameter —
    it MUST be in the header.

    Raises httpx.HTTPStatusError on non-2xx responses.
    """
    token = settings.MAX_BOT_TOKEN
    if not token:
        raise RuntimeError("MAX_BOT_TOKEN is not configured")

    client = _get_client()
    resp = await client.post(
        path,
        json=json_body,
        params=params,
        headers={"Authorization": token},
    )

    if resp.status_code >= 400:
        log.error(
            "MAX API error: %s %s → %s %s",
            path,
            params,
            resp.status_code,
            resp.text[:500],
        )
    resp.raise_for_status()
    return resp.json()


async def send_message(
    user_id: int,
    text: str,
    keyboard: Optional[List[List[Dict[str, Any]]]] = None,
    format: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Send a message to a user (dialog) or chat.

    user_id — the MAX user id. Use chat_id for groups; the
    inventory bot only talks to users in private dialogs, so
    chat_id is not exposed here.

    keyboard — a list of rows, each row a list of button dicts.
    The MAX format for an inline button is:

        {
            "type": "callback",
            "text": "1. 00-00022457",
            "payload": "12"          # the item id, as a string
        }

    format — "markdown" or "html", if you need formatting. For the
    inventory bot plain text is enough.
    """
    body: Dict[str, Any] = {"text": text}

    if format:
        body["format"] = format

    if keyboard:
        body["attachments"] = [
            {
                "type": "inline_keyboard",
                "payload": {"buttons": keyboard},
            }
        ]

    return await _authorized_post(
        "/messages",
        json_body=body,
        params={"user_id": user_id},
    )


async def answer_callback(
    callback_id: str,
    notification: Optional[str] = None,
    text: Optional[str] = None,
    keyboard: Optional[List[List[Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    """
    Answer a button tap.

    MAX expects an answer to every callback within a few seconds —
    otherwise the user sees the button "spinning". Use
    `notification` for a short toast-like message, or `text` to
    replace the original message.

    We use `notification` for the inventory bot: a short "Отмечено"
    is enough, the detailed result is sent as a separate message.
    """
    body: Dict[str, Any] = {}
    if notification:
        body["notification"] = notification
    if text is not None:
        body["message"] = {"text": text}
        if keyboard:
            body["message"]["attachments"] = [
                {
                    "type": "inline_keyboard",
                    "payload": {"buttons": keyboard},
                }
            ]

    return await _authorized_post(
        "/answers",
        json_body=body,
        params={"callback_id": callback_id},
    )


# ---------------------------------------------------------------------------
# Webhook subscription (one-time setup)
# ---------------------------------------------------------------------------

async def set_webhook(url: str, secret: Optional[str] = None) -> Dict[str, Any]:
    """
    Register a Webhook subscription. Call once, after the bot is
    moderated, with the public HTTPS URL of the webhook endpoint.

    url    — full HTTPS URL, port 443 only, no port in the URL.
             Must match the CN/SAN of the server certificate.
    secret — optional shared secret. MAX will send it back in the
             X-Max-Bot-Api-Secret header on every delivery. Strongly
             recommended for production.
    """
    body: Dict[str, Any] = {
        "url": url,
        "update_types": ["message_created", "message_callback", "bot_started"],
    }
    if secret:
        body["secret"] = secret

    return await _authorized_post("/subscriptions", json_body=body)


async def get_webhook() -> Dict[str, Any]:
    """Return the current webhook subscription, if any."""
    token = settings.MAX_BOT_TOKEN
    if not token:
        raise RuntimeError("MAX_BOT_TOKEN is not configured")
    client = _get_client()
    resp = await client.get(
        "/subscriptions",
        headers={"Authorization": token},
    )
    resp.raise_for_status()
    return resp.json()


async def delete_webhook(url: str) -> bool:
    """
    Remove a webhook subscription by URL. Use this before
    re-registering with a different secret or URL.
    """
    token = settings.MAX_BOT_TOKEN
    if not token:
        raise RuntimeError("MAX_BOT_TOKEN is not configured")
    client = _get_client()
    resp = await client.delete(
        "/subscriptions",
        params={"url": url},
        headers={"Authorization": token},
    )
    return resp.status_code < 400


# ---------------------------------------------------------------------------
# Webhook secret verification
# ---------------------------------------------------------------------------

def verify_webhook_secret(headers: Dict[str, str]) -> bool:
    """
    Check the X-Max-Bot-Api-Secret header against MAX_WEBHOOK_SECRET.

    Returns True if the secret is not configured (fail open on
    empty config — the webhook endpoint decides what to do), or
    if the header matches. Returns False otherwise.
    """
    expected = settings.MAX_WEBHOOK_SECRET
    if not expected:
        # No secret configured — the endpoint should decide. We
        # return False so the caller can log a warning.
        return False

    got = headers.get("x-max-bot-api-secret") or headers.get(
        "X-Max-Bot-Api-Secret"
    )
    if not got:
        return False

    # Constant-time comparison to avoid timing attacks.
    import hmac

    return hmac.compare_digest(got, expected)


# ---------------------------------------------------------------------------
# Update parsing
# ---------------------------------------------------------------------------

def parse_update(update: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Normalise a raw Update object from MAX into a flat dict the
    webhook handler can work with.

    Returns None for event types the inventory bot does not handle.

    Two shapes are relevant:

      message_created:
        {
          "update_type": "message_created",
          "message": {
            "sender":   {"user_id": 42, "name": "..."},
            "recipient": {"chat_id": ...} or {"user_id": 42},
            "body":     {"text": "...", "mid": "..."}
          }
        }

      message_callback:
        {
          "update_type": "message_callback",
          "callback": {
            "callback_id": "...",
            "payload": "...",             # the button's payload
            "sender":   {"user_id": 42},
            "message":  {"recipient": {"chat_id": ...}}
          }
        }

    `bot_started` and anything else: returns the raw type plus the
    fields the "Начать" button carries in MAX — user_id, username,
    name, and (optionally) the deep-link payload. That lets
    route.py log a readable identifier and send a welcome message.
    """
    utype = update.get("update_type")

    if utype == "message_created":
        msg = update.get("message") or {}
        sender = msg.get("sender") or {}
        recipient = msg.get("recipient") or {}
        body = msg.get("body") or {}

        user_id = sender.get("user_id")
        if user_id is None:
            return None

        return {
            "type": "message",
            "user_id": user_id,
            "username": sender.get("username"),
            "name": sender.get("name"),
            "chat_id": recipient.get("chat_id"),
            "text": (body.get("text") or "").strip(),
            "mid": body.get("mid"),
            "raw": update,
        }

    if utype == "message_callback":
        cb = update.get("callback") or {}
        sender = cb.get("sender") or {}
        msg = cb.get("message") or {}
        recipient = msg.get("recipient") or {}

        user_id = sender.get("user_id")
        if user_id is None:
            return None

        return {
            "type": "callback",
            "user_id": user_id,
            "username": sender.get("username"),
            "name": sender.get("name"),
            "chat_id": recipient.get("chat_id"),
            "callback_id": cb.get("callback_id"),
            "payload": cb.get("payload"),
            "raw": update,
        }

    # bot_started, and anything else — the handler can ignore or
    # handle separately. Returning the raw type lets route.py
    # decide.
    #
    # The `user` object is present in bot_started events (MAX
    # sends {user_id, name, username}) and may be absent from
    # other types. We surface all three fields so callers can log
    # a readable identifier instead of just a numeric id.
    user_obj = update.get("user") or {}
    return {
        "type": utype or "unknown",
        "user_id": user_obj.get("user_id"),
        "username": user_obj.get("username"),
        "name": user_obj.get("name"),
        "payload": update.get("payload"),
        "raw": update,
    }