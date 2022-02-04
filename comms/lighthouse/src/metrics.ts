import { createTestMetricsComponent, validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/metrics/dist/http'

export const metrics = validateMetricsDeclaration({
  ...getDefaultHttpMetrics(),
  dcl_lighthouse_connected_peers_count: {
    help: 'Number of connected peers',
    type: 'gauge'
  },
  dcl_lighthouse_islands_count: {
    help: 'Number of alive islands',
    type: 'gauge'
  }
})

export const metricsComponent = createTestMetricsComponent(metrics)
