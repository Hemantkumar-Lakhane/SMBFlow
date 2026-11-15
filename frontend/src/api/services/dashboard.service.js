/**
 * Dashboard API Service
 * Encapsulated endpoint queries, mutations, and domain logic for dashboard.
 */
export function createDashboardService(api) {
  return {
    get: (tenantId) => api.get(`/dashboard/${tenantId}`),
  }
}
