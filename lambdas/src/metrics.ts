import { IMetricsComponent } from '@well-known-components/interfaces'
import { createTestMetricsComponent, validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/metrics/dist/http'
import { metricDeclarations as theGraphMetrics } from '@well-known-components/thegraph-component'

export const metrics: IMetricsComponent.MetricsRecordDefinition<string> = validateMetricsDeclaration({
  ...getDefaultHttpMetrics(),
  ...theGraphMetrics
})

export const metricsComponent = createTestMetricsComponent(metrics)
