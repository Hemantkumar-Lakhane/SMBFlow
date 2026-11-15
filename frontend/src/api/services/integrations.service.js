/**
 * Integrations API Service
 * Encapsulated endpoint queries, mutations, and domain logic for integrations.
 */
export function createIntegrationsService(api) {
  return {
    listConnections: () => api.get('/connections'),
    getAvailableConnectors: () => api.get('/connections/available'),
    getConnection: (id) => api.get(`/connections/${id}`),
    connectTool: (payload) => api.post('/connections', payload),
    updateConnection: (id, payload) => api.patch(`/connections/${id}`, payload),
    testConnection: (id) => api.post(`/connections/${id}/test`),
    deleteConnection: (id) => api.delete(`/connections/${id}`),

    listCredentials: () => api.get('/connections'),
    createCredential: (payload) => api.post('/connections', payload),
    deleteCredential: (id) => api.delete(`/connections/${id}`),

    getSeedStatus: () => api.get('/seed-data/status'),
    generateSeed: (industry) =>
      api.post(`/seed-data/generate${industry ? `?industry=${industry}` : ''}`),
  }
}

