# RECOMMENDED NEXT-STEP PLAN

## Phase 0: Baseline & Stabilization (Current)
- **Objective:** Get the existing codebase running locally.
- **Deliverables:** Working local development environment.
- **Actions:** 
  1. Provision PostgreSQL and Redis.
  2. Create a local `.env` with necessary API keys (Anthropic/Groq).
  3. Successfully run the backend health check and frontend.
- **Testing Required:** `curl localhost:8000/api/v1/health` must return all green.

## Phase 1: Machine Learning Integration (Academic Requirement)
- **Objective:** Add real Machine Learning to satisfy course requirements.
- **Deliverables:** A trained ML model (e.g., Churn Prediction or Anomaly Detection) wrapped in a FastAPI endpoint or integrated as a tool.
- **Actions:**
  1. Gather dataset (or generate one) for churn prediction.
  2. Train a scikit-learn or XGBoost model.
  3. Create an `ml_service` or a new integration connector `PredictiveMLConnector`.
  4. Modify the `saas_churn_prevention.json` DAG to query this model instead of relying solely on LLMs.
- **Testing Required:** Model accuracy metrics, successful DAG execution using the new tool.

## Phase 2: Workflow Testing & Hardening
- **Objective:** Prove the orchestration engine works end-to-end.
- **Deliverables:** Automated test suite and one fully functioning demo workflow.
- **Actions:**
  1. Write Pytest cases for `core/orchestrator.py` and `agents/agents.py`.
  2. Run the `saas_churn_prevention` workflow with real (or strictly mocked) HubSpot and Gmail credentials.
  3. Verify human escalation logic works in the UI.
- **Testing Required:** Minimum 80% test coverage on core engine.

## Phase 3: Frontend Polish & Demo Prep
- **Objective:** Ensure the UI is ready for presentation.
- **Deliverables:** Bug-free, polished React dashboard.
- **Actions:**
  1. Fix any API integration bugs.
  2. Polish the Workflow Builder UI.
  3. Prepare a recorded end-to-end demo showing a workflow triggering, ML prediction occurring, an LLM drafting an email, and a human approving it.
