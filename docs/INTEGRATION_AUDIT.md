# INTEGRATION AUDIT

## Overview
Integrations are located in `integrations/connectors.py` and implement a unified `BaseConnector` abstract class.

## Implemented Connectors

### 1. HubSpot (`HubSpotConnector`)
- **Auth:** API Key or OAuth2 Bearer token.
- **Operations:** Read (contacts, deals, activities), Write, Create Task, Update Property.
- **Status:** Fully functional against actual HubSpot API (requires key).

### 2. Gmail (`GmailConnector`)
- **Auth:** OAuth2 Bearer token.
- **Operations:** Read (messages/threads), Write (send email).
- **Status:** Functional. Includes an important feature: `queue_for_approval`, which drafts emails instead of sending them immediately.

### 3. Slack (`SlackConnector`)
- **Auth:** Bot Token (OAuth2).
- **Operations:** Read (history), Write (post message, post formatted risk alert).
- **Status:** Functional.

### 4. Stripe (`StripeConnector`)
- **Auth:** Secret API Key.
- **Operations:** Read (customers, subscriptions, invoices).
- **Status:** Read-only functional. Write operations explicitly raise `NotImplementedError`.

### 5. Generic REST (`GenericRESTConnector`)
- **Auth:** API Key, Bearer, etc., configurable via headers.
- **Operations:** Generic GET/POST to custom endpoints.
- **Status:** Functional.

## Summary
The integrations are REAL. They are not mocked. They make real HTTP requests via `httpx.AsyncClient`. They will fail if provided with invalid credentials.
