import { createTestMetricsComponent, validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/metrics/dist/http'

export const metrics = validateMetricsDeclaration({
  ...getDefaultHttpMetrics(),
  images_built_count: {
    help: 'Images generation metrics',
    type: 'counter',
    labelNames: ['image_dimensions', 'image_size']
  },
  image_generation_time: {
    help: 'Histogram of time spent generating an image',
    type: 'histogram'
  },
  cache_hit: {
    help: 'Total amount of cache hits',
    type: 'counter',
    labelNames: ['image_size']
  },
  cache_miss: {
    help: 'Total amount of cache misses',
    type: 'counter',
    labelNames: ['image_size']
  },
  storage_size: {
    help: 'Images storage size',
    type: 'counter'
  }
})

export const metricsComponent = createTestMetricsComponent(metrics)
