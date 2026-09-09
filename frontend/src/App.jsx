import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WSProvider }    from './contexts/WSContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { AppShell }      from './components/shell/AppShell'
import LoginPage         from './pages/LoginPage'
import SignupPage        from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage  from './pages/ResetPasswordPage'
import AccessDenied      from './components/shell/AccessDenied'
import { Spinner }       from './components/ui'

// Admin
import GodView   from './pages/admin/GodView'
import FleetCost from './pages/admin/FleetCost'
import UsersPage from './pages/admin/UsersPage'
import AdminPlatformOverview     from './pages/admin/AdminPlatformOverview'
import AdminOrganizations        from './pages/admin/AdminOrganizations'
import AdminWorkflowFleet        from './pages/admin/AdminWorkflowFleet'
import AdminWorkflowRuns         from './pages/admin/AdminWorkflowRuns'
import AdminReviewQueue          from './pages/admin/AdminReviewQueue'
import AdminAIServices           from './pages/admin/AdminAIServices'
import AdminProviderConnections  from './pages/admin/AdminProviderConnections'
import AdminModelCatalog         from './pages/admin/AdminModelCatalog'
import AdminRoutingAssignments   from './pages/admin/AdminRoutingAssignments'
import AdminSystemHealth         from './pages/admin/AdminSystemHealth'
import AdminPlatformIntegrations from './pages/admin/AdminPlatformIntegrations'
import AdminUsageCost            from './pages/admin/AdminUsageCost'
import AdminAuditLog             from './pages/admin/AdminAuditLog'
import AdminPlatformSettings     from './pages/admin/AdminPlatformSettings'

// Client — new Figma-matched pages
import Dashboard          from './pages/client/Dashboard'
import EscalationsPage    from './pages/client/EscalationsPage'
import WorkflowsPage      from './pages/client/WorkflowsPage'
import WorkflowLibrary    from './pages/client/WorkflowLibrary'
import AIEngine           from './pages/client/AIEngine'
import AIEngineSettings   from './pages/client/AIEngineSettings'
import IntegrationsPage   from './pages/client/IntegrationsPage'
import GeneralSettings    from './pages/client/GeneralSettings'
import BudgetPage         from './pages/client/BudgetPage'
import EvidencePage       from './pages/client/EvidencePage'
import IntegrationSettings from './pages/client/IntegrationSettings'

// Client — existing pages kept for builder/detail/admin tools
import WorkflowDetail  from './pages/client/WorkflowDetail'
import WorkflowBuilder from './pages/client/WorkflowBuilder'
import ModelSettings   from './pages/client/ModelSettings'
import ToolsPage       from './pages/client/ToolsPage'
import ConfigStudio    from './pages/client/ConfigStudio'
import PromptStudio    from './pages/client/PromptStudio'
import EmailQueuePage  from './pages/client/EmailQueuePage'
import PatternsPage    from './pages/client/PatternsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function HomeRedirect() {
  const { user, token } = useAuth()
  if (!token || !user) return <Navigate to="/auth" replace />
  return <Navigate to={user.role === 'super_admin' ? '/admin' : '/dashboard'} replace />
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, token } = useAuth()
  if (!token || !user) return <Navigate to="/auth" replace />
  if (adminOnly && user.role !== 'super_admin') return <AccessDenied />
  return children
}

function Wrap({ adminOnly = false, children }) {
  return (
    <ProtectedRoute adminOnly={adminOnly}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {/* Auth */}
      <Route path="/auth"                 element={<LoginPage />} />
      <Route path="/auth/signup"          element={<SignupPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password"  element={<ResetPasswordPage />} />
      <Route path="/" element={<HomeRedirect />} />

      {/* Admin */}
      <Route path="/admin"                  element={<Wrap adminOnly><AdminPlatformOverview /></Wrap>} />
      <Route path="/admin/organizations"    element={<Wrap adminOnly><AdminOrganizations /></Wrap>} />
      <Route path="/admin/users"            element={<Wrap adminOnly><UsersPage /></Wrap>} />
      <Route path="/admin/workflows"        element={<Wrap adminOnly><AdminWorkflowFleet /></Wrap>} />
      <Route path="/admin/runs"             element={<Wrap adminOnly><AdminWorkflowRuns /></Wrap>} />
      <Route path="/admin/reviews"          element={<Wrap adminOnly><AdminReviewQueue /></Wrap>} />
      <Route path="/admin/ai-services"      element={<Wrap adminOnly><AdminAIServices /></Wrap>} />
      <Route path="/admin/providers"        element={<Wrap adminOnly><AdminProviderConnections /></Wrap>} />
      <Route path="/admin/models"           element={<Wrap adminOnly><AdminModelCatalog /></Wrap>} />
      <Route path="/admin/routing"          element={<Wrap adminOnly><AdminRoutingAssignments /></Wrap>} />
      <Route path="/admin/health"           element={<Wrap adminOnly><AdminSystemHealth /></Wrap>} />
      <Route path="/admin/integrations"     element={<Wrap adminOnly><AdminPlatformIntegrations /></Wrap>} />
      <Route path="/admin/usage"            element={<Wrap adminOnly><AdminUsageCost /></Wrap>} />
      <Route path="/admin/audit"            element={<Wrap adminOnly><AdminAuditLog /></Wrap>} />
      <Route path="/admin/settings"         element={<Wrap adminOnly><AdminPlatformSettings /></Wrap>} />
      <Route path="/admin/fleet"            element={<Wrap adminOnly><AdminUsageCost /></Wrap>} />

      {/* Operations */}
      <Route path="/dashboard"   element={<Wrap><Dashboard /></Wrap>} />
      <Route path="/escalations" element={<Wrap><EscalationsPage /></Wrap>} />
      <Route path="/workflows"   element={<Wrap><WorkflowsPage /></Wrap>} />

      {/* Configuration */}
      <Route path="/workflow-library" element={<Wrap><WorkflowLibrary /></Wrap>} />
      <Route path="/ai-engine"        element={<Wrap><AIEngine /></Wrap>} />
      <Route path="/integrations"     element={<Wrap><IntegrationsPage /></Wrap>} />

      {/* Settings */}
      <Route path="/settings/general"      element={<Wrap><GeneralSettings /></Wrap>} />
      <Route path="/settings/ai-engine"    element={<Wrap><AIEngineSettings /></Wrap>} />
      <Route path="/settings/integrations" element={<Wrap><IntegrationSettings /></Wrap>} />
      <Route path="/budget"                element={<Wrap><BudgetPage /></Wrap>} />
      <Route path="/evidence"              element={<Wrap><EvidencePage /></Wrap>} />

      {/* Legacy routes kept working */}
      <Route path="/workflows/builder"     element={<Wrap><WorkflowBuilder /></Wrap>} />
      <Route path="/workflows/:runId"      element={<Wrap><WorkflowDetail /></Wrap>} />
      <Route path="/models"                element={<Wrap><ModelSettings /></Wrap>} />
      <Route path="/tools"                 element={<Wrap><ToolsPage /></Wrap>} />
      <Route path="/config"                element={<Wrap><GeneralSettings /></Wrap>} />
      <Route path="/prompts"               element={<Wrap><PromptStudio /></Wrap>} />
      <Route path="/email-queue"           element={<Wrap><EmailQueuePage /></Wrap>} />
      <Route path="/patterns"              element={<Wrap><PatternsPage /></Wrap>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
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