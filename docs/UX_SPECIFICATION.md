# SMBFlow Product & UX Specification

This document serves as the foundational UX and product specification for the upcoming Figma redesign of SMBFlow. It maps the current technical capabilities into a professional B2B SaaS product structure.

## 1. Primary User Personas & Goals
- **SMB Operations Manager (Primary)**
  - *Goals:* Automate repetitive back-office tasks, prevent churn, monitor business health, and ensure AI actions are safe before they are sent to customers. Needs ROI visibility.
- **Workflow Developer / Admin (Secondary)**
  - *Goals:* Configure agent prompts, manage LLM models, set API keys, design DAG workflows, and monitor token/cost limits.
- **Platform Super Admin (OpsGrid Team)**
  - *Goals:* Manage tenants, monitor global fleet costs, oversee system-wide health and cryptographic EPI (Execution Provenance) evidence.

## 2. Main Daily User Journey
1. **Event Trigger:** A business event (e.g., a customer's usage drops, triggering churn risk) automatically kicks off a workflow.
2. **AI Processing:** Agents (Research, Reasoning, Drafting) process the event autonomously in the background.
3. **Intervention Request:** An agent halts and requests human permission (A2A request or Escalation) to send a drafted email or execute an API call.
4. **Human Approval:** The Ops Manager reviews the drafted action in the "Action Center," edits if necessary, and approves it.
5. **Action & Outcome:** The execution agent fires the action, completing the workflow. The Dashboard reflects the completed run and the cost/savings (ROI) incurred.

## 3. Current Routes: Core vs. Technical
**Core Business Workflows:**
- Dashboard
- Action Center (Escalations / Email Queue)
- Workflows (History & Detail)

**Technical / Configuration (Should be hidden/nested):**
- Workflow Builder, Config Studio, Model Settings, Prompt Studio, Tools, Budget, Patterns, Evidence.

**Admin Only:**
- God View, Fleet Cost, Users.

## 4. Top 5 Most Important User Tasks
1. **Quickly unblock workflows:** Approve or reject pending AI actions (Action Center).
2. **Monitor system pulse:** See active runs, success rates, and active alerts at a glance (Dashboard).
3. **Understand ROI:** See the financial impact and estimated savings of automated tasks (Dashboard / Workflows).
4. **Audit a specific run:** Drill into a completed or failed workflow to understand exactly what the AI did and why (Workflow Detail).
5. **Adjust business logic:** Easily tweak a workflow's prompt or rules without writing code (Settings/Builder).

## 5. Dashboard Needs vs. Settings/Admin Hiding
**Dashboard Needs (Business Focus):**
- Active running workflows and their progress.
- Urgent actions requiring human approval.
- High-level business impact (workflows completed, estimated time/money saved).
- High-level cost (Total API spend this week).

**Hide under Settings (Technical Focus):**
- Individual agent token usage, LLM routing (Anthropic vs Gemini), raw prompt editing, tool bindings, and API keys.

## 6. The Human-in-the-Loop (HITL) Journey
- **Alert:** User sees a centralized badge in the Action Center for a pending item.
- **Review:** User clicks the item. They see plain-english context (e.g., "Agent wants to email John Doe offering a 20% discount").
- **Edit/Reject:** User can directly edit the drafted email, outright reject the action (stopping the workflow), or hit "Approve".
- **Resolution:** Upon approval, the workflow resumes immediately.

## 7. Workflow Creation/Configuration Journey
- **Current:** Users manually piece together DAG logic, prompts, and models across 4 different pages.
- **Target Experience:** A unified "New Workflow" flow where a user selects a template (e.g., "SaaS Churn Prevention"), assigns a budget limit, reviews the plain-english business rules, and activates it. Advanced users can click "Edit Logic" to open the node builder.

## 8. Workflow Monitoring Journey
- **List View:** Users see a table of runs with status (Running, Paused, Completed, Failed), duration, and cost.
- **Detail View:** Users see a real-time progress bar (e.g., "Researching -> Reasoning -> Drafting"). They can watch the AI "think" in real-time, but the UI should abstract away the raw JSON payload in favor of conversational milestones.

## 9. Outcome / ROI Journey
- Every workflow run calculates an `estimated_cost_usd` and an `estimated_savings_pct`. 
- The UI should aggregate these metrics over time to show the user exactly how many manual hours were saved by the platform and balance it against the API cost.

## 10. Recommended Navigation & Hierarchy
- **Operations (Default)**
  - Home (Dashboard)
  - Action Center (Inbox)
  - Workflows (History)
- **Configuration**
  - Workflow Library (Templates & Builder)
  - Memory (Patterns)
- **Settings**
  - General
  - AI Engine (Models, Tools, Prompts)
  - Budget & Billing
  - Evidence Logs

## 11. Industry Expectations for B2B Operations
- **Trust & Explainability:** The system is making autonomous decisions. The UI must always explain *why* an agent made a choice (e.g., "Drafted discount because usage dropped by 40%").
- **Clear Actions:** Buttons for "Approve" and "Reject" must be prominent, unambiguous, and safe.
- **Low Cognitive Load:** Remove developer jargon. Hide JSON, LLM models, and token counts behind tooltips or "Advanced" toggles.
- **Business Impact:** Always surface value (time/money saved) to justify the product's existence.

## 12. Exact Content/Data by Page
- **Dashboard:**
  - KPI Cards: Active Runs, Tasks Completed, Pending Actions, ROI/Savings vs Cost.
  - Quick Inbox: Top 3 pending approvals.
  - Active Feed: Live ticker of currently running workflows.
- **Workflows:**
  - Table: Run ID, Name, Status, Started Ago, Duration, Cost. Filter tabs (All, Active, Completed, Failed).
- **Action Center (Inbox):**
  - List of cards: Agent Name, Intent, Plain-English Reason, Drafted Artifact (e.g., email text), Approve/Reject/Edit buttons.
- **Workflow Detail:**
  - Status Banner, Progress Pipeline, Plain-English Activity Log, Final Output/Artifact.
- **Settings:**
  - Form fields for API Keys, Model Dropdowns, Budget thresholds, User Invites.
- **Admin (Super Admin):**
  - Global KPI Dashboard, Tenant List, Global Fleet Cost Chart.

## 13. What NOT to Expose Prominently
To maintain a professional, business-first B2B interface, **hide** the following behind "Developer Mode", "Advanced Settings", or tooltips:
- Raw JSON inputs/outputs.
- Token counts (In/Out) and chunk sizes.
- The specific LLM models being used (e.g., "gemini-3.6-flash") during normal monitoring.
- The concept of "Agents" communicating via API endpoints.
- Cryptographic EPI signatures and hash chains (unless explicitly investigating an audit).
