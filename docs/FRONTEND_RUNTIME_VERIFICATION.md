# Frontend Runtime Verification

This document summarizes the end-to-end verification of the OpsGrid frontend. It investigates the mismatch where the CLI workflow completed successfully, but the Admin dashboard shows 0 runs, 0 cost, and fails to trigger workflows.

## 1. Page-by-Page Status

| Page | API Endpoint(s) Used | Real Data vs Mock | Verified? | Status / Issue |
|---|---|---|---|---|
| **Dashboard / God View** | `GET /api/v1/tenants` | Real | Yes | **Broken Flow**. The page loads, but the `tenants` array returned from the API is empty. The "Trigger Workflow" modal requires a tenant to be selected, but the dropdown is empty. |
| **Fleet Cost** | `GET /api/v1/admin/fleet-cost` (implied) | Real | Yes | **Mismatch**. Shows 0 cost. The backend database has no cost records because the CLI runs bypassed database persistence. |
| **Users** | `GET /api/v1/users` | Real | Yes | **Working**. Successfully displays the `admin@opsgrid.io` super admin user fetched from the PostgreSQL database. |
| **Escalations** | `GET /api/v1/tenants/{id}/escalations` | Real | Yes | **Blocked**. The frontend logic blocks rendering if no `tenantId` is associated with the user. Shows "No tenant assigned." |
| **Evidence** | `GET /api/v1/tenants/{id}/evidence` | Real | Yes | **Blocked**. Shows "No tenant assigned." |
| **Workflow Builder** | `GET /api/v1/workflows` | Real | Yes | **Blocked**. Requires an active tenant context to load workflow variants. |
| **Workflow Detail** | `GET /api/v1/tenants/{id}/...` | Real | Yes | **Blocked**. Requires tenant context. |
| **Config Studio** | `GET /api/v1/tenants/{id}/config` | Real | Yes | **Blocked**. Shows "Ask your admin to assign you to a tenant." |
| **Prompt Studio** | `GET /api/v1/tenants/{id}/prompts` | Real | Yes | **Blocked**. Requires tenant context. |

## 2. Investigation into the CLI vs Frontend Mismatch

We investigated exactly why the CLI runs completed successfully with EPI evidence, yet the frontend displays **0 runs and 0 cost**. 

### The Root Cause
1. **The DB `tenants` table is completely empty.** 
   When the backend was initialized via `db/init.sql`, it created the `admin@opsgrid.io` user but did not seed any tenant records (e.g., "TechFlow SaaS Inc."). 
2. **The CLI runs in "Lite Mode" / In-Memory Config.**
   When we ran `python main.py trigger saas_churn_prevention --config config/clients/saas_demo.json`, the orchestrator loaded the configuration directly from the local JSON file instead of the database. 
   The execution logs confirm this: `Memory agent: patterns extracted (lite mode, no DB)`. 
3. **The Frontend strictly relies on PostgreSQL.**
   The frontend UI is completely database-driven. It calls `/api/v1/tenants` to populate the God View. Since the DB `tenants` table is empty, the UI has no tenants to display, no associated workflow runs to tally, and no cost metrics to aggregate.

**Conclusion:** The mismatch is **expected behavior** given the current data state. It is not a bug in the UI rendering, but rather an artifact of how the CLI bypasses the database while the Frontend enforces it.

## 3. Frontend-Triggered Workflow Result

**Status:** Failed.
**Reason:** To trigger a workflow from the UI (God View -> Trigger Workflow), the user must select a Tenant from the dropdown. Because `GET /api/v1/tenants` returns `[]`, the dropdown placeholder is empty. The browser verification failed to proceed past this step because the required dropdown selection could not be made.

## 4. WebSocket Verification

- The WebSocket infrastructure (`ws_sessions`, `system_events`) exists in the database schema.
- We cannot fully verify live event streaming in the browser until a workflow can be successfully triggered from the UI, which is currently blocked by the empty tenant list.

## 5. Summary of Findings

**What is working:**
- The frontend successfully communicates with the backend API.
- Authentication and database connections are operational (`admin@opsgrid.io` can log in).
- Data binding is genuine (it does not rely on static mocks; it correctly reflects the empty state of the DB).

**What is not working:**
- The "Trigger Workflow" UI is broken due to a missing fallback/validation when the tenant list is empty.
- Almost all client-facing pages (Config Studio, Prompt Studio, Escalations) are inaccessible because the admin user is not bound to a `tenant_id`, and no tenants exist.

## 6. Recommended Fixes for Later

1. **Database Seeding**: Update the `db/init.sql` script (or create a dedicated seeding command) to inject a mock tenant (e.g., `TechFlow SaaS Inc.`) and assign the admin user to it.
2. **CLI DB Sync**: Modify the CLI `trigger` command to either sync the local `.json` configuration into the PostgreSQL database before running, or explicitly warn the user that CLI runs do not populate the frontend dashboards.
3. **Frontend UI Graceful Degradation**: Add an empty-state message in the "Trigger Workflow" modal (e.g., "No tenants available. Please create a tenant first.") instead of displaying an unclickable empty dropdown.

---
**FRONTEND RUNTIME VERIFICATION COMPLETE**
