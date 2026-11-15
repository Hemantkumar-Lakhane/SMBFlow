/**
 * Tenants API Service
 * Encapsulated endpoint queries, mutations, and domain logic for tenants.
 */
export function createTenantsService(api) {
  return {
    list: () => api.get('/tenants'),
    get: (id) => api.get(`/tenants/${id}`),
    getConfigSchema: (id) => api.get(`/tenants/${id}/config-schema`),
    updateConfig: (id, body) => api.put(`/tenants/${id}/config`, body),
    getBudget: (id) => api.get(`/tenants/${id}/budget`),
    updateBudget: (id, settings) => api.put(`/tenants/${id}/budget`, settings),

    listUsers: () => api.get('/users'),
    createUser: (payload) => api.post('/users', payload),
    deactivateUser: (id) => api.patch(`/users/${id}/deactivate`, {}),
  }
}
