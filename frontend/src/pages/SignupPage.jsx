// frontend/src/pages/SignupPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Production-quality B2B SaaS Signup & Workspace Onboarding UX.
//   • Supports direct Email/Password signup + Supabase Google OAuth.
//   • Handles Google first-login onboarding (collecting Full Name, Workspace Name, Industry - NO password).
//   • Server-controlled role authority (hardcoded org_user role for all new users).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Loader2, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { createApiClient } from '../api/client'
import { createAuthService } from '../api/services/auth.service'

const INDUSTRY_OPTIONS = [
  { label: 'SaaS / Technology', value: 'saas' },
  { label: 'Healthcare / Medical Tourism', value: 'healthcare' },
  { label: 'Professional Services', value: 'services' },
  { label: 'E-commerce / Retail', value: 'ecommerce' },
  { label: 'Financial Services', value: 'finance' },
  { label: 'Marketing / Agency', value: 'marketing' },
  { label: 'Other', value: 'other' },
]

function classifySignupError(err) {
  const status = err?.status
  const msg = String(err?.message || err?.error_description || '')
  if (status === 409 || /already registered|already exists|user_already_exists/i.test(msg)) {
    return 'An account with that email already exists. Please sign in instead.'
  }
  if (status === 422) return 'Please check all required fields and try again.'
  if (status >= 500) return 'Something went wrong on our end. Please try again in a moment.'
  if (/network error/i.test(msg)) {
    return 'Unable to reach the server. Check your connection and try again.'
  }
  return msg || 'Unable to create your workspace right now. Please try again.'
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.14C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.59H1.29C.47 8.22 0 10.06 0 12s.47 3.78 1.29 5.41l3.99-3.14z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.59l3.99 3.14c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  )
}

export default function SignupPage() {
  const navigate = useNavigate()
  const { user, token, loading: authLoading, login, provisionWorkspace, supabase, clearSessionExpired } = useAuth()

  // Google first-login onboarding state detection
  const isGoogleOnboarding = Boolean(token && user && user.requires_onboarding)

  useEffect(() => {
    if (!authLoading && token && user && !user.requires_onboarding) {
      const isAdmin = user.role === 'super_admin' || user.role === 'platform_admin'
      navigate(isAdmin ? '/admin' : '/dashboard', { replace: true })
    }
  }, [token, user, authLoading, navigate])

  const [form, setForm] = useState({
    fullName: user?.full_name || '',
    workspace: '',
    industry: 'saas',
    email: '',
    password: '',
  })

  useEffect(() => {
    if (user?.full_name && !form.fullName) {
      setForm(f => ({ ...f, fullName: user.full_name }))
    }
  }, [user?.full_name, form.fullName])

  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})

  const set = (k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setError('')
  }

  const blur = (k) => () => setTouched(t => ({ ...t, [k]: true }))

  const nameValid = form.fullName.trim().length > 0
  const workspaceValid = form.workspace.trim().length > 0
  const industryValid = Boolean(form.industry)
  const emailValid = isGoogleOnboarding || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  const passwordValid = isGoogleOnboarding || form.password.length >= 6

  const canSubmit =
    nameValid &&
    workspaceValid &&
    industryValid &&
    emailValid &&
    passwordValid &&
    !loading &&
    !googleLoading

  async function handleGoogleSignup() {
    if (!supabase) {
      setError('Supabase authentication client is not configured. Please check your setup.')
      return
    }
    setGoogleLoading(true)
    setError('')
    clearSessionExpired()
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (oauthError) throw oauthError
    } catch (err) {
      setError(classifySignupError(err))
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched({ fullName: true, workspace: true, industry: true, email: true, password: true })
    if (!canSubmit) return

    setLoading(true)
    setError('')

    try {
      if (isGoogleOnboarding) {
        // Mode B: Google First-Login Onboarding Provisioning
        await provisionWorkspace({
          full_name: form.fullName.trim(),
          workspace_name: form.workspace.trim(),
          industry: form.industry,
        })
        navigate('/dashboard', { replace: true })
        return
      }

      // Mode A: Email/Password Signup
      if (supabase) {
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: {
              full_name: form.fullName.trim(),
              workspace_name: form.workspace.trim(),
              industry: form.industry,
            },
          },
        })
        if (authErr) throw authErr

        if (authData.session) {
          const bound = createAuthService(createApiClient(authData.session.access_token))
          const profile = await bound.provision({
            full_name: form.fullName.trim(),
            workspace_name: form.workspace.trim(),
            industry: form.industry,
          }).catch(() => null)

          login(authData.session.access_token, profile || authData.user)
          navigate('/dashboard', { replace: true })
          return
        }
      }

      // Backend Signup Fallback if direct backend auth API is invoked
      const auth = createAuthService(createApiClient(null))
      const { access_token, user: resUser } = await auth.signup({
        email: form.email.trim(),
        password: form.password,
        full_name: form.fullName.trim(),
        tenant_name: form.workspace.trim(),
        industry: form.industry,
      })

      const bound = createAuthService(createApiClient(access_token))
      const profile = await bound.provision({
        full_name: form.fullName.trim(),
        workspace_name: form.workspace.trim(),
        industry: form.industry,
      }).catch(() => resUser)

      login(access_token, profile)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(classifySignupError(err))
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="text-xl font-semibold text-slate-900">SMBFlow</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
          <span>Verifying authentication...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="text-xl font-semibold text-slate-900">SMBFlow</span>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Create your workspace</h1>
          <p className="text-sm text-slate-500 mb-6">
            Set up your SMBFlow workspace and start automating your business.
          </p>

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5"
            >
              <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Google Signup Button (only shown for unauthenticated users) */}
          {!isGoogleOnboarding && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignup}
                disabled={googleLoading || loading}
                aria-label="Continue with Google"
                className="w-full py-2.5 px-4 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mb-5 shadow-2xs"
              >
                {googleLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-slate-500" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative flex items-center justify-center mb-5">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-xs text-slate-400 font-medium uppercase tracking-wider absolute">
                  or
                </span>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* 1. Full name */}
            <div>
              <label htmlFor="su-fullname" className="block text-xs font-medium text-slate-700 mb-1.5">
                Full name
              </label>
              <input
                id="su-fullname"
                type="text"
                value={form.fullName}
                onChange={set('fullName')}
                onBlur={blur('fullName')}
                placeholder="Your name"
                autoComplete="name"
                autoFocus
                aria-invalid={touched.fullName && !nameValid}
                aria-describedby={touched.fullName && !nameValid ? 'su-fullname-error' : undefined}
                className={`w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                  touched.fullName && !nameValid
                    ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                    : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
                }`}
              />
              {touched.fullName && !nameValid && (
                <p id="su-fullname-error" className="mt-1 text-xs text-red-600">Full name is required.</p>
              )}
            </div>

            {/* 2. Workspace name */}
            <div>
              <label htmlFor="su-workspace" className="block text-xs font-medium text-slate-700 mb-1">
                Workspace name
              </label>
              <p className="text-xs text-slate-400 mb-1.5">Your company, team, or business name.</p>
              <input
                id="su-workspace"
                type="text"
                value={form.workspace}
                onChange={set('workspace')}
                onBlur={blur('workspace')}
                placeholder="Acme Inc."
                autoComplete="organization"
                aria-invalid={touched.workspace && !workspaceValid}
                aria-describedby={touched.workspace && !workspaceValid ? 'su-workspace-error' : undefined}
                className={`w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                  touched.workspace && !workspaceValid
                    ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                    : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
                }`}
              />
              {touched.workspace && !workspaceValid && (
                <p id="su-workspace-error" className="mt-1 text-xs text-red-600">Workspace name is required.</p>
              )}
            </div>

            {/* 3. Industry */}
            <div>
              <label htmlFor="su-industry" className="block text-xs font-medium text-slate-700 mb-1">
                Industry
              </label>
              <p className="text-xs text-slate-400 mb-1.5">
                We'll use this to personalize your workspace and available workflows.
              </p>
              <select
                id="su-industry"
                value={form.industry}
                onChange={set('industry')}
                onBlur={blur('industry')}
                aria-invalid={touched.industry && !industryValid}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              >
                {INDUSTRY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Fields 4 & 5 (Work email & Password) only for Email Signup */}
            {!isGoogleOnboarding && (
              <>
                {/* 4. Work email */}
                <div>
                  <label htmlFor="su-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Work email
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

                {/* 5. Password */}
                <div>
                  <label htmlFor="su-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="su-password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={set('password')}
                      onBlur={blur('password')}
                      placeholder="Create a password"
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
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p id="su-password-req" className="mt-1.5 text-xs flex items-center gap-1.5">
                    <Check size={12} className={passwordValid ? 'text-green-500' : 'text-slate-300'} />
                    <span className={passwordValid ? 'text-slate-600' : 'text-slate-400'}>
                      At least 6 characters
                    </span>
                  </p>
                </div>
              </>
            )}

            {/* Primary CTA */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mt-6"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Creating workspace…</span>
                </>
              ) : (
                <span>Create workspace</span>
              )}
            </button>
          </form>

          {/* Legal / Trust Microcopy */}
          <p className="text-center text-xs text-slate-400 mt-4 leading-relaxed">
            By creating an account, you agree to SMBFlow's Terms and Privacy Policy.
          </p>

          {/* Sign-in Link */}
          {!isGoogleOnboarding && (
            <p className="text-center text-sm text-slate-500 mt-6 pt-4 border-t border-slate-100">
              Already have an account?{' '}
              <Link to="/auth" className="font-medium text-blue-600 hover:text-blue-700">
                Sign in
              </Link>
            </p>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          SMBFlow — AI Workflow Orchestration for SMBs
        </p>
      </div>
    </div>
  )
}
