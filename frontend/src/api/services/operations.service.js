/**
 * Operations API Service
 * Encapsulated endpoint queries, mutations, and domain logic for operations.
 */
export function createOperationsService(api) {
  return {
    listEscalations: (status) =>
      api.get(`/escalations${status ? `?status=${status}` : ''}`),
    decideEscalation: (id, body) => api.post(`/escalations/${id}/decide`, body),

    listA2ARequests: () => api.get('/a2a/requests'),
    decideA2A: (id, body) => api.post(`/a2a/${id}/decide`, body),

    listEmailQueue: (tenantId, status) =>
      api.get(`/tenants/${tenantId}/email-queue${status ? `?status=${status}` : ''}`),
    updateEmail: (id, body) => api.put(`/email-queue/${id}`, body),
    approveEmail: (id, body) => api.post(`/email-queue/${id}/approve`, body),
    rejectEmail: (id, body) => api.post(`/email-queue/${id}/reject`, body),

    listPatterns: (tenantId, status) =>
      api.get(`/tenants/${tenantId}/patterns${status ? `?status=${status}` : ''}`),
    promotePattern: (tenantId, key) =>
      api.post(`/tenants/${tenantId}/patterns/${encodeURIComponent(key)}/promote`),
    demotePattern: (tenantId, key) =>
      api.post(`/tenants/${tenantId}/patterns/${encodeURIComponent(key)}/demote`),
  }
}
