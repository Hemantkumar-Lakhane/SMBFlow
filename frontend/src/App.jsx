import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WSProvider }    from './contexts/WSContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { AppShell }      from './components/shell/AppShell'
import LandingPage        from './pages/LandingPage'
import LoginPage          from './pages/LoginPage'
import SignupPage         from './pages/SignupPage'
import AuthCallbackPage   from './pages/AuthCallbackPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage  from './pages/ResetPasswordPage'
import AccessDenied       from './components/shell/AccessDenied'
import { Spinner }        from './components/ui'

// ── Platform Admin pages (Dynamic Route Code Splitting) ───────────────────────
const AdminPlatformOverview    = React.lazy(() => import('./pages/admin/AdminPlatformOverview'))
const AdminAssistant           = React.lazy(() => import('./pages/admin/AdminAssistant'))
// CUSTOMERS
const AdminOrganizations       = React.lazy(() => import('./pages/admin/AdminOrganizations'))
const AdminOrgDetail           = React.lazy(() => import('./pages/admin/AdminOrgDetail'))
const UsersPage                = React.lazy(() => import('./pages/admin/UsersPage'))
// WORKFLOWS
const AdminWorkflowCatalog     = React.lazy(() => import('./pages/admin/AdminWorkflowCatalog'))
const AdminWorkflowAssignments = React.lazy(() => import('./pages/admin/AdminWorkflowAssignments'))
const AdminWorkflowQACenter    = React.lazy(() => import('./pages/admin/AdminWorkflowQACenter'))
const AdminRoutingAssignments  = React.lazy(() => import('./pages/admin/AdminRoutingAssignments'))
const AdminWorkflowRuns        = React.lazy(() => import('./pages/admin/AdminWorkflowRuns'))
// BILLING
const AdminPlans               = React.lazy(() => import('./pages/admin/AdminPlans'))
const AdminSubscriptions       = React.lazy(() => import('./pages/admin/AdminSubscriptions'))
const AdminUsageCost           = React.lazy(() => import('./pages/admin/AdminUsageCost'))
const AdminInvoices            = React.lazy(() => import('./pages/admin/AdminInvoices'))
// AI PLATFORM
const AdminProviderConnections = React.lazy(() => import('./pages/admin/AdminProviderConnections'))
const AdminModelCatalog        = React.lazy(() => import('./pages/admin/AdminModelCatalog'))
// OPERATIONS
const AdminSystemHealth        = React.lazy(() => import('./pages/admin/AdminSystemHealth'))
const AdminAuditLog            = React.lazy(() => import('./pages/admin/AdminAuditLog'))
const AdminExceptions          = React.lazy(() => import('./pages/admin/AdminExceptions'))
// SYSTEM
const AdminPlatformSettings    = React.lazy(() => import('./pages/admin/AdminPlatformSettings'))

// ── SMB Owner pages (Dynamic Route Code Splitting) ────────────────────────────
const ConnectionsPage     = React.lazy(() => import('./pages/setup/ConnectionsPage'))
const CasesPage           = React.lazy(() => import('./pages/medical/CasesPage'))
const UniversalWorkflowRunner = React.lazy(() => import('./pages/client/UniversalWorkflowRunner'))
const Dashboard           = React.lazy(() => import('./pages/client/Dashboard'))
const CopilotPage         = React.lazy(() => import('./pages/client/CopilotPage'))
const EscalationsPage     = React.lazy(() => import('./pages/client/EscalationsPage'))
const WorkflowsPage       = React.lazy(() => import('./pages/client/WorkflowsPage'))
const WorkflowLibrary     = React.lazy(() => import('./pages/client/WorkflowLibrary'))
const AIEngine            = React.lazy(() => import('./pages/client/AIEngine'))
const AIEngineSettings    = React.lazy(() => import('./pages/client/AIEngineSettings'))
const GeneralSettings     = React.lazy(() => import('./pages/client/GeneralSettings'))
const BudgetPage          = React.lazy(() => import('./pages/client/BudgetPage'))
const EvidencePage        = React.lazy(() => import('./pages/client/EvidencePage'))

// ── Admin-accessible technical tools (kept for operational use) ───────────────
const WorkflowBuilder = React.lazy(() => import('./pages/client/WorkflowBuilder'))
const ModelSettings   = React.lazy(() => import('./pages/client/ModelSettings'))
const ToolsPage       = React.lazy(() => import('./pages/client/ToolsPage'))
const PromptStudio    = React.lazy(() => import('./pages/client/PromptStudio'))
const EmailQueuePage  = React.lazy(() => import('./pages/client/EmailQueuePage'))
const PatternsPage    = React.lazy(() => import('./pages/client/PatternsPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="flex items-center justify-center mb-4">
        <img 
          src="/isolatelogo.svg" 
          alt="Isolate" 
          className="h-10 w-auto max-w-[170px] object-contain dark:brightness-110"
        />
      </div>
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Spinner className="w-4 h-4 text-blue-600 animate-spin" />
        <span>Verifying authentication...</span>
      </div>
    </div>
  )
}

function HomeRedirect() {
  const { user, token, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!token || !user) return <LandingPage />
  if (user.requires_onboarding) return <Navigate to="/auth/signup" replace />
  const isAdmin = user.role === 'super_admin' || user.role === 'platform_admin'
  return <Navigate to={isAdmin ? '/admin/copilot' : '/copilot'} replace />
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, token, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!token || !user) return <Navigate to="/auth" replace />
  if (user.requires_onboarding) return <Navigate to="/auth/signup" replace />
  const isAdmin = user.role === 'super_admin' || user.role === 'platform_admin'
  if (adminOnly && !isAdmin) return <AccessDenied />
  return children
}

function Wrap({ adminOnly = false, children }) {
  return (
    <ProtectedRoute adminOnly={adminOnly}>
      <AppShell>
        <React.Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[360px] p-8 text-slate-400">
              <Spinner className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          }
        >
          {children}
        </React.Suspense>
      </AppShell>
    </ProtectedRoute>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {/* ── Public Landing Page & Auth ────────────────────────────────────── */}
      <Route path="/landing"              element={<LandingPage />} />
      <Route path="/auth"                 element={<LoginPage />} />
      <Route path="/auth/signup"          element={<SignupPage />} />
      <Route path="/auth/callback"        element={<AuthCallbackPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password"  element={<ResetPasswordPage />} />
      <Route path="/" element={<HomeRedirect />} />

      {/* ── Platform Admin — OVERVIEW ─────────────────────────────────────── */}
      <Route path="/admin"         element={<Wrap adminOnly><AdminPlatformOverview /></Wrap>} />
      <Route path="/admin/copilot" element={<Wrap adminOnly><AdminAssistant /></Wrap>} />

      {/* ── Platform Admin — CUSTOMERS ───────────────────────────────────── */}
      <Route path="/admin/organizations"        element={<Wrap adminOnly><AdminOrganizations /></Wrap>} />
      <Route path="/admin/organizations/:orgId" element={<Wrap adminOnly><AdminOrgDetail /></Wrap>} />
      <Route path="/admin/users"                element={<Wrap adminOnly><UsersPage /></Wrap>} />

      {/* ── Platform Admin — WORKFLOWS ───────────────────────────────────── */}
      <Route path="/admin/workflows/qa-center"    element={<Wrap adminOnly><AdminWorkflowQACenter /></Wrap>} />
      <Route path="/admin/workflows/catalog"      element={<Wrap adminOnly><AdminWorkflowCatalog /></Wrap>} />
      <Route path="/admin/workflows/assignments"  element={<Wrap adminOnly><AdminWorkflowAssignments /></Wrap>} />
      <Route path="/admin/runs"                   element={<Wrap adminOnly><AdminWorkflowRuns /></Wrap>} />

      {/* ── Platform Admin — BILLING ─────────────────────────────────────── */}
      <Route path="/admin/plans"         element={<Wrap adminOnly><AdminPlans /></Wrap>} />
      <Route path="/admin/subscriptions" element={<Wrap adminOnly><AdminSubscriptions /></Wrap>} />
      <Route path="/admin/usage"         element={<Wrap adminOnly><AdminUsageCost /></Wrap>} />
      <Route path="/admin/invoices"      element={<Wrap adminOnly><AdminInvoices /></Wrap>} />

      {/* ── Platform Admin — AI PLATFORM ─────────────────────────────────── */}
      <Route path="/admin/providers" element={<Wrap adminOnly><AdminProviderConnections /></Wrap>} />
      <Route path="/admin/models"    element={<Wrap adminOnly><AdminModelCatalog /></Wrap>} />
      <Route path="/admin/routing"   element={<Wrap adminOnly><AdminRoutingAssignments /></Wrap>} />

      {/* ── Platform Admin — OPERATIONS ──────────────────────────────────── */}
      <Route path="/admin/health"      element={<Wrap adminOnly><AdminSystemHealth /></Wrap>} />
      <Route path="/admin/audit"       element={<Wrap adminOnly><AdminAuditLog /></Wrap>} />
      <Route path="/admin/exceptions"  element={<Wrap adminOnly><AdminExceptions /></Wrap>} />

      {/* ── Platform Admin — SYSTEM ──────────────────────────────────────── */}
      <Route path="/admin/settings" element={<Wrap adminOnly><AdminPlatformSettings /></Wrap>} />

      {/* ── SMB Owner — Operations ───────────────────────────────────────── */}
      <Route path="/dashboard"    element={<Wrap><Dashboard /></Wrap>} />
      <Route path="/copilot"      element={<Wrap><CopilotPage /></Wrap>} />
      <Route path="/escalations"  element={<Wrap><EscalationsPage /></Wrap>} />
      <Route path="/workflows"    element={<Wrap><WorkflowsPage /></Wrap>} />
      <Route path="/medical/cases" element={<Wrap><CasesPage /></Wrap>} />

      {/* Dynamic & Universal Workflow Active Canvas Runners */}
      <Route path="/workflows/product_launch"            element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/product_launch_sprint"     element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/invoice_processing"        element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/invoice_extractor"         element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/lead_scoring"              element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/lead_enrichment_crm"       element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/finance_operations"        element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/telegram_customer_agent"   element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/devops_alert_triage"       element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/medical_journey_operations" element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/email_summarizer"          element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/meeting_intelligence_followup" element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/meeting_intelligence"          element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/run/:runId"                element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/workflows/run"                       element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/product-launch"                      element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/email-summarizer"                    element={<Wrap><UniversalWorkflowRunner /></Wrap>} />

      {/* ── SMB Owner — Configuration ────────────────────────────────────── */}
      <Route path="/workflow-library"      element={<Wrap><WorkflowLibrary /></Wrap>} />
      <Route path="/integrations"          element={<Wrap><ConnectionsPage /></Wrap>} />
      <Route path="/setup/connections"     element={<Wrap><ConnectionsPage /></Wrap>} />
      <Route path="/settings/integrations" element={<Wrap><ConnectionsPage /></Wrap>} />
      <Route path="/ai-engine"             element={<Wrap adminOnly><AIEngine /></Wrap>} />

      {/* ── SMB Owner — Settings ─────────────────────────────────────────── */}
      <Route path="/settings/general"   element={<Wrap><GeneralSettings /></Wrap>} />
      <Route path="/settings/ai-engine" element={<Wrap adminOnly><AIEngineSettings /></Wrap>} />
      <Route path="/budget"             element={<Wrap><BudgetPage /></Wrap>} />
      <Route path="/evidence"           element={<Wrap><EvidencePage /></Wrap>} />
      <Route path="/config"             element={<Wrap><GeneralSettings /></Wrap>} />

      {/* ── Admin-accessible technical tools ─────────────────────────────── */}
      <Route path="/workflows/builder" element={<Wrap adminOnly><WorkflowBuilder /></Wrap>} />
      <Route path="/workflows/:runId"  element={<Wrap><UniversalWorkflowRunner /></Wrap>} />
      <Route path="/models"            element={<Wrap adminOnly><ModelSettings /></Wrap>} />
      <Route path="/tools"             element={<Wrap adminOnly><ToolsPage /></Wrap>} />
      <Route path="/prompts"           element={<Wrap adminOnly><PromptStudio /></Wrap>} />
      <Route path="/email-queue"       element={<Wrap><EmailQueuePage /></Wrap>} />
      <Route path="/patterns"          element={<Wrap adminOnly><PatternsPage /></Wrap>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <WSProvider>
              <AppRoutes />
            </WSProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
