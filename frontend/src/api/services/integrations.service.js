// frontend/src/api/services/integrations.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Integrations: stored credentials, registered tools, and seed data.
// Verified endpoints (api/main.py):
//   GET  /credentials                 POST /credentials    DELETE /credentials/{id}
//   GET  /credentials/schema/{name}
//   GET  /tools                       POST /tools          DELETE /tools/{id}
//   GET  /tools/local                 GET  /tools/available
//   GET  /seed-data/status            POST /seed-data/generate[?industry=...]
// ─────────────────────────────────────────────────────────────────────────────

export function createIntegrationsService(api) {
  return {
    // ── Credentials ──────────────────────────────────────────────────────────
    listCredentials: () => api.get('/credentials'),
    getCredentialSchema: (name) => api.get(`/credentials/schema/${name}`),
    createCredential: (payload) => api.post('/credentials', payload),
    deleteCredential: (id) => api.delete(`/credentials/${id}`),

    // ── Tools ──────────────────────────────────────────────────────────────────
    listTools: () => api.get('/tools'),
    listLocalTools: () => api.get('/tools/local'),
    listAvailableTools: () => api.get('/tools/available'),
    createTool: (payload) => api.post('/tools', payload),
    deleteTool: (id) => api.delete(`/tools/${id}`),

    // ── Seed data ──────────────────────────────────────────────────────────────
    getSeedStatus: () => api.get('/seed-data/status'),
    generateSeed: (industry) =>
      api.post(`/seed-data/generate${industry ? `?industry=${industry}` : ''}`),
  }
}
