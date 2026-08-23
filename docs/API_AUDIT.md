# API AUDIT

## Overview
The API is built on FastAPI and contains 78 endpoints. It uses PostgreSQL for state and Redis for PubSub WebSocket broadcasting.

## Endpoints Summary

| Category | Endpoints | Implemented? | Notes |
|----------|-----------|--------------|-------|
| **Auth** | `/auth/login`, `/auth/signup`, `/auth/me` | Yes | Uses JWT (python-jose). Requires DB. |
| **System** | `/health`, `/tenants/{id}/connectors/health` | Yes | Checks DB, Redis, and LLM key presence. |
| **Admin** | `/admin/god-view`, `/admin/live-stats`, `/admin/system-events` | Yes | Comprehensive dashboards for cross-tenant monitoring. |
| **Users** | `/users`, `/users/{id}/deactivate` | Yes | CRUD for users. |
| **Tenants** | `/tenants`, `/tenants/{id}/config`, `/tenants/{id}/validate-config` | Yes | JSON validation built-in. |
| **Workflows**| `/workflows/trigger`, `/workflows/{id}/pause`, `/workflows/{id}/stop`, `/workflows/{id}/resume` | Yes | Core engine controls. |
| **Evidence** | `/evidence/{filename}/content` | Yes | Reads cryptographic EPI files. |

## Notable Features
- **WebSocket (`/ws/{session_id}`):** Implemented for real-time dashboard updates via Redis PubSub.
- **Middleware:** `system_integrity_check` blocks requests cleanly if `.env` variables (like DB URL) are missing.
- **Security:** Tenant isolation is enforced natively in the endpoints (`assert_tenant_access`).

## Status
The API is robust and production-ready for an MVP, but heavily coupled to PostgreSQL and Redis.
