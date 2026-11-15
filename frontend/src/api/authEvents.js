/**
 * Authentication Event Dispatcher
 * Global event bus for token expiry, logout, and unauthorized API responses.
 */
const listeners = new Set()

/** Subscribe to session-expired events. Returns an unsubscribe function. */
export function onSessionExpired(handler) {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

/** Emit a session-expired event to all subscribers. */
export function emitSessionExpired() {
  listeners.forEach((fn) => {
    try { fn() } catch (_) { /* a listener error must not break others */ }
  })
}
