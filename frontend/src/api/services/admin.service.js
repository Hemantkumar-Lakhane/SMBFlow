/**
 * Admin API Service
 * Encapsulated endpoint queries, mutations, and domain logic for admin.
 */
export function createAdminService(api) {
  return {
    getGodView: () => api.get('/admin/god-view'),
    getFleetAnalytics: () => api.get('/analytics/admin/fleet'),
    getTenantAnalytics: (tenantId) => api.get(`/analytics/${tenantId}`),

    runAutoEval: (payload) => api.post('/admin/auto-eval/run', payload),
    applyAutoEvalSuggestion: (id, payload) =>
      api.post(`/admin/auto-eval/suggestions/${id}/apply`, payload),
    dismissAutoEvalSuggestion: (id) =>
      api.post(`/admin/auto-eval/suggestions/${id}/dismiss`, {}),
  }
}
