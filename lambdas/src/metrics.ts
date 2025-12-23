import { createTestMetricsComponent, validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@dcl/wkc-http-server'
import { metricDeclarations as theGraphMetrics } from '@well-known-components/thegraph-component'

export const metrics = validateMetricsDeclaration({
  ...getDefaultHttpMetrics(),
  ...theGraphMetrics
})

export const metricsComponent = createTestMetricsComponent(metrics)
