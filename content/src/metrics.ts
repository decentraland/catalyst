import { createTestMetricsComponent, validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/metrics/dist/http'

export const metrics = validateMetricsDeclaration({
  ...getDefaultHttpMetrics(),
  total_deployments_count: {
    help: 'Total number of deployments made to the content server',
    type: 'counter',
    labelNames: ['entity_type']
  },

  dcl_sync_state_summary: {
    help: 'Summary of synchronization state',
    type: 'summary',
    labelNames: ['state']
  },

  db_queued_queries_count: {
    help: 'Total number of queries that went through the queue since the service started',
    type: 'counter',
    labelNames: ['priority']
  },

  db_queued_queries_rejected_count: {
    help: 'Total number of queries that were rejected due to high number of requests',
    type: 'counter',
    labelNames: ['priority']
  },

  db_queued_queries_executed: {
    help: 'Time spent in seconds since the queries were added to the queue until they got resolved',
    type: 'histogram',
    labelNames: ['priority']
  },

  dcl_content_garbage_collection_items_total: {
    help: 'Total number of garbage collected items',
    type: 'counter',
    labelNames: []
  },

  dcl_content_snapshot_generation_time: {
    help: 'Histogram of time spent generating full snapshots',
    type: 'histogram',
    labelNames: ['failed']
  },

  dcl_content_garbage_collection_time: {
    help: 'Histogram of time spent in garbage collection',
    type: 'histogram',
    labelNames: []
  },

  dcl_content_download_time: {
    help: 'Histogram of time spent downloading files from other catalysts',
    type: 'histogram',
    labelNames: ['remote_catalyst']
  },

  dcl_content_downloaded_total: {
    help: 'Total downloaded files',
    type: 'counter',
    labelNames: ['overwritten']
  },

  dcl_content_ignored_deployments_total: {
    help: 'Total ignored deployments because are already synced',
    type: 'counter',
    labelNames: []
  },

  dcl_content_failed_deployments_total: {
    help: 'Total failed deployments',
    type: 'counter',
    labelNames: []
  }
})

export const metricsComponent = createTestMetricsComponent(metrics)
