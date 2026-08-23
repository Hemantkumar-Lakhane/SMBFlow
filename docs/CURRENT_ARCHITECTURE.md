# Current Architecture

This document outlines the current existing architecture of the SMBFlow platform as inherited.

## Stack Overview
- **Frontend**: React-based UI (Vite)
- **Backend API**: FastAPI (Python)
- **Database**: PostgreSQL (with pgvector for embeddings)
- **Pub/Sub**: Redis (for WebSocket event broadcasting)
- **Agents**: Configurable multi-agent system orchestrating LLM calls and tool execution.

## Execution Flow
1. **Trigger**: Workflows are triggered via the frontend UI or direct API calls (`/api/v1/workflows/trigger`).
2. **Persistence**: The trigger validates tenant-specific configuration constraints and persists a workflow instance to the Postgres database.
3. **Orchestration**: The request is handed off to a background task (`WorkflowOrchestrator`).
4. **WebSocket Broadcasting**: As the orchestrator progresses, events are published to Redis and picked up by the API tier, which streams them to the frontend via active WebSocket connections.
5. **Agent Execution**: The orchestrator spawns agents (`research_agent`, `reasoning_agent`, `drafting_agent`, `verification_agent`) sequentially or conditionally based on the DAG definition.
6. **LLM Routing**: Agent requests flow through `LLMRouter`, which handles fallback logic (e.g. Anthropic -> OpenRouter) in the event of credit or API limits.
7. **EPI Evidence**: Upon completion, a cryptographically signed Execution Provenance Record (EPI) artifact is generated and stored on disk.
