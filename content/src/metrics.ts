import { metricsDefinitions as snapshotFetcherMetricsDefinitions } from '@dcl/snapshots-fetcher'
import { metricsDefinitions as blockIndexerMetricsDefinitions } from '@dcl/block-indexer'
import { metricDeclarations as loggerMetricDeclarations } from '@well-known-components/logger'
import { validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/http-server'
import { metricDeclarations as theGraphMetricDeclarations } from '@well-known-components/thegraph-component'
import { sequentialJobMetrics } from './ports/sequecuentialTaskExecutor'

export const metricsDeclaration = validateMetricsDeclaration({
  ...getDefaultHttpMetrics(),
  ...blockIndexerMetricsDefinitions,
  ...snapshotFetcherMetricsDefinitions,
  ...sequentialJobMetrics,
  ...theGraphMetricDeclarations,
  ...loggerMetricDeclarations,
  total_deployments_count: {
    help: 'Total number of deployments made to the content server',
    type: 'counter',
    labelNames: ['entity_type', 'deployment_context']
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
    labelNames: ['kind'] // kind=(success|validation_error|error)
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
  },
  dcl_db_query_duration_seconds: {
    help: 'Histogram of query duration to the database in seconds per query',
    type: 'histogram',
    labelNames: ['query', 'status'] // status=(success|error)
  },
  dcl_db_tx_acquired_clients_total: {
    help: 'Total number of clients acquired in a transaction',
    type: 'counter'
  },
  dcl_db_tx_released_clients_total: {
    help: 'Total number of clients released in a transaction',
    type: 'counter'
  },
  dcl_deployed_entities_bloom_filter_checks_total: {
    help: 'Total number of deployments existence checks to the deployment list filter',
    type: 'counter',
    labelNames: ['hit'] // false_positive=(true|false)
  },
  dcl_content_server_build_info: {
    help: 'Content server static build info.',
    type: 'gauge',
    labelNames: ['version', 'commitHash', 'ethNetwork']
  },
  dcl_content_server_snapshot_entities: {
    help: 'Number of entities in the snapshots per type.',
    type: 'gauge',
    labelNames: ['type'] // type=EntityType
  },
  dcl_content_server_sync_state: {
    // SynchronizationState value
    help: 'Content server sync state.',
    type: 'gauge'
  },
  dcl_content_server_failed_deployments: {
    help: 'Failed deployments.',
    type: 'gauge'
  },
  dcl_content_server_snapshot_generation_time: {
    help: 'Histogram of time spent generating full snapshots',
    type: 'histogram',
    labelNames: ['result', 'interval_size', 'reason'] // result=('success'|'error')
  }
})
