// frontend/src/api/client.js

import { emitSessionExpired } from './authEvents'

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1'
export const WS_BASE  = import.meta.env.VITE_WS_BASE  || 'ws://127.0.0.1:8000/ws'

/**
 * Core fetch wrapper.
 * - Injects Authorization header when token is provided
 * - Throws Error with server's `detail` message on failure
 * - Returns null on 204 No Content
 */
export async function apiCall(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { headers, ...options })
  } catch (networkErr) {
    throw new Error(`Network error: cannot reach API. Is the server running?`)
  }

  if (!res.ok) {
    // Authenticated session expiry: a 401 returned while a bearer token was
    // attached means the token is no longer valid. Signal AuthContext to clear
    // auth (which also tears down the authenticated WebSocket) and redirect.
    // Unauthenticated calls (login/forgot/reset use token === null) are exempt,
    // so their 401s are handled inline as ordinary errors.
    if (res.status === 401 && token) {
      emitSessionExpired()
    }

    let detail = `${res.status} ${res.statusText}`
    try {
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const body = await res.json()
        // Handle FastAPI 422 Validation Error arrays
        if (Array.isArray(body.detail)) {
          detail = body.detail.map(err => {
            const field = err.loc ? err.loc.slice(-1).join('.') : 'field'
            return `[${field}]: ${err.msg}`
          }).join(' | ')
        } else {
          detail = body.detail || body.message || detail
        }
      } else {
        const text = await res.text()
        // Only include text if it looks like a real message, not raw HTML
        if (text && !text.trimStart().startsWith('<')) {
          detail = text.slice(0, 200) || detail
        }
      }
    } catch (_) {}
    const err = new Error(detail)
    err.status = res.status
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

/**
 * Create a bound API client that auto-injects auth headers.
 *
 * Usage:
 *   const api = createApiClient(token)
 *   const user = await api.get('/auth/me')
 *   await api.post('/workflows/trigger', { ... })
 */
export function createApiClient(token) {
  const call = (path, opts) => apiCall(path, opts, token)

  return {
    get:    (path)        => call(path, { method: 'GET' }),
    post:   (path, data)  => call(path, { method: 'POST',   body: JSON.stringify(data) }),
    put:    (path, data)  => call(path, { method: 'PUT',    body: JSON.stringify(data) }),
    patch:  (path, data)  => call(path, { method: 'PATCH',  body: JSON.stringify(data) }),
    delete: (path)        => call(path, { method: 'DELETE' }),
  }
}