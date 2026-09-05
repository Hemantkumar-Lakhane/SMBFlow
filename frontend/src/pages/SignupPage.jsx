// frontend/src/pages/SignupPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Real account creation, wired to POST /auth/signup (verified backend contract).
//
// Backend contract (api/auth.py SignupRequest + api/main.py signup):
//   { email, password, full_name?, tenant_name?, industry? } → { access_token, user }
//   • Role is always assigned server-side as 'tenant_user' — there is NO
//     client-selectable role (the frontend must never let a user claim admin).
//   • The users table enforces role_tenant_check: a tenant_user MUST have a
//     tenant_id, and signup only creates a tenant when tenant_name is provided.
//     Therefore tenant_name (workspace name) is REQUIRED here; omitting it would
//     violate the DB constraint. We collect ONLY these backend-supported fields.
//   • Signup returns a token → auto-login is confirmed; we hydrate via /auth/me
//     (source of truth for role/tenant) then enter, exactly like LoginPage.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Loader2, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { createApiClient } from '../api/client'
import { createAuthService } from '../api/services/auth.service'

const MIN_LEN = 8

function classifySignupError(err) {
  const status = err?.status
  const msg = String(err?.message || '')
  if (status === 409 || /already registered|already exists/i.test(msg)) {
    return 'An account with that email already exists. Try signing in instead.'
  }
  if (status === 422) return 'Please check the form fields and try again.'
  if (status >= 500) return 'Something went wrong on our end. Please try again in a moment.'
  if (/network error/i.test(msg)) {
    return 'Unable to reach the server. Check your connection and try again.'
  }
  return 'Unable to create your account right now. Please try again.'
}

export default function SignupPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form, setForm] = useState({ fullName: '', workspace: '', email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setError('') }
  const blur = (k) => () => setTouched(t => ({ ...t, [k]: true }))

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  const passwordValid = form.password.length >= MIN_LEN
  const nameValid = form.fullName.trim().length > 0
  const workspaceValid = form.workspace.trim().length > 0
  const canSubmit = emailValid && passwordValid && nameValid && workspaceValid && !loading

  const roleHome = (role) => (role === 'super_admin' ? '/admin' : '/dashboard')

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched({ fullName: true, workspace: true, email: true, password: true })
    if (!canSubmit) return

    setLoading(true)
    setError('')
    try {
      const auth = createAuthService(createApiClient(null))
      const { access_token, user } = await auth.signup({
        email: form.email.trim(),
        password: form.password,
        full_name: form.fullName.trim(),
        tenant_name: form.workspace.trim(),
        industry: 'saas',
      })

      // Verify token + hydrate canonical profile (role/tenant authority).
      const bound = createAuthService(createApiClient(access_token))
      const profile = await bound.me().catch(() => user)

      login(access_token, profile)
      navigate(roleHome(profile.role), { replace: true })
    } catch (err) {
      setError(classifySignupError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="text-xl font-semibold text-slate-900">SMBFlow</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Create your account</h1>
          <p className="text-sm text-slate-500 mb-6">Set up your SMBFlow workspace.</p>

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
            {/* Full name */}
            <div>
              <label htmlFor="su-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                Full name
              </label>
              <input
                id="su-name"
                type="text"
                value={form.fullName}
                onChange={set('fullName')}
                onBlur={blur('fullName')}
                placeholder="Jordan Rivera"
                autoComplete="name"
                autoFocus
                aria-invalid={touched.fullName && !nameValid}
                aria-describedby={touched.fullName && !nameValid ? 'su-name-error' : undefined}
                className={`w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                  touched.fullName && !nameValid
                    ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                    : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
                }`}
              />
              {touched.fullName && !nameValid && (
                <p id="su-name-error" className="mt-1 text-xs text-red-600">Enter your name.</p>
              )}
            </div>

            {/* Workspace / tenant name */}
            <div>
              <label htmlFor="su-workspace" className="block text-xs font-medium text-slate-700 mb-1.5">
                Workspace name
              </label>
              <input
                id="su-workspace"
                type="text"
                value={form.workspace}
                onChange={set('workspace')}
                onBlur={blur('workspace')}
                placeholder="Acme Co."
                autoComplete="organization"
                aria-invalid={touched.workspace && !workspaceValid}
                aria-describedby={touched.workspace && !workspaceValid ? 'su-workspace-error' : 'su-workspace-hint'}
                className={`w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                  touched.workspace && !workspaceValid
                    ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                    : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
                }`}
              />
              {touched.workspace && !workspaceValid ? (
                <p id="su-workspace-error" className="mt-1 text-xs text-red-600">Enter a workspace name.</p>
              ) : (
                <p id="su-workspace-hint" className="mt-1 text-xs text-slate-400">
                  Your organization or team name.
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="su-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="su-email"
                type="email"
                value={form.email}
                onChange={set('email')}
                onBlur={blur('email')}
                placeholder="you@company.com"
                autoComplete="email"
                aria-invalid={touched.email && !emailValid}
                aria-describedby={touched.email && !emailValid ? 'su-email-error' : undefined}
                className={`w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                  touched.email && !emailValid
                    ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                    : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
                }`}
              />
              {touched.email && !emailValid && (
                <p id="su-email-error" className="mt-1 text-xs text-red-600">Enter a valid email address.</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="su-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="su-password"
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  onBlur={blur('password')}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={touched.password && !passwordValid}
                  aria-describedby="su-password-req"
                  className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                    touched.password && !passwordValid
                      ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                      : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p id="su-password-req" className="mt-1.5 text-xs flex items-center gap-1.5">
                <Check size={12} className={passwordValid ? 'text-green-500' : 'text-slate-300'} />
                <span className={passwordValid ? 'text-slate-600' : 'text-slate-400'}>
                  At least {MIN_LEN} characters
                </span>
              </p>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (<><Loader2 size={15} className="animate-spin" />Creating account...</>) : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link to="/auth" className="font-medium text-blue-600 hover:text-blue-700">
              Sign in
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
