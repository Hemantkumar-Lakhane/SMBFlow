/**
 * Aiengine API Service
 * Encapsulated endpoint queries, mutations, and domain logic for aiengine.
 */
export function createAIEngineService(api) {
  return {
    listModels: () => api.get('/config/models'),
    getHealth: () => api.get('/health'),

    getPromptTree: () => api.get('/config/prompt-tree'),
    getPrompt: (path) => api.get(`/config/prompts/${path}`),
    updatePrompt: (path, content) => api.put(`/config/prompts/${path}`, { content }),
    createPrompt: (path, content) => api.post(`/config/prompts/${path}`, { content }),
  }
}
