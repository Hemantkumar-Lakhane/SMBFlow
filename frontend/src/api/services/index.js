/**
 * Index API Service
 * Encapsulated endpoint queries, mutations, and domain logic for index.
 */
import { createAuthService } from './auth.service'
import { createDashboardService } from './dashboard.service'
import { createWorkflowsService } from './workflows.service'
import { createOperationsService } from './operations.service'
import { createTenantsService } from './tenants.service'
import { createAIEngineService } from './aiEngine.service'
import { createIntegrationsService } from './integrations.service'
import { createEvidenceService } from './evidence.service'
import { createAdminService } from './admin.service'

/**
 * Build the full service layer from a bound API client.
 * @param {ReturnType<import('../client').createApiClient>} api
 */
export function createServices(api) {
  return {
    auth: createAuthService(api),
    dashboard: createDashboardService(api),
    workflows: createWorkflowsService(api),
    operations: createOperationsService(api),
    tenants: createTenantsService(api),
    aiEngine: createAIEngineService(api),
    integrations: createIntegrationsService(api),
    evidence: createEvidenceService(api),
    admin: createAdminService(api),
  }
}
