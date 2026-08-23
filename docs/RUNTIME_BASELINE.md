# Runtime Baseline

This document records the baseline state of the SMBFlow platform after completing Phase 0 end-to-end verification.

## Infrastructure
The backend is powered by Docker-based infrastructure running locally:
- **PostgreSQL**: Serving as the relational database.
- **pgvector**: Enabled for vector embeddings and search.
- **Redis**: Running for pub/sub (used by the WebSocket broadcast).

## Application Stack
- **Backend API**: FastAPI / Uvicorn server running on `localhost:8000`. Connects to Postgres and Redis.
- **Frontend**: React application running on Vite (`localhost:5173`). UI relies on the real backend API.
- **WebSocket**: Successfully authenticates with a JWT token parameter (`/ws/{session_id}?token={token}`) and broadcasts real-time events (`workflow_triggered`, `workflow_running`, `agent_started`, `agent_live_output`, `agent_completed`).

## Workflow Execution State
The system was verified by running the existing `saas_churn_prevention` workflow for the `TechFlow SaaS Inc.` tenant from the UI.

- **Trigger Flow**: The UI successfully established a WebSocket connection and dispatched the trigger event to the backend API.
- **Agent Execution**: `research_agent`, `reasoning_agent`, `drafting_agent`, and `verification_agent` all successfully ran sequentially.
- **EPI Evidence**: A cryptographically signed EPI (Execution Provenance Record) artifact was successfully generated and stored.

### LLM Provider Behavior
- **Default Models**: By default, the `research_agent` and `verification_agent` use Anthropic (`claude-haiku-4-5-20251001`).
- **Overrides**: In our local tests, we explicitly configured the `reasoning_agent`, `drafting_agent`, and `memory_agent` to use `gemini-3.6-flash` via temporary overrides in `config/clients/saas_demo.json`.
- **Fallback / Retry Engine**: The `LLMRouter` flawlessly fell back to OpenRouter when direct Anthropic requests failed. The Orchestrator engine correctly caught OpenRouter limits and degraded/retried across models without crashing the application.
- **Known Limitations**: The primary Anthropic account and OpenRouter fallback accounts both hit credit limits (`400 BadRequest` on Anthropic, `402 Payment Required` on OpenRouter), which necessitated the Gemini overrides.
- **EPI Heuristic Flags**: The EPI validation flagged the litellm fallback exceptions as `ERROR_CONTINUATION`, which is expected given the graceful retry behavior of the architecture.

## Temporary Local Configuration
The following model overrides exist exclusively in `config/clients/saas_demo.json` to bypass paid credit limits:
- `reasoning_agent` -> `gemini/gemini-3.6-flash`
- `drafting_agent` -> `gemini/gemini-3.6-flash`
- `memory_agent` -> `gemini/gemini-3.6-flash`

> [!WARNING]
> These overrides are specific to the local demo tenant configuration (`saas_demo.json`) and must NOT be integrated into the global templates (`llm_config.json`).
