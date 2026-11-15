/**
 * Workflows API Service
 * Encapsulated endpoint queries, mutations, and domain logic for workflows.
 */
export function createWorkflowsService(api) {
  return {
    trigger: (payload) => api.post('/workflows/trigger', payload),
    getStatus: (runId) => api.get(`/workflows/${runId}/status`),
    pause: (runId) => api.post(`/workflows/${runId}/pause`, {}),
    stop: (runId) => api.post(`/workflows/${runId}/stop`, {}),
    resume: (runId) => api.post(`/workflows/${runId}/resume`, {}),
    fork: (runId, body) => api.post(`/workflows/${runId}/fork`, body),

    listDefinitions: () => api.get('/config/workflows'),
    getDag: (name) => api.get(`/config/dag/${name}`),
    createDag: (name, dag) => api.post('/config/dag', { name, dag }),
    updateDag: (name, dag) => api.put(`/config/dag/${name}`, { name, dag }),
    deleteDag: (name) => api.delete(`/config/dag/${name}`),
  }
}
