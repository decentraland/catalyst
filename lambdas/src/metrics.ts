import { createTestMetricsComponent, validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/metrics/dist/http'

export const metrics = validateMetricsDeclaration({
  ...getDefaultHttpMetrics()
})

export const metricsComponent = createTestMetricsComponent(metrics)
