# Existing System Audit

## 1. System Architecture Audit
- **Frontend Architecture**: React 18 SPA with Vite, TailwindCSS, and React Query (~10,189 lines of code). Dashboards, Action Center, Configuration. WebSocket integration for live updates.
- **Backend Architecture**: FastAPI serving REST and WebSockets (~17,766 lines of Python).
- **Workflow Engine/Orchestrator**: Custom DAG runner in `core/orchestrator.py` which executes a sequence of configured agents based on JSON DAG files.
- **Agent Architecture**: BaseAgent class with 6 specialized implementations (Research, Reasoning, Drafting, Verification, Execution, Memory). Uses LiteLLM for routing.
- **LLM Routing**: Handled in `core/llm_router.py`. Supports Anthropic, Groq, OpenAI, Google via LiteLLM.
- **RAG/Memory**: Stored in `pattern_memory` PostgreSQL table and `rag_embeddings` using `pgvector`. Implemented in `core/rag_engine.py` (uses OpenAI `text-embedding-3-small` or local embeddings via `sentence-transformers`).
- **Database**: PostgreSQL (using SQLAlchemy ORM).
- **Redis/Queues/Events**: Redis used for caching/pubsub (if configured, currently local connections used mostly).
- **WebSockets**: Implemented in FastAPI for real-time frontend updates on workflow status and escalations.
- **EPI/Evidence**: Custom implementation using EPI Recorder. Records LLM interactions in `.epi` files.
- **Integrations/Tools**: `integrations/connectors.py` contains classes for HubSpot, Slack, Gmail, etc.
- **Authentication/Authorization**: Bearer tokens, JWT.
- **Tenant Isolation**: tenant_id is used across all tables (tenants, workflow_instances, etc.) for logical isolation.
- **Configuration System**: JSON files in `config/templates/` (e.g. `saas.json`) override agent behavior per client.

## 2. Complete API Inventory
*(See API_TEST_PLAN.md for full list of endpoints)*
Most endpoints are implemented (REAL IMPLEMENTED), some are stubs (PLACEHOLDER) like advanced admin analytics.

## 3. Complete Workflow Inventory
- `saas_churn_prevention.json`
- `saas_pipeline_velocity.json`
- `finance_expense_monitoring.json`
- `healthcare_patient_engagement.json`
- `re_listing_health_monitor.json`
- `re_tenant_flight_risk.json`
- `retail_inventory_health.json`

Status: All are configured via JSON DAGs but mostly execute LLM prompts.

## 4. WORKFLOW x ML MAPPING (Critical)
| Workflow | ML Intended? | ML Task | Current Implementation | Integration Point | Evidence |
|----------|--------------|---------|------------------------|-------------------|----------|
| saas_churn_prevention | YES | Churn Prediction | Rules Engine / LLM | Reasoning Agent | `requirements-ml.txt` has numpy, but no ML code exists |
| saas_pipeline_velocity | NO | N/A | Rules Engine / LLM | N/A | No ML code |
| finance_expense_monitoring | YES | Anomaly Detection | Rules Engine / LLM | Reasoning Agent | No ML code |
| retail_inventory_health | YES | Forecasting | Rules Engine / LLM | Reasoning Agent | No ML code |

## 5. ML Implementation Audit
**CURRENT CLASSICAL ML IMPLEMENTATION: NO**

"No production/working classical ML implementation was found."

Intended ML Use: Churn prediction, anomaly detection, forecasting.
Best future integration point: The Reasoning Agent in `saas_churn_prevention.json`.

## 6. Agent Inventory
1. **ResearchAgent**: Pulls data using connectors. Implemented.
2. **ReasoningAgent**: Analyzes data, scores risk using LLM. Implemented.
3. **DraftingAgent**: Writes content. Implemented.
4. **VerificationAgent**: Checks rules. Implemented.
5. **ExecutionAgent**: Triggers external tools. Implemented.
6. **MemoryAgent**: Saves outcomes. Implemented.

## 7. Data / Database Audit
PostgreSQL tables: `tenants`, `users`, `workflow_instances`, `agent_runs`, `escalations`, `pattern_memory`, `credentials`.
Data is isolated via `tenant_id`.

## 8. Frontend Audit
- **Architecture**: React 18 SPA built with Vite, TailwindCSS, and React Query. Routing via React Router (`App.jsx`).
- **State Management**: `@tanstack/react-query` for API fetching. Context APIs (`AuthContext`, `WSContext`) for global state.
- **Client Dashboards**: `Dashboard.jsx`, `WorkflowBuilder.jsx`, `WorkflowDetail.jsx`, `ConfigStudio.jsx`, `PromptStudio.jsx`, `EscalationsPage.jsx`.
- **Admin Dashboards**: `GodView.jsx`, `FleetCost.jsx`.
- **Connection**: Requires FastAPI backend on `localhost:8000`. WebSocket integration provides live updates.
- **Status**: Over 10,000 lines of code; functional with backend running.

## 9. Current System vs Future SMBFlow Plan
| Feature | Current Implementation | Evidence | Gap | Planned SMBFlow Direction |
|---------|------------------------|----------|-----|---------------------------|
| Classical ML | None | Only numpy in requirements | 100% | Integrate scikit-learn models for churn prediction |
| Workflow Automation | JSON DAGs | orchestrator.py | Low | Expand UI builder |
| LLM Reasoning | LiteLLM based | llm_router.py | Low | Fine-tune prompts |

## 11. Recommended ML Direction
- **Strongest Candidate**: `saas_churn_prevention`
- **Prediction Target**: Churn Probability (0-1)
- **Available Data**: Usage metrics, NPS, support tickets (simulated via `saas_seed.py`).
- **Possible Models**: Random Forest, XGBoost.
- **Integration**: `ReasoningAgent` should query the ML prediction endpoint/function before asking the LLM to write a summary.
