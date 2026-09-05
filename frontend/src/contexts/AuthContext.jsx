// frontend/src/contexts/AuthContext.jsx
// ─────────────────────────────────────────────────────────────────────────────
// KEY CHANGES vs original:
//  1. JWT access token stored in React state (memory) — NOT localStorage
//     Eliminates XSS vector: malicious injected scripts cannot steal the token
//  2. Non-sensitive user profile still persisted to localStorage for UX
//     (name, email, role shown on refresh before re-auth — no token exposed)
//  3. On page refresh: user info shown immediately, token must be re-acquired
//     via a silent /auth/refresh call if you add a refresh-token cookie endpoint.
//     For now, users simply re-login on hard refresh (acceptable tradeoff vs XSS).
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import { createApiClient } from '../api/client'
import { createServices } from '../api/services'
import { onSessionExpired } from '../api/authEvents'

const AuthContext = createContext(null)

// Safe user profile storage (no token — profile is not secret)
const USER_STORAGE_KEY = 'opsgrid_user_profile'

function loadStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  // Token lives ONLY in memory — never touches localStorage / sessionStorage
  const [token, setToken] = useState(null)

  // Non-sensitive profile hydrated from localStorage for instant UI
  const [user, setUser] = useState(() => loadStoredUser())

  // One-shot flag: set when an authenticated call 401s (token expired/revoked).
  // The login page reads it to show "Your session has expired…", then clears it.
  const [sessionExpired, setSessionExpired] = useState(false)

  const login = useCallback((newToken, newUser) => {
    // Store token in memory only
    setToken(newToken)
    setUser(newUser)
    setSessionExpired(false)
    // Persist non-sensitive profile for UX continuity across soft navigations
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser))
    } catch (_) {}
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    try {
      localStorage.removeItem(USER_STORAGE_KEY)
    } catch (_) {}
  }, [])

  const clearSessionExpired = useCallback(() => setSessionExpired(false), [])

  // Bridge the transport-layer session-expiry signal into React state.
  // On an authenticated 401, clear auth (which also closes the authenticated
  // WebSocket, since WSContext no-ops without a token) and raise the flag so
  // the login page can explain what happened.
  useEffect(() => {
    return onSessionExpired(() => {
      setToken((prev) => {
        if (prev) setSessionExpired(true)
        return null
      })
      setUser(null)
      try {
        localStorage.removeItem(USER_STORAGE_KEY)
      } catch (_) {}
    })
  }, [])

  // Bound API client — recreated only when token changes
  const api = useMemo(() => createApiClient(token), [token])

  // Domain service layer, built on the bound client — recreated with it.
  const services = useMemo(() => createServices(api), [api])

  const isAdmin = user?.role === 'super_admin'

  const value = useMemo(
    () => ({
      user, token, isAdmin, login, logout, api, services,
      sessionExpired, clearSessionExpired,
    }),
    [user, token, isAdmin, login, logout, api, services, sessionExpired, clearSessionExpired],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}