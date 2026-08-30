import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WSProvider }    from './contexts/WSContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout            from './components/layout/Layout'
import AuthPage          from './pages/AuthPage'
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
  if (!token || !user) return <Navigate to="/auth" replace />
  if (adminOnly && user.role !== 'super_admin') return <Navigate to="/dashboard" replace />
  // Admins are allowed to view the dashboard; removed automatic redirect
  // if (!adminOnly && user.role === 'super_admin' && window.location.pathname === '/dashboard') {
  //   return <Navigate to="/admin" replace />
  // }
  return children
}

function Wrap({ adminOnly = false, children }) {
  return (
    <ProtectedRoute adminOnly={adminOnly}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
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