import { metricsDefinitions as snapshotFetcherMetricsDefinitions } from '@dcl/snapshots-fetcher'
import { validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/metrics/dist/http'
import { sequentialJobMetrics } from './ports/sequecuentialTaskExecutor'

export const metricsDeclaration = validateMetricsDeclaration({
  ...getDefaultHttpMetrics(),
  ...snapshotFetcherMetricsDefinitions,
  ...sequentialJobMetrics,
  total_deployments_count: {
    help: 'Total number of deployments made to the content server',
    type: 'counter',
    labelNames: ['entity_type']
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
    labelNames: ['failed', 'entity_type']
  },

  dcl_content_garbage_collection_time: {
    help: 'Histogram of time spent in garbage collection',
    type: 'histogram',
    labelNames: []
  },

  dcl_content_ignored_deployments_total: {
    help: 'Total ignored deployments because are already synced',
    type: 'counter',
    labelNames: []
  },

  // TODO: Unify this metrics

  dcl_content_failed_deployments_total: {
    help: 'Total failed deployments',
    type: 'counter',
    labelNames: []
  },

  dcl_content_rate_limited_deployments_total: {
    help: 'Total failed deployments due rate limit',
    type: 'counter',
    labelNames: ['entity_type']
  },

  dcl_deployments_endpoint_counter: {
    help: 'Total deployments through HTTP',
    type: 'counter',
    labelNames: ['kind'] // kind=(success|validation|error)
  },

  dcl_deployment_time: {
    help: 'Time spent deploying an entity',
    type: 'histogram',
    labelNames: ['entity_type', 'failed']
  },

  dcl_pending_deployment_gauge: {
    help: 'Pending deployments',
    type: 'gauge',
    labelNames: ['entity_type']
  },
  dcl_ignored_sync_deployments: {
    help: 'Entities ignored during the synchronization and bootstrapping',
    type: 'counter',
    labelNames: []
  },
  dcl_pending_download_gauge: {
    help: 'Pending downloading jobs',
    type: 'gauge',
    labelNames: ['entity_type']
  },
  dcl_files_migrated: {
    help: 'Files migrated to new folder structure',
    type: 'counter',
    labelNames: []
  },
  dcl_entities_cache_accesses_total: {
    help: 'Entities cache accesses (miss or hit) by entity type',
    type: 'counter',
    labelNames: ['entity_type', 'result']
  },
  dcl_entities_cache_storage_max_size: {
    help: 'Entities cache storage max size',
    type: 'gauge'
  },
  dcl_entities_cache_storage_size: {
    help: 'Entities cache storage size',
    type: 'gauge',
    labelNames: ['entity_type']
  }
})
