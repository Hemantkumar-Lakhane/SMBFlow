# FRONTEND AUDIT

## Overview
The frontend is a React 18 SPA (Single Page Application) built with Vite, TailwindCSS, and React Query. It lives in `frontend/src/`.

## Architecture
- **Routing:** React Router. Routes defined in `App.jsx`.
- **State Management:** `@tanstack/react-query` for API fetching. Context APIs (`AuthContext`, `WSContext`) for global state.
- **Styling:** TailwindCSS.

## Pages & Features
- **Authentication:** `AuthPage.jsx` (Functional).
- **Client Dashboards:** 
  - `Dashboard.jsx`: Main view.
  - `WorkflowBuilder.jsx`: UI for editing DAG JSONs.
  - `WorkflowDetail.jsx`: Deep dive into specific runs.
  - `ConfigStudio.jsx`: Edit tenant configs.
  - `PromptStudio.jsx`: Edit AI prompts.
  - `EscalationsPage.jsx`: Human-in-the-loop approval queue.
- **Admin Dashboards:**
  - `GodView.jsx`, `FleetCost.jsx`: Super-admin global views.

## Connection to Backend
It expects the FastAPI backend to be running on `localhost:8000`. Without the backend running, the frontend is effectively non-functional beyond the login screen.

## Status
- Fully built out UI with over 10,000 lines of code.
- Functional, assuming the API and DB are up.
