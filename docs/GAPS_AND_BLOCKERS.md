# GAPS AND BLOCKERS

## Ranked Blockers

### P0 — Prevents Running the System
- **Missing Infrastructure (Docker):** The project relies entirely on PostgreSQL and Redis. The current environment lacks Docker, making it impossible to bring up the database or cache.
- **Impact:** Backend API fails to start. Workflows cannot be executed or tested end-to-end.
- **Evidence:** `docker --version` returns command not found.
- **Recommended Action:** Install Docker locally or provision a managed PostgreSQL/Redis instance (e.g., Supabase, Upstash) and update the `.env` file.

### P1 — Prevents Demonstrating the Project for Academic Credit
- **No Classical Machine Learning:** This is an ML course project, but the codebase uses 0 classical ML. It relies entirely on LLM prompting.
- **Impact:** Will not meet academic requirements for training/evaluating an ML model.
- **Evidence:** Codebase grep for `sklearn`, `torch`, `xgboost` returns 0 hits (excluding the audit script itself).
- **Recommended Action:** Build a classical predictive model (e.g., a churn prediction classifier) and pipe its predictions into the DAG orchestration.

### P2 — Major Functionality Gaps
- **Missing Tests:** There are no apparent unit or integration test suites covering the core orchestrator or APIs.
- **Impact:** High risk of regressions during future development.
- **Evidence:** Lack of a populated `tests/` directory.

### P3 — Improvement / Polish
- **Prompt Injection Vulnerability:** Raw data from third-party tools is injected directly into LLM prompts without sanitization.
- **Impact:** Potential for unintended agent actions.
- **Recommended Action:** Add a prompt sanitization or validation layer.
