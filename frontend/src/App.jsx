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

// Client
import Dashboard       from './pages/client/Dashboard'
import WorkflowDetail  from './pages/client/WorkflowDetail'
import ConfigStudio    from './pages/client/ConfigStudio'
import ModelSettings   from './pages/client/ModelSettings'
import BudgetPage      from './pages/client/BudgetPage'
import ToolsPage       from './pages/client/ToolsPage'
import EscalationsPage from './pages/client/EscalationsPage'
import EvidencePage    from './pages/client/EvidencePage'
import WorkflowBuilder from './pages/client/WorkflowBuilder'
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
  // Unauthenticated → sign in (session-expiry clears token, so this also
  // covers an expired session; LoginPage shows the "session expired" notice).
  if (!token || !user) return <Navigate to="/auth" replace />
  // Authenticated but unauthorized for an admin-only area: show a professional
  // access-denied state inside the shell instead of a silent redirect. The
  // access rule itself (super_admin only) is unchanged.
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
      <Route path="/auth"                  element={<LoginPage />} />
      <Route path="/auth/signup"           element={<SignupPage />} />
      <Route path="/auth/forgot-password"  element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password"   element={<ResetPasswordPage />} />
      <Route path="/"     element={<HomeRedirect />} />

      <Route path="/admin"       element={<Wrap adminOnly><GodView /></Wrap>} />
      <Route path="/admin/fleet" element={<Wrap adminOnly><FleetCost /></Wrap>} />
      <Route path="/admin/users" element={<Wrap adminOnly><UsersPage /></Wrap>} />

      <Route path="/escalations" element={<Wrap><EscalationsPage /></Wrap>} />
      <Route path="/evidence"    element={<Wrap><EvidencePage /></Wrap>} />

      <Route path="/dashboard"         element={<Wrap><Dashboard /></Wrap>} />
      <Route path="/workflows/builder" element={<Wrap><WorkflowBuilder /></Wrap>} />
      <Route path="/workflows/:runId"  element={<Wrap><WorkflowDetail /></Wrap>} />
      <Route path="/config"            element={<Wrap><ConfigStudio /></Wrap>} />
      <Route path="/models"            element={<Wrap><ModelSettings /></Wrap>} />
      <Route path="/budget"            element={<Wrap><BudgetPage /></Wrap>} />
      <Route path="/tools"             element={<Wrap><ToolsPage /></Wrap>} />
      <Route path="/prompts"           element={<Wrap><PromptStudio /></Wrap>} />
      <Route path="/email-queue"       element={<Wrap><EmailQueuePage /></Wrap>} />
      <Route path="/patterns"          element={<Wrap><PatternsPage /></Wrap>} />

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