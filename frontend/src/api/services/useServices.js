/**
 * Service Layer React Hook
 * Provides memoized domain API service instances.
 */
import { useAuth } from '../../contexts/AuthContext'

export function useServices() {
  const { services } = useAuth()
  return services
}
