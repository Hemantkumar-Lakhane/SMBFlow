# SMBFLOW: MASTER RESEARCH & DEVELOPMENT BLUEPRINT

## 0. PROJECT CONTEXT

SMBFlow is an AI-powered operations platform for small-to-medium businesses (SMBs). It is built upon the technical foundation of the "OpsGrid" codebase. This blueprint defines the long-term product vision, system architecture, integration of Machine Learning (ML), and development roadmap. 

**Known Baseline**: Commit `3a4ac84 Add Phase 2 UI design proposal`.
**Current Validation**: Phase 0 runtime validation is COMPLETE. The repository is verified as a robust, Generative AI workflow orchestrator, but it currently lacks predictive ML capabilities.
**Design Reference**: Approved Figma prototype and UI design assets inside `docs/assets/ui-redesign/`.

*Note: The inherited OpsGrid project is merely the technical foundation. SMBFlow is the new product.*

---

## 1. EXECUTIVE PROJECT SUMMARY

**What is SMBFlow?**
SMBFlow is a risk-aware, predictive-to-action workflow automation platform designed to act as an intelligent operations manager for SMBs. 

**Who are the users?**
Primary users are SMB Operations Managers and business owners. Secondary users include System Administrators configuring the multi-tenant SaaS platform.

**What business problem does it solve?**
SMBs suffer from siloed data and lack the operational bandwidth to intervene when leading indicators signal problems (e.g., customer churn, invoice delays, inventory stockouts). SMBFlow predicts these risks and automates the resolution strategy, saving time and preventing revenue loss.

**What exists today (CURRENT)?**
A robust, multi-tenant Generative AI orchestrator. It uses a DAG-based engine, 6 specialized AI agents (using LiteLLM), FastAPI, WebSockets, and PostgreSQL. It executes zero-shot/few-shot prompts but does not utilize classical predictive ML.

**What is new/different about SMBFlow (PROPOSED)?**
SMBFlow introduces a **Closed-Loop Intelligence Layer**. It marries the statistical reliability of predictive ML (scoring risk) with the contextual reasoning of Generative AI (explaining risk and drafting actions), gated by human approval for high-risk operations.

**What is the intended long-term product (FUTURE)?**
A platform that continuously learns from the outcomes of its own actions, automatically refining its predictive models and LLM prompts based on stored feedback.

**What is the proposed ML contribution?**
A prediction service (e.g., XGBoost) that evaluates structured tabular data to output continuous scores (e.g., 0.85 Churn Probability).

**What is the role of LLMs?**
LLMs will interpret the ML output, merge it with unstructured business rules, draft business-facing content, and explain the recommendations to human reviewers.

**Why is human oversight important?**
To mitigate AI hallucinations and catastrophic business risks (e.g., offering a 90% discount automatically). A risk-aware policy routes critical decisions to the Action Center for human approval.

---

## 2. EXISTING SYSTEM — VERIFIED REALITY

Based on the Phase 1 audit of the actual repository, the following subsystems are categorized:

- **Frontend**: IMPLEMENTED (React 18 / Vite. Dashboard, Action Center, Workflows, Settings).
- **Backend**: IMPLEMENTED (FastAPI, REST routes, dependencies).
- **API Layer**: IMPLEMENTED (Endpoints for workflows, escalations, tools, auth).
- **Workflow Engine**: IMPLEMENTED (`core/orchestrator.py` handles DAG execution).
- **Agents**: IMPLEMENTED (Research, Reasoning, Drafting, Verification, Execution, Memory).
- **LLM Routing**: IMPLEMENTED (`core/llm_router.py` using LiteLLM).
- **RAG/Memory**: PARTIAL (PostgreSQL `pattern_memory` table exists, but feedback loops are rudimentary).
- **Database**: IMPLEMENTED (PostgreSQL + SQLAlchemy).
- **Redis**: IMPLEMENTED (Used for pub/sub and caching).
- **WebSockets**: IMPLEMENTED (Real-time dashboard updates).
- **EPI/Audit**: IMPLEMENTED (Tamper-evident `.epi` files).
- **Integrations/Tools**: IMPLEMENTED (`integrations/connectors.py` handles Slack, HubSpot, Gmail).
- **Auth/Security**: IMPLEMENTED (JWT bearer tokens, basic encryption).
- **Tenant Isolation**: IMPLEMENTED (`tenant_id` foreign keys in all tables).
- **Configuration**: IMPLEMENTED (Client-specific JSON configs).
- **Seed/Demo Data**: IMPLEMENTED (`db/seed/saas_seed.py`).
- **Tests**: UNKNOWN / PARTIAL (Minimal test coverage found during audit).
- **Documentation**: IMPLEMENTED (Architectural docs generated in Phase 1).

---

## 3. COMPLETE WORKFLOW INVENTORY

The repository contains 7 JSON-based workflows. The previous team **intended** to build predictive ML pipelines but **actually built** purely LLM-driven prompt pipelines.

| Name | Location | Business Purpose | Trigger | Execution Order | Human Approval | Actual Executability |
|------|----------|------------------|---------|-----------------|----------------|----------------------|
| SaaS Churn Prevention | `workflows/dags/saas_churn_prevention.json` | Retain at-risk customers | Event/Cron | Research -> Reason -> Draft -> Verify -> Execute -> Memory | Conditional via Policy | Yes (LLM-based) |
| SaaS Pipeline Velocity | `workflows/dags/saas_pipeline_velocity.json` | Move stalled deals | Cron | Research -> Reason -> Execute | Yes | Yes (LLM-based) |
| Finance Expense Monitoring | `workflows/dags/finance_expense_monitoring.json` | Flag unusual spending | Webhook | Research -> Reason -> Execute | Yes | Yes (LLM-based) |
| Healthcare Patient Engagement | `workflows/dags/healthcare_patient_engagement.json` | Patient follow-ups | Event | Research -> Reason -> Draft -> Execute | Yes | Yes (LLM-based) |
| RE Listing Health Monitor | `workflows/dags/re_listing_health_monitor.json` | Real estate listing optimization | Cron | Research -> Reason -> Execute | No | Yes (LLM-based) |
| RE Tenant Flight Risk | `workflows/dags/re_tenant_flight_risk.json` | Lease renewal predictions | Cron | Research -> Reason -> Execute | Yes | Yes (LLM-based) |
| Retail Inventory Health | `workflows/dags/retail_inventory_health.json` | Forecast stockouts | Cron | Research -> Reason -> Execute | Yes | Yes (LLM-based) |

**What they actually built:** A dynamic, prompt-chaining DAG engine that relies exclusively on LLMs to make numerical and logical deductions from text inputs.
**What they intended to build:** A system where classical ML generated risk scores that were fed into the LLM chain.

---

## 4. WORKFLOW × ML AUDIT

**CURRENT CLASSICAL ML IMPLEMENTATION: NO**

There is no trained model, no training code, no inference endpoint, and no prediction serving infrastructure. The only artifact found was `numpy` in a `requirements-ml.txt` file.

| Workflow | ML Intended? | ML Task | Current Implementation | Evidence | Future Integration |
|----------|--------------|---------|------------------------|----------|--------------------|
| saas_churn_prevention | YES | Churn Prediction (Classification) | Rules + LLM | No ML code exists | Pre-Reasoning Agent Prediction |
| finance_expense_monitoring | YES | Anomaly Detection | Rules + LLM | No ML code exists | Pre-Reasoning Agent Prediction |
| retail_inventory_health | YES | Forecasting (Time-Series) | Rules + LLM | No ML code exists | Pre-Reasoning Agent Prediction |

---

## 5. BUSINESS PROBLEM RESEARCH

**Candidate 1: SaaS Customer Churn (RECOMMENDED)**
- **Pain**: Lost recurring revenue, high acquisition cost to replace.
- **Data Availability**: High (usage logs, support tickets, billing history via CRM).
- **ML Feasibility**: High (Binary classification is well-studied).
- **ROI**: High (Saving a $15k/yr customer easily justifies the software cost).

**Candidate 2: Finance Expense Anomalies**
- **Pain**: Fraud, out-of-policy spending.
- **Data Availability**: Medium (requires complex ERP integration).
- **ML Feasibility**: Medium (Unsupervised anomaly detection is harder to calibrate).

**Candidate 3: Retail Inventory Stockouts**
- **Pain**: Lost sales due to missing inventory.
- **Data Availability**: Low/Medium (SMBs often have messy, decentralized inventory data).
- **ML Feasibility**: High (ARIMA/Prophet forecasting).

**Recommendation**: SaaS Customer Churn Prevention is the strongest candidate. It offers a clear target variable, high ROI, and fits the existing `saas_seed.py` data structure perfectly.

---

## 6. COMPETITOR / MARKET RESEARCH

### Gap Matrix
| Competitor | Target User | AI Capability | ML / Predictive | Human Approval | Explainability | SMBFlow Gap / Opportunity |
|------------|-------------|---------------|-----------------|----------------|----------------|---------------------------|
| **Zapier AI** | SMBs | Basic Generative | None | Pauses/Checkpoints | Low | SMBFlow offers deeper predictive logic, not just if/then triggers. |
| **Salesforce Agentforce** | Enterprise | Advanced Agents | Einstein ML | Yes | Medium | SMBFlow targets SMBs, untethered from the massive Salesforce ecosystem and pricing. |
| **Microsoft Copilot Studio** | Enterprise | Conversational AI | Azure ML | Yes | Medium | SMBFlow provides out-of-the-box workflows (Churn, Finance) rather than requiring heavy developer setup. |
| **UiPath** | Enterprise | RPA | Advanced | Yes | High | Too expensive and complex for a 50-person SMB. |

**SMBFLOW DIFFERENTIATION HYPOTHESIS**:
SMBFlow bridges the gap between simple if/then automation (Zapier) and enterprise AI platforms (Salesforce/UiPath) by offering **out-of-the-box predictive workflows** with **risk-aware human-in-the-loop decisions**, tailored for the data footprint and budget of an SMB.

---

## 7. LITERATURE REVIEW

A review of recent literature supports the proposed SMBFlow architecture:

| Title | Authors | Year | Research Problem | Key Findings | Relevance to SMBFlow |
|-------|---------|------|------------------|--------------|----------------------|
| *Explainable Machine Learning for Churn Prediction* | Coussement et al. | 2021 | Black-box churn models lack trust. | SHAP and decision trees provide necessary transparency for marketing interventions. | Validates using SHAP for the Explainability module. |
| *Large Language Models as Tool Makers* | Cai et al. | 2023 | LLM reasoning limits. | LLMs excel at tool execution and interpretation when provided with structured tools. | Validates the separation of ML (tool) and LLM (interpreter). |
| *Human-in-the-Loop Artificial Intelligence* | Monarch | 2021 | Autonomous AI risk. | Confidence-based routing significantly reduces catastrophic errors in automation. | Validates the Risk-Aware Decision Gate. |

**Unresolved Gaps / Research Opportunities**:
Much of the literature isolates ML prediction from LLM generation. There is a gap in demonstrating a closed-loop system where predictive ML, SHAP explainability, LLM reasoning, and human-in-the-loop approvals operate seamlessly within a single multi-tenant workflow engine.

---

## 8. PROPOSED SMBFLOW INNOVATION

**Proposed Contribution**: 
A risk-aware, predictive-to-action workflow architecture for SMB operations. 

**Novelty Hypothesis**: 
While ML prediction and LLM reasoning are individually common, their tight coupling via an *Explainability Translation Layer*—where an LLM translates SHAP values into business justification for a human reviewer—is a novel architectural pattern for SMB automation.

**What is NOT novel**:
- Using XGBoost for churn prediction.
- Using LLMs to draft emails.
- Web-based workflow DAGs.

**Measurable Value**:
Reduced false-positive interventions, decreased time-to-action for operations managers, and higher operational trust (measured via human approval rates).

---

## 9. FINAL SYSTEM ARCHITECTURE

*(See docs/SYSTEM_ARCHITECTURE.md for Mermaid diagrams)*

**1. Presentation Layer**: React/Vite dashboard and Action Center.
**2. API Layer**: FastAPI REST/WebSocket endpoints with JWT auth.
**3. Workflow Orchestration**: DAG engine managing state.
**4. Data Collection**: ResearchAgent fetching CRM/Usage metrics.
**5. ML Intelligence (PROPOSED)**: Prediction service outputting probabilities.
**6. Explainability (PROPOSED)**: SHAP/Feature importance generator.
**7. LLM Reasoning**: LiteLLM evaluating ML output + rules.
**8. Decision/Risk Policy**: Threshold logic determining auto vs. manual.
**9. Human Approval**: The Action Center UI.
**10. Action Execution**: ExecutionAgent hitting APIs (HubSpot, Slack).
**11. Outcome Measurement & Memory**: MemoryAgent logging results to Postgres.

---

## 10. SIMPLE BUSINESS FLOW

**Example: SaaS Churn Prevention**

1. **Trigger**: Every night, SMBFlow reviews usage data for all customers.
2. **Collect**: It notices "Acme Corp" has a 40% drop in logins this week.
3. **Predict**: The ML model calculates an 82% risk of churn for Acme Corp.
4. **Explain**: The system notes that the login drop + a recent unresolved support ticket are the driving factors.
5. **Reason**: The LLM looks at the rules ("High value customers get white-glove service") and drafts a personalized email from the Account Manager.
6. **Review**: Because the customer value is high, the system pauses and sends the draft to the Operations Manager for review.
7. **Execute**: The manager clicks "Approve", and the email is sent via Gmail.
8. **Learn**: Two weeks later, Acme Corp renews. SMBFlow logs this as a successful intervention.

---

## 11. ML DESIGN

**Target Workflow**: SaaS Churn Prevention.
**Prediction Target**: Binary (0 = Retained, 1 = Churned).
**Features**: Usage drop %, Support ticket volume, NPS score, Engagement recency.
**Training Data**: Sourced from `saas_seed.py` (simulated CRM logs).
**Candidate Models**: 
- *Logistic Regression*: High interpretability, lower capacity.
- *Random Forest*: Good baseline, robust to non-linearities.
- *XGBoost*: Best performance, excellent SHAP integration.
**Selection**: XGBoost is recommended for its balance of high accuracy and mature explainability tooling (TreeExplainer).
**Class Imbalance**: Handled via SMOTE or `scale_pos_weight`.

---

## 12. ML + LLM RESPONSIBILITY SPLIT

**Why separate them?**
LLMs are terrible at statistical math and probability. XGBoost is terrible at writing empathetic emails.

- **ML Responsibility**: Calculate the exact risk score (e.g., 0.82) based on tabular numerical data.
- **LLM Responsibility**: Read the 0.82 score, read the business rule "Offer a 10% discount if score > 0.80", and write an email saying, "We noticed you haven't been around, here's 10% off."

---

## 13. HUMAN-IN-THE-LOOP / RISK MODEL

The Decision Gate routes actions based on a 2x2 matrix of **Model Confidence** and **Business Impact**.

- **High Confidence + Low Impact** (e.g., sending a usage tip email): **Auto-Execute**.
- **Low Confidence + Low Impact** (e.g., uncertain classification for a small account): **Auto-Execute** or Drop.
- **High Confidence + High Impact** (e.g., offering a massive discount): **Approval Required**.
- **Low Confidence + High Impact** (e.g., cancelling a major contract): **Blocked / Escalated**.

---

## 14. EXPLAINABILITY

Users in the Action Center will see:
1. **The Recommendation**: "Offer Acme Corp a 15% renewal discount."
2. **The ML Score**: "Churn Risk: 85% (Critical)"
3. **The 'Why' (SHAP-derived)**:
   - 🔴 Logins dropped 40% in 14 days.
   - 🔴 3 open critical severity tickets.
   - 🟢 NPS was 9 last quarter (mitigating factor).

---

## 15. API ARCHITECTURE & TESTING

**API Map**:
- `/api/v1/workflows` (CRUD, Trigger, Status)
- `/api/v1/escalations` (Action Center approvals)
- `/api/v1/tenants` (Configuration)
- `/api/v1/auth` (Security)
- `/api/v1/predict` *(Proposed ML Endpoint)*

**Testing Strategy**:
- **Positive**: Valid JWT, correct tenant_id, valid payload -> 200 OK.
- **Negative**: Invalid payload -> 422 Unprocessable Entity.
- **Tenant-Isolation**: User A requests Workflow for Tenant B -> 403 Forbidden.
- **ML Testing**: Ensure `/predict` returns a float between 0.0 and 1.0.

---

## 16. SECURITY & GOVERNANCE

- **Tenant Isolation**: Row-level separation via `tenant_id` in Postgres.
- **Secrets Management**: Connectors use encrypted JSON fields in the database (VAULT_ENCRYPTION_KEY).
- **Audit Trails**: Every LLM input/output is hashed and saved as a `.epi` (Evidence Preservation Initiative) file.
- **Data Minimization**: Prompts only include necessary CRM fields, omitting PII where possible.

---

## 17. PRODUCT / UX ARCHITECTURE

Aligned with Figma Prototypes:
1. **Home/Dashboard**: High-level metrics, active workflows.
2. **Action Center (Escalations)**: The primary human-in-the-loop UI. Shows Drafts + ML Explainability + Approve/Reject buttons.
3. **Workflow Library**: Enable/disable predefined flows (e.g., SaaS Churn).
4. **Settings**: Connect HubSpot/Slack, configure business rules.

---

## 18. FRONTEND IMPLEMENTATION STRATEGY

**Strategy**: EXISTING FUNCTIONALITY + NEW SMBFLOW UI/UX.
Do not rewrite the frontend. We will preserve the existing React Router setup, WebSocket hooks, and state management. We will apply the new Figma design system (colors, typography, component styling) over the existing functional bones. 

---

## 19. PHASE-WISE DEVELOPMENT ROADMAP

| Phase | Objective | Status |
|-------|-----------|--------|
| **PHASE 0** | Runtime Baseline & Project Initialization | COMPLETE |
| **PHASE 1** | Existing System Reverse Engineering | COMPLETE |
| **PHASE 2** | Product / Market / Literature Research | COMPLETE |
| **PHASE 3** | UI/UX Fidelity Implementation | NEXT |
| **PHASE 4** | ML Development (Data Prep, XGBoost Training) | PLANNED |
| **PHASE 5** | ML + LLM API Integration | PLANNED |
| **PHASE 6** | Explainability & HITL UI | PLANNED |
| **PHASE 7** | Evaluation, Security, & Analytics | PLANNED |
| **PHASE 8** | Final Documentation | PLANNED |

*(Note: Phase 3 now prioritizes UI fidelity to match the approved Figma designs before backend ML integration begins, as dictated by project sponsors).*

---

## 20. TEAM EXECUTION PLAN

For a small student/agile team, parallel workstreams:
- **Workstream A (Frontend)**: Implements Phase 3 UI updates and Action Center modifications.
- **Workstream B (Data/ML)**: Extracts `saas_seed.py` data, trains XGBoost, builds `/predict` FastAPI route.
- **Workstream C (Backend/Integration)**: Modifies `ReasoningAgent` to call the `/predict` route.

---

## 21. TESTING STRATEGY

- **Unit**: Pytest for individual agent logic and ML data preprocessing.
- **Integration**: Testing the `ResearchAgent` -> `ML` -> `ReasoningAgent` handoff.
- **E2E**: Cypress/Playwright clicking through the Action Center.
- **Security**: Automated checks for tenant_id leakage.

---

## 22. EVALUATION FRAMEWORK

**ML Metrics**:
- ROC-AUC / PR-AUC (due to churn class imbalance).
- Calibration (ensuring an 80% score means 80% true probability).

**System Metrics**:
- Workflow execution latency (Target < 15 seconds).
- Human approval rate (Target > 70% approval without edits).

**Business Metrics**:
- Time saved per escalation.
- Churn prevented (simulated ROI).

---

## 23. RISKS & FAILURE MODES

| Risk | Impact | Mitigation | Fallback |
|------|--------|------------|----------|
| **Model Drift** | High | Monitor feature distributions over time. | Revert to LLM-only rules. |
| **LLM Hallucination** | High | Strict Pydantic parsing for LLM outputs. | Fail workflow, alert Admin. |
| **Tenant Leakage** | Critical| Mandatory `tenant_id` middleware. | 500 Error if context missing. |
| **API Rate Limits** | Medium | Exponential backoff in `ExecutionAgent`.| Queue task for retry. |

---

## 24. FINAL "WHAT WE ARE BUILDING"

**What is SMBFlow?**
An intelligent, risk-aware workflow orchestrator that acts as an automated operations manager for small businesses.

**What is already built?**
A highly functional multi-tenant GenAI pipeline with human-in-the-loop capabilities, database infrastructure, and a React frontend.

**What are we adding?**
A classical ML predictive layer, structured explainability, a risk-based approval policy, and an upgraded Figma-faithful UX.

**What makes our approach meaningfully different?**
We are explicitly separating statistical prediction (ML) from contextual execution (LLM), and gating it with a risk-aware human approval loop designed specifically for SMBs.

---

## 25. SOURCE QUALITY / CITATIONS

*(Citations to be maintained as research progresses)*
1. Coussement, K., et al. (2021). *Explainable Machine Learning for Churn Prediction*.
2. Cai, T., et al. (2023). *Large Language Models as Tool Makers*.
3. Monarch, R. (2021). *Human-in-the-Loop Machine Learning*.
4. NIST AI Risk Management Framework (AI RMF 1.0).

---

## 26. EVIDENCE / TRACEABILITY

- **REPOSITORY FACT**: The existing system uses LiteLLM and a custom DAG engine.
- **RESEARCH EVIDENCE**: XGBoost paired with SHAP provides state-of-the-art explainable churn predictions.
- **PROPOSED DESIGN**: Integrating a dedicated `/predict` endpoint before the `ReasoningAgent`.
- **INFERENCE**: SaaS Churn Prevention provides the clearest ROI for an SMB automation product.

---
*End of Master Blueprint*
