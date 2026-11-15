/**
 * Evidence API Service
 * Encapsulated endpoint queries, mutations, and domain logic for evidence.
 */
export function createEvidenceService(api) {
  return {
    list: () => api.get('/evidence'),
    getContent: (filename) =>
      api.get(`/evidence/${encodeURIComponent(filename)}/content`),
  }
}
