import { IMetricsComponent } from '@well-known-components/interfaces'
import { validateMetricsDeclaration } from '@well-known-components/metrics'

export const metricDeclarations = {
  test_ping_counter: {
    help: 'Count calls to ping',
    type: IMetricsComponent.CounterType,
    labelNames: ['pathname']
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
