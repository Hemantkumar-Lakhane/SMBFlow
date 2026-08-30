# API Manual Test Plan

## Base URL
`http://localhost:8000/api/v1`

## Endpoints

### POST /api/v1/auth/login
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/auth/signup
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/auth/me
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/health
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tenants/{tenant_id}/connectors/health
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/admin/god-view
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/admin/live-stats
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/admin/system-events
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/users
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/users
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### PATCH /api/v1/users/{user_id}/deactivate
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tenants
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/tenants
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tenants/{tenant_id}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### PUT /api/v1/tenants/{tenant_id}/config
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tenants/{tenant_id}/config-schema
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/tenants/{tenant_id}/validate-config
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/evidence/{filename}/content
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/workflows/trigger
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/workflows/{run_id}/status
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/workflows
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/workflows/{run_id}/pause
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/workflows/{run_id}/stop
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/workflows/{run_id}/resume
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/workflows/{run_id}/evidence
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/workflows/{run_id}/system-log
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/workflows/{run_id}/fork
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tenants/{tenant_id}/workflows/stats
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/escalations
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/escalations/{escalation_id}/decide
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/a2a/requests
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/a2a/pending
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/a2a/{a2a_id}/decide
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/credentials/schema/{tool_name}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/credentials
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/credentials
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### DELETE /api/v1/credentials/{cred_id}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tools
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/tools
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### DELETE /api/v1/tools/{tool_id}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/tools/{tool_id}/test
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tenants/{tenant_id}/budget
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### PUT /api/v1/tenants/{tenant_id}/budget
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/workflows/estimate-cost
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/analytics/{tenant_id}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/analytics/admin/fleet
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/outcomes/{tenant_id}/check-pending
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tenants/{tenant_id}/email-queue
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### PUT /api/v1/email-queue/{item_id}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/email-queue/{item_id}/approve
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/email-queue/{item_id}/reject
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/evidence
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/config/models
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/config/dag/{workflow_name}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/config/workflows
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### PUT /api/v1/config/dag/{workflow_name}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/config/dag
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### DELETE /api/v1/config/dag/{workflow_name}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/config/prompt-tree
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/config/prompts/{prompt_path:path}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### PUT /api/v1/config/prompts/{prompt_path:path}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/config/prompts/{prompt_path:path}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tools/local
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tools/available
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/seed-data/status
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/seed-data/generate
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/webhooks/{tenant_id}
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/webhooks/configure
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/admin/patterns/{tenant_id}/{pattern_key}/promote
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/tenants/{tenant_id}/patterns
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/tenants/{tenant_id}/patterns/{pattern_key}/promote
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/tenants/{tenant_id}/patterns/{pattern_key}/demote
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/admin/auto-eval/run
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### GET /api/v1/admin/auto-eval/suggestions
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/admin/auto-eval/suggestions/{suggestion_id}/apply
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

### POST /api/v1/admin/auto-eval/suggestions/{suggestion_id}/dismiss
- **Status**: Implemented
- **Authentication**: Bearer Token required
- **Tenant Context**: Based on JWT
- **Dependencies**: Database, Redis

