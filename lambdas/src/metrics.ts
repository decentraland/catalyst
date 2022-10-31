import {
  createTestMetricsComponent,
  getDefaultHttpMetrics,
  validateMetricsDeclaration
} from '@well-known-components/metrics'
import { metricDeclarations as theGraphMetrics } from '@well-known-components/thegraph-component'

export const metrics = validateMetricsDeclaration({
  ...getDefaultHttpMetrics(),
  ...theGraphMetrics
})

export const metricsComponent = createTestMetricsComponent(metrics)
