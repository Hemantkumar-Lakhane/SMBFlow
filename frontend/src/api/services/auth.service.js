/**
 * Auth API Service
 * Encapsulated endpoint queries, mutations, and domain logic for auth.
 */
/**
 * @param {ReturnType<import('../client').createApiClient>} api  bound API client
 */
export function createAuthService(api) {
  return {
    login: (email, password) => api.post('/auth/login', { email, password }),

    signup: (payload) => api.post('/auth/signup', payload),

    me: () => api.get('/auth/me'),

    provision: (payload) => api.post('/auth/provision', payload),


    forgotPassword: (email) => api.post('/auth/forgot-password', { email }),

    resetPassword: (token, new_password) =>
      api.post('/auth/reset-password', { token, new_password }),
  }
}
