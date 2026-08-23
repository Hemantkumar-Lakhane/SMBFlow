# UI/UX Redesign Audit & Plan

## 1. Current Screen Map

### Shared/Public
- **Auth Page** (`/auth`)
- **Escalations** (`/escalations`) - Human-in-the-loop decisions
- **Evidence** (`/evidence`) - Cryptographic EPI logs

### Super Admin (God Mode)
- **God View** (`/admin`) - Global system metrics
- **Fleet Cost** (`/admin/fleet`) - Cross-tenant LLM spending
- **Users** (`/admin/users`) - Tenant/User management

### Client (Tenant)
- **Dashboard** (`/dashboard`) - Run metrics, active alerts, trigger modal
- **Workflow Detail** (`/workflows/:runId`) - Real-time agent execution stream
- **Workflow Builder** (`/workflows/builder`) - DAG/pipeline creation
- **Config Studio** (`/config`) - General tenant configuration
- **Model Settings** (`/models`) - LLM routing and API keys
- **Prompt Studio** (`/prompts`) - Agent persona and instruction tuning
- **Tools Page** (`/tools`) - Integration/Function configurations
- **Patterns** (`/patterns`) - Extracted memory / RAG knowledge
- **Budget** (`/budget`) - Tenant-specific cost limits
- **Email Queue** (`/email-queue`) - Pending outbound communications

---

## 2. Current User Flow
1. **Authentication**: User logs in and is routed to `/dashboard` (client) or `/admin` (super admin).
2. **Execution**: Client clicks "Launch Workflow" -> configures payload in modal -> routed to `/workflows/:runId`.
3. **Monitoring**: WebSocket streams live logs to the UI.
4. **Intervention**: If an agent hits a blocker, it emits an `escalation_created` or `a2a_permission_requested` event. 
5. **Resolution**: The Dashboard displays pulsing banners. The user clicks "Decide" and is routed to `/escalations` to unblock the agent.

---

## 3. Top UX Problems (The "Vibe Coded" Issues)

1. **Severe Information Overload (Navigation)**: The client sidebar has 11 top-level items. Developer-centric pages (Models, Prompts, Config, Tools, Patterns) sit at the same hierarchy level as core operations (Dashboard, Workflows), creating massive clutter.
2. **Animation Fatigue**: Excessive use of `animate-pulse` on badges, pulsing `LiveDot` indicators, and shimmering progress bars create a chaotic, noisy dashboard that feels like a toy rather than an enterprise tool.
3. **Inconsistent Visual Language**: Heavy use of "gamer-style" gradients (`bg-gradient-primary`, `shadow-glow-primary`) conflicts with the serious nature of B2B workflow automation and financial cost monitoring.
4. **Scattered Settings**: Configuration is fractured across `/config`, `/models`, `/tools`, and `/budget` without a centralized "Settings" hub.
5. **Competing Alert Mechanisms**: A2A banners, Escalation banners, and sidebar badges all compete for the user's immediate attention on the Dashboard simultaneously.

---

## 4. Recommended Navigation Structure (Information Architecture)

We recommend grouping the 11 scattered routes into logical, collapsible sections:

**📊 Operations (Core)**
- Dashboard
- Workflows (Combines History & Builder)
- Inbox (Combines Escalations & Email Queue)

**🧠 AI Studio (Developer/Config)**
- Prompts
- Tools & Integrations
- Memory Patterns

**⚙️ Settings**
- General Config
- Models & Routing
- Budget & Billing
- Evidence (EPI Logs)

**🛡️ Global Admin (Super Admin Only)**
- God View
- Fleet Management
- Tenant/User Access

---

## 5. Recommended Design Direction

1. **Enterprise Calm**: Strip out gradients, glow effects, and non-essential pulsing animations. Use a clean, high-contrast minimal aesthetic (e.g., Stripe or Linear style) with distinct, semantic colors (Red/Yellow/Green) used *only* for state changes.
2. **Unified Hubs**: Consolidate settings into a standard tabbed interface rather than dedicating an entire page/route to minor configurations.
3. **Focused Action Centers**: Instead of pushing alerts to the Dashboard UI, route all human-in-the-loop interactions to a dedicated "Inbox" that handles A2A approvals, Email reviews, and escalations in a standard queue format.
4. **Data Density**: Reduce padding on data-heavy tables (like Evidence and Workflows) to allow power users to scan more information without scrolling.
