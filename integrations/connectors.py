"""
integrations/
=============
All external tool connectors. Every connector implements BaseConnector.
Business-specific configs (credentials, IDs) come from tenant_config.json.

PATTERN:
- Connectors are loaded by the ToolRegistry at workflow start
- They read credentials from the tenant config (stored in DB, injected at runtime)
- All methods are async

CONSTANT — the connector interface is constant.
MODIFY — add new connectors by extending BaseConnector.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any, Optional

import httpx
import structlog

log = structlog.get_logger()


# ─────────────────────────────────────────────────────────────────────────────
# Base Connector Interface
# ─────────────────────────────────────────────────────────────────────────────

class BaseConnector(ABC):
    """
    All connectors implement this interface.
    Standardized: read / write / health_check.
    """

    def __init__(self, credentials: dict, config: dict = None):
        self.credentials = credentials
        self.config = config or {}
        self._client: Optional[httpx.AsyncClient] = None
        self._log = log.bind(connector=self.__class__.__name__)

    @abstractmethod
    async def authenticate(self) -> bool:
        """Establish authenticated session. Return True if successful."""
        ...

    @abstractmethod
    async def read(self, resource: str, filters: dict = None) -> list[dict]:
        """Read records. Returns list of dicts."""
        ...

    @abstractmethod
    async def write(self, resource: str, data: dict) -> dict:
        """Write a record. Returns created/updated record."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Verify connection is alive."""
        ...

    async def _get(self, url: str, params: dict = None) -> dict:
        """Shared GET helper with error handling."""
        try:
            if not self._client:
                self._client = httpx.AsyncClient(timeout=30)
            resp = await self._client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            self._log.error("GET request failed", url=url, error=str(e))
            raise

    async def _post(self, url: str, data: dict, params: dict = None) -> dict:
        """Shared POST helper."""
        try:
            if not self._client:
                self._client = httpx.AsyncClient(timeout=30)
            resp = await self._client.post(url, json=data, params=params)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            self._log.error("POST request failed", url=url, error=str(e))
            raise

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()


# ─────────────────────────────────────────────────────────────────────────────
# HubSpot CRM Connector
# ─────────────────────────────────────────────────────────────────────────────

class HubSpotConnector(BaseConnector):
    """
    HubSpot CRM - contacts, deals, activities, tasks.
    Auth: API Key or OAuth2 access token.
    """

    BASE_URL = "https://api.hubapi.com"

    def __init__(self, credentials: dict, config: dict = None):
        super().__init__(credentials, config)
        self._api_key = credentials.get("api_key") or credentials.get("access_token")
        self._headers = {"Authorization": f"Bearer {self._api_key}"}

    async def authenticate(self) -> bool:
        try:
            result = await self._get(
                f"{self.BASE_URL}/crm/v3/objects/contacts",
                params={"limit": 1}
            )
            return True
        except Exception:
            return False

    async def read(self, resource: str, filters: dict = None) -> list[dict]:
        """Read CRM records. resource: 'contacts' | 'deals' | 'activities'"""
        filters = filters or {}
        endpoint = f"{self.BASE_URL}/crm/v3/objects/{resource}"
        params = {"limit": filters.get("limit", 100)}

        try:
            if not self._client:
                self._client = httpx.AsyncClient(
                    headers=self._headers, timeout=30
                )
            resp = await self._client.get(endpoint, params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("results", [])
        except Exception as e:
            self._log.error("HubSpot read failed", resource=resource, error=str(e))
            return []

    async def write(self, resource: str, data: dict) -> dict:
        """Create or update a CRM record."""
        endpoint = f"{self.BASE_URL}/crm/v3/objects/{resource}"
        try:
            if not self._client:
                self._client = httpx.AsyncClient(headers=self._headers, timeout=30)
            resp = await self._client.post(endpoint, json={"properties": data})
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            self._log.error("HubSpot write failed", resource=resource, error=str(e))
            raise

    async def create_task(
        self, owner_id: str, subject: str, body: str, due_date: str = None
    ) -> dict:
        """Create a HubSpot task."""
        task_data = {
            "hs_task_subject": subject,
            "hs_task_body": body,
            "hs_task_status": "NOT_STARTED",
            "hs_task_priority": "HIGH",
            "hubspot_owner_id": owner_id,
        }
        if due_date:
            task_data["hs_timestamp"] = due_date
        return await self.write("tasks", task_data)

    async def update_property(
        self, object_type: str, object_id: str, properties: dict
    ) -> dict:
        """Update a CRM object's properties."""
        endpoint = f"{self.BASE_URL}/crm/v3/objects/{object_type}/{object_id}"
        try:
            if not self._client:
                self._client = httpx.AsyncClient(headers=self._headers, timeout=30)
            resp = await self._client.patch(endpoint, json={"properties": properties})
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            self._log.error("HubSpot property update failed", error=str(e))
            raise

    async def health_check(self) -> bool:
        return await self.authenticate()


# ─────────────────────────────────────────────────────────────────────────────
# Gmail Connector
# ─────────────────────────────────────────────────────────────────────────────

class GmailConnector(BaseConnector):
    """
    Gmail for sending and reading emails.
    Auth: OAuth2 via Google. Requires 'access_token' in credentials.
    """

    BASE_URL = "https://gmail.googleapis.com/gmail/v1"

    def __init__(self, credentials: dict, config: dict = None):
        super().__init__(credentials, config)
        self._access_token = credentials.get("access_token")
        self._sender_alias = (config or {}).get("sender_alias", "")
        self._sender_name = (config or {}).get("sender_name", "OpsGrid")
        self._queue_for_approval = (config or {}).get("queue_for_approval", True)

    async def authenticate(self) -> bool:
        try:
            if not self._client:
                self._client = httpx.AsyncClient(
                    headers={"Authorization": f"Bearer {self._access_token}"},
                    timeout=30
                )
            resp = await self._client.get(f"{self.BASE_URL}/users/me/profile")
            return resp.status_code == 200
        except Exception:
            return False

    async def read(self, resource: str, filters: dict = None) -> list[dict]:
        """Read recent emails. resource: 'messages' | 'threads'"""
        filters = filters or {}
        q = filters.get("q", "in:sent")
        limit = filters.get("limit", 10)
        try:
            if not self._client:
                self._client = httpx.AsyncClient(
                    headers={"Authorization": f"Bearer {self._access_token}"}, timeout=30
                )
            resp = await self._client.get(
                f"{self.BASE_URL}/users/me/{resource}",
                params={"q": q, "maxResults": limit}
            )
            resp.raise_for_status()
            return resp.json().get("messages", [])
        except Exception as e:
            self._log.error("Gmail read failed", error=str(e))
            return []

    async def write(self, resource: str, data: dict) -> dict:
        """Send an email. data: {to, subject, body}"""
        return await self.send_email(
            to=data["to"],
            subject=data["subject"],
            body=data["body"],
            from_name=data.get("from_name", self._sender_name),
        )

    async def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        from_name: str = None,
        cc: Optional[list[str]] = None,
    ) -> dict:
        """Send email via Gmail API."""
        if self._queue_for_approval:
            # In approval mode, store as draft rather than sending
            self._log.info("Email queued for approval", to=to, subject=subject)
            return {"queued": True, "to": to, "subject": subject}

        import base64
        from email.mime.text import MIMEText

        sender = f"{from_name or self._sender_name} <{self._sender_alias}>"
        msg = MIMEText(body, "plain")
        msg["to"] = to
        msg["from"] = sender
        msg["subject"] = subject
        if cc:
            msg["cc"] = ", ".join(cc)

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

        try:
            if not self._client:
                self._client = httpx.AsyncClient(
                    headers={"Authorization": f"Bearer {self._access_token}"}, timeout=30
                )
            resp = await self._client.post(
                f"{self.BASE_URL}/users/me/messages/send",
                json={"raw": raw}
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            self._log.error("Gmail send failed", error=str(e))
            raise

    async def health_check(self) -> bool:
        return await self.authenticate()


# ─────────────────────────────────────────────────────────────────────────────
# Slack Connector
# ─────────────────────────────────────────────────────────────────────────────

class SlackConnector(BaseConnector):
    """
    Slack for posting alerts and messages.
    Auth: Bot token (OAuth2).
    """

    BASE_URL = "https://slack.com/api"

    def __init__(self, credentials: dict, config: dict = None):
        super().__init__(credentials, config)
        self._bot_token = credentials.get("bot_token")
        self._cs_channel = (config or {}).get("cs_alerts_channel", "#general")
        self._sales_channel = (config or {}).get("sales_channel", "#general")

    async def authenticate(self) -> bool:
        try:
            if not self._client:
                self._client = httpx.AsyncClient(
                    headers={"Authorization": f"Bearer {self._bot_token}"}, timeout=30
                )
            resp = await self._client.post(f"{self.BASE_URL}/auth.test")
            return resp.json().get("ok", False)
        except Exception:
            return False

    async def read(self, resource: str, filters: dict = None) -> list[dict]:
        """Read channel messages."""
        channel = (filters or {}).get("channel", self._cs_channel)
        try:
            if not self._client:
                self._client = httpx.AsyncClient(
                    headers={"Authorization": f"Bearer {self._bot_token}"}, timeout=30
                )
            resp = await self._client.get(
                f"{self.BASE_URL}/conversations.history",
                params={"channel": channel, "limit": 10}
            )
            return resp.json().get("messages", [])
        except Exception as e:
            self._log.error("Slack read failed", error=str(e))
            return []

    async def write(self, resource: str, data: dict) -> dict:
        """Post a message. data: {channel, text, blocks}"""
        return await self.post_message(
            channel=data.get("channel", self._cs_channel),
            text=data.get("text", ""),
            blocks=data.get("blocks"),
        )

    async def post_message(
        self,
        channel: str,
        text: str,
        blocks: Optional[list] = None,
        username: str = "OpsGrid",
    ) -> dict:
        """Post a message to a Slack channel."""
        payload: dict[str, Any] = {
            "channel": channel,
            "text": text,
            "username": username,
        }
        if blocks:
            payload["blocks"] = blocks

        try:
            if not self._client:
                self._client = httpx.AsyncClient(
                    headers={"Authorization": f"Bearer {self._bot_token}",
                             "Content-Type": "application/json"},
                    timeout=30
                )
            resp = await self._client.post(f"{self.BASE_URL}/chat.postMessage", json=payload)
            result = resp.json()
            if not result.get("ok"):
                self._log.error("Slack post failed", error=result.get("error"))
            return result
        except Exception as e:
            self._log.error("Slack post exception", error=str(e))
            raise

    async def post_risk_alert(
        self, accounts: list[dict], channel: str = None, workflow: str = ""
    ) -> dict:
        """Post a formatted account risk alert."""
        ch = channel or self._cs_channel
        count = len(accounts)
        names = ", ".join(a.get("company_name", "Unknown") for a in accounts[:3])
        if count > 3:
            names += f" +{count - 3} more"

        text = (
            f"🚨 *OpsGrid Alert* — {workflow}\n"
            f"*{count} account(s) flagged as critical risk*: {names}\n"
            f"CSM outreach queued for review."
        )
        return await self.post_message(ch, text)

    async def health_check(self) -> bool:
        return await self.authenticate()


# ─────────────────────────────────────────────────────────────────────────────
# Stripe Connector
# ─────────────────────────────────────────────────────────────────────────────

class StripeConnector(BaseConnector):
    """
    Stripe for subscription and billing data.
    Auth: Secret API key.
    """

    BASE_URL = "https://api.stripe.com/v1"

    def __init__(self, credentials: dict, config: dict = None):
        super().__init__(credentials, config)
        self._api_key = credentials.get("secret_key")

    async def authenticate(self) -> bool:
        try:
            if not self._client:
                self._client = httpx.AsyncClient(
                    auth=(self._api_key, ""), timeout=30
                )
            resp = await self._client.get(f"{self.BASE_URL}/customers", params={"limit": 1})
            return resp.status_code == 200
        except Exception:
            return False

    async def read(self, resource: str, filters: dict = None) -> list[dict]:
        """Read Stripe data. resource: 'customers' | 'subscriptions' | 'invoices'"""
        filters = filters or {}
        params = {"limit": filters.get("limit", 100)}
        if "status" in filters:
            params["status"] = filters["status"]

        try:
            if not self._client:
                self._client = httpx.AsyncClient(auth=(self._api_key, ""), timeout=30)
            resp = await self._client.get(f"{self.BASE_URL}/{resource}", params=params)
            resp.raise_for_status()
            return resp.json().get("data", [])
        except Exception as e:
            self._log.error("Stripe read failed", resource=resource, error=str(e))
            return []

    async def write(self, resource: str, data: dict) -> dict:
        """Not typically used — Stripe is mostly read-only for us."""
        raise NotImplementedError("Stripe write not supported in this integration")

    async def health_check(self) -> bool:
        return await self.authenticate()


# ─────────────────────────────────────────────────────────────────────────────
# Generic REST Connector (catch-all for custom APIs)
# ─────────────────────────────────────────────────────────────────────────────

class GenericRESTConnector(BaseConnector):
    """
    Configurable REST connector for any API not covered above.
    Configure via the 'integrations.generic_rest' section in client config.

    [MODIFY] Use this for internal APIs, custom tools, or niche integrations.
    """

    def __init__(self, credentials: dict, config: dict = None):
        super().__init__(credentials, config)
        self._base_url = config.get("base_url", "")
        self._api_key = credentials.get("api_key", "")
        self._auth_header = config.get("auth_header", "Authorization")
        self._auth_prefix = config.get("auth_prefix", "Bearer")
        self._endpoints = config.get("endpoints", {})

    async def authenticate(self) -> bool:
        return bool(self._base_url and self._api_key)

    async def read(self, resource: str, filters: dict = None) -> list[dict]:
        endpoint = self._endpoints.get(resource, f"/{resource}")
        url = f"{self._base_url}{endpoint}"
        headers = {self._auth_header: f"{self._auth_prefix} {self._api_key}"}

        try:
            if not self._client:
                self._client = httpx.AsyncClient(headers=headers, timeout=30)
            resp = await self._client.get(url, params=filters or {})
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else [data]
        except Exception as e:
            self._log.error("Generic REST read failed", resource=resource, error=str(e))
            return []

    async def write(self, resource: str, data: dict) -> dict:
        endpoint = self._endpoints.get(resource, f"/{resource}")
        url = f"{self._base_url}{endpoint}"
        headers = {self._auth_header: f"{self._auth_prefix} {self._api_key}"}

        try:
            if not self._client:
                self._client = httpx.AsyncClient(headers=headers, timeout=30)
            resp = await self._client.post(url, json=data)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            self._log.error("Generic REST write failed", resource=resource, error=str(e))
            raise

    async def health_check(self) -> bool:
        return bool(self._base_url and self._api_key)
