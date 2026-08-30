# Phase 4 UI Implementation Map

This document maps the approved Figma designs to the actual React components, routes, and existing backend APIs. It defines the implementation strategy and execution order for transforming the inherited OpsGrid UI into the new SMBFlow product experience.

## Implementation Principles
- **Figma is the Visual Source of Truth**: Use designs for spacing, typography, dimensions, and layout structure.
- **API is the Functional Source of Truth**: Only use real data from the backend. No hardcoded or fabricated data (ROI, savings, fake names).
- **Business-First Language**: Hide raw DAG terminology, agent LLM traces, and JSON in "Advanced" sections. Focus on business value, recommendations, and evidence.

---

## Screen Mappings & Analysis

### 1. Shared SMBFlow Application Shell
* **Figma Reference**: Persistent navigation and layout across all screens.
* **Current Route**: `/*`
* **React Component**: `components/layout/Layout.jsx`, `contexts/ThemeContext.jsx`
* **API Dependencies**: `GET /api/v1/auth/me`
* **Reusable Components Needed**: Sidebar navigation, standard Page Header, unified loading Spinners, Status Badges.
* **Exact Visual Changes**: Transition to high-contrast minimal aesthetic (Stripe/Linear style). Clean up padding.
* **Missing Backend Data**: None.

### 2. Home Dashboard
* **Figma Reference**: `home.png`
* **Current Route**: `/dashboard`
* **React Component**: `pages/client/Dashboard.jsx`
* **API Dependencies**: 
  - `GET /api/v1/analytics/{tenant_id}`
  - `GET /api/v1/tenants/{tenant_id}/workflows/stats`
* **Exact Visual Changes**: Clean up data density. Remove generic alerts and move human-in-the-loop tasks entirely to the Action Center. Present a high-level operational summary.
* **Missing Backend Data**: Figma may depict exact "hours saved" or monetary ROI. If the `/analytics` endpoint doesn't return these explicit fields, fallback to honest empty states (e.g., "-").

### 3. Workflows List
* **Figma Reference**: `workflows.png`
* **Current Route**: Missing in `App.jsx`
* **React Component**: Needs to be created (`pages/client/WorkflowsPage.jsx`)
* **API Dependencies**: 
  - `GET /api/v1/workflows` (or equivalent run history endpoint)
* **Exact Visual Changes**: Data-dense table without excessive padding for easy scanning.
* **Missing Backend Data**: None.

### 4. Action Center (Escalations)
* **Figma Reference**: `action_center.png`
* **Current Route**: `/escalations`
* **React Component**: `pages/client/EscalationsPage.jsx`
* **API Dependencies**: 
  - `GET /api/v1/escalations`
  - `POST /api/v1/escalations/{escalation_id}/decide`
* **Exact Visual Changes**: Refactor into a standard "Inbox" queue format. Focus on what SMBFlow wants to do, why it recommends it, and the risk. Primary actions: Approve, Edit, Reject.
* **Missing Backend Data**: None. The API returns full context payloads for decisions.

### 5. Workflow Detail
* **Figma Reference**: `workflow_detail.png`
* **Current Route**: `/workflows/:runId`
* **React Component**: `pages/client/WorkflowDetail.jsx`
* **API Dependencies**: 
  - `GET /api/v1/workflows/{run_id}/status`
  - `GET /api/v1/workflows/{run_id}/evidence`
  - `GET /api/v1/workflows/{run_id}/system-log` (Note: Currently returning 404 in local runtime, handle gracefully)
* **Exact Visual Changes**: Emphasize Business Summary, Progress, Recommendation, and Evidence. Move raw technical execution logs out of the default view into an "Advanced/Technical" tab.
* **Missing Backend Data**: None.

### 6. Workflow Creation
* **Figma Reference**: `create_workflow.png`
* **Current Route**: `/workflows/builder`
* **React Component**: `pages/client/WorkflowBuilder.jsx`
* **API Dependencies**: 
  - `GET /api/v1/config/workflows`
  - `POST /api/v1/config/dag`
* **Exact Visual Changes**: Replace the technical DAG node editor with a business-first wizard sequence (Choose workflow → Connect data → Set rules → Define approvals → Activate). The DAG editor will be moved to Advanced Configuration.
* **Missing Backend Data**: None.

### 7. Settings (Unified Hub)
* **Figma Reference**: `settings.png`
* **Current Routes**: `/config`, `/models`, `/tools`, `/prompts`
* **React Component**: Consolidate into a new `pages/client/SettingsHub.jsx`
* **API Dependencies**: 
  - `GET /api/v1/tenants/{tenant_id}/config-schema`
  - `PUT /api/v1/tenants/{tenant_id}/config`
  - `GET /api/v1/tools`
  - `GET /api/v1/credentials`
* **Exact Visual Changes**: Consolidate disparate configuration pages into a standard tabbed interface rather than dedicating entire routes to minor configurations.
* **Missing Backend Data**: None.

---

## Identified Risks
1. **Missing Logs Endpoint**: The `GET /api/v1/workflows/{run_id}/logs` or system-log endpoint returned a 404 during verification. UI must handle this gracefully without crashing the detail view.
2. **Missing Query Parameters**: `GET /api/v1/workflows/estimate-cost` throws a 422. UI components utilizing this must correctly pass the required query parameters as defined by the OpenAPI schema.
3. **Fake Data Temptation**: Strictly enforce that missing analytics metrics are rendered as empty states rather than hardcoded UI mocks.

---

## Recommended Safest Implementation Order

1. **Shared Application Shell** (Layout, Nav, Theme) - Sets the design system foundation.
2. **Home Dashboard** - Easiest data-binding and structural implementation.
3. **Workflows List** - Straightforward table implementation establishing data density patterns.
4. **Action Center** - High value, interaction-heavy queue component.
5. **Workflow Detail** - Complex view requiring careful parsing of evidence and hiding of raw logs.
6. **Settings (Unified Hub)** - Routing consolidation and tab management.
7. **Workflow Creation** - Most complex functional change (moving from DAG editor to Wizard).
8. **Remaining Admin Screens** - Final cleanup.

*Note: Execution will proceed strictly one screen at a time with full verification before moving to the next.*
