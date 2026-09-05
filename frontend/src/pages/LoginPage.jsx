// frontend/src/pages/LoginPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Approved Figma login presentation, wired to the REAL backend.
//   • Calls POST /auth/login via the auth service (real credentials).
//   • Verifies/hydrates the canonical profile via GET /auth/me before entering.
//   • Token is held in memory only (AuthContext.login) — never localStorage.
//   • Role authority is the backend: super_admin → /admin, tenant_user → /dashboard.
//
// Deliberate departures from the Figma mock (see integration plan §8):
//   • NO setTimeout fake login — a real network call decides success/failure.
//   • NO client-side "SMB Owner / Platform Admin" role toggle — the backend
//     assigns the role; a client picker would be theatre.
//   • NO "Remember me" — we intentionally do not persist the JWT.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Info, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { createApiClient } from '../api/client'
import { createAuthService } from '../api/services/auth.service'

// Map a backend/transport error to a safe, user-facing message. Raw backend
// exception text is never shown; we distinguish the cases the user can act on.
function classifyLoginError(err) {
  const status = err?.status
  const msg = String(err?.message || '')
  // Backend returns 401 "Account disabled" specifically for deactivated users.
  if (status === 401 && /disabled|deactivat/i.test(msg)) {
    return 'This account has been deactivated. Contact your administrator for access.'
  }
  if (status === 401) return 'Incorrect email or password. Please try again.'
  if (status === 422) return 'Please enter a valid email and password.'
  if (status >= 500) return 'Something went wrong on our end. Please try again in a moment.'
  if (/network error/i.test(msg)) {
    return 'Unable to reach the server. Check your connection and try again.'
  }
  return 'Unable to sign in right now. Please try again.'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, sessionExpired, clearSessionExpired } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({ email: false, password: false })

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const passwordValid = password.length >= 6
  const canSubmit = emailValid && passwordValid && !loading

  const roleHome = (role) => (role === 'super_admin' ? '/admin' : '/dashboard')

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched({ email: true, password: true })
    if (!canSubmit) return

    setLoading(true)
    setError('')
    clearSessionExpired()
    try {
      // Unauthenticated client for the login call itself (no token yet).
      const authApi = createAuthService(createApiClient(null))
      const { access_token, user } = await authApi.login(email.trim(), password)

      // Verify the token and hydrate the canonical profile from the backend,
      // which is the source of truth for role/tenant.
      const bound = createAuthService(createApiClient(access_token))
      const profile = await bound.me().catch(() => user)

      login(access_token, profile)

      // Honor a redirect target captured by the route guard, else route by role.
      const from = location.state?.from?.pathname
      navigate(from || roleHome(profile.role), { replace: true })
    } catch (err) {
      setError(classifyLoginError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="text-xl font-semibold text-slate-900">SMBFlow</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Sign in to SMBFlow</h1>
          <p className="text-sm text-slate-500 mb-6">
            Access your workspace using your account credentials.
          </p>

          {/* Session-expiry notice (shown after an authenticated 401 cleared auth) */}
          {sessionExpired && !error && (
            <div
              role="status"
              className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4"
            >
              <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">Your session has expired. Please sign in again.</p>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4"
            >
              <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onBlur={() => setTouched(t => ({ ...t, email: true }))}
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                aria-invalid={touched.email && !emailValid}
                aria-describedby={touched.email && !emailValid ? 'login-email-error' : undefined}
                className={`w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                  touched.email && !emailValid
                    ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                    : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
                }`}
              />
              {touched.email && !emailValid && (
                <p id="login-email-error" className="mt-1 text-xs text-red-600">Enter a valid email address.</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-medium text-slate-700">Password</label>
                <Link to="/auth/forgot-password" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onBlur={() => setTouched(t => ({ ...t, password: true }))}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={touched.password && !passwordValid}
                  aria-describedby={touched.password && !passwordValid ? 'login-password-error' : undefined}
                  className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                    touched.password && !passwordValid
                      ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                      : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {touched.password && !passwordValid && (
                <p id="login-password-error" className="mt-1 text-xs text-red-600">Password must be at least 6 characters.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Signing in...
                </>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            New to SMBFlow?{' '}
            <Link to="/auth/signup" className="font-medium text-blue-600 hover:text-blue-700">
              Create an account
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          SMBFlow — AI Workflow Orchestration for SMBs
        </p>
      </div>
    </div>
  )
}
