import { metricsDefinitions as snapshotFetcherMetricsDefinitions } from '@dcl/snapshots-fetcher'
import { metricsDefinitions as blockIndexerMetricsDefinitions } from '@dcl/block-indexer'
import { metricDeclarations as loggerMetricDeclarations } from '@well-known-components/logger'
import { validateMetricsDeclaration } from '@dcl/metrics'
import { getDefaultHttpMetrics } from '@dcl/http-server'
import { metricDeclarations as theGraphMetricDeclarations } from '@dcl/thegraph-component'
import { metricDeclarations as rateLimiterMetricDeclarations } from '@dcl/rate-limiter-component'
import { sequentialJobMetrics } from './logic/sequential-task-executor'

export const metricsDeclaration = validateMetricsDeclaration({
  ...getDefaultHttpMetrics(),
  ...blockIndexerMetricsDefinitions,
  ...snapshotFetcherMetricsDefinitions,
  ...sequentialJobMetrics,
  ...theGraphMetricDeclarations,
  ...loggerMetricDeclarations,
  // The rate limiter reports every decision here instead of logging it: a throttled client retries,
  // so a line per rejection is write amplification driven by the abuse being blocked.
  ...rateLimiterMetricDeclarations,
  total_deployments_count: {
    help: 'Total number of deployments made to the content server',
    type: 'counter',
    labelNames: ['entity_type', 'deployment_context']
  },

  dcl_block_fetch_retries_total: {
    help: 'Total retried block RPC reads during on-chain validation (per network)',
    type: 'counter',
    labelNames: ['network']
  },

  dcl_content_garbage_collection_items_total: {
    help: 'Total number of garbage collected items',
    type: 'counter',
    labelNames: []
  },

  dcl_content_lock_writer_timeouts_total: {
    help: 'Garbage collection or cleanup runs deferred because deployments kept the content lock busy',
    type: 'counter',
    labelNames: []
  },

  dcl_content_garbage_collection_time: {
    help: 'Histogram of time spent in garbage collection',
    type: 'histogram',
    labelNames: []
  },

  dcl_content_garbage_collection_runs_total: {
    help: 'Garbage collection sweeps',
    type: 'counter',
    // outcome=(success|deferred|error); deferred means the content lock stayed busy
    labelNames: ['outcome']
  },

  dcl_content_garbage_collection_last_success_timestamp_seconds: {
    help: 'Unix time of the last garbage collection sweep that completed',
    type: 'gauge',
    labelNames: []
  },

  dcl_content_rate_limited_deployments_total: {
    help: 'Total failed deployments due rate limit',
    type: 'counter',
    labelNames: ['entity_type', 'reason']
  },

  dcl_content_rate_limiter_cache_keys: {
    help: 'Current number of keys in rate limiter caches',
    type: 'gauge',
    labelNames: ['entity_type', 'cache_type']
  },

  dcl_content_rate_limiter_cache_max_size: {
    help: 'Configured max size for deployment rate limiter cache',
    type: 'gauge',
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
  dcl_partial_deployments_staging_total: {
    help: 'Partial (multi-request) deployment staging requests through HTTP',
    type: 'counter',
    // kind=(accepted|finalized|validation_error|throttled|busy|error)
    labelNames: ['kind']
  },
  dcl_partial_upload_throttled_total: {
    help: 'Partial upload batches answered 429, by the quota or limit that rejected them',
    type: 'counter',
    // reason=(uploads_per_account|bytes_per_account|bytes_per_server|bytes_per_minute|entity_rate_limit|pointer_conflict)
    labelNames: ['reason']
  },
  dcl_partial_uploads_started_total: {
    help: 'Partial uploads whose first batch was admitted',
    type: 'counter',
    labelNames: []
  },
  dcl_partial_uploads_completed_total: {
    help: 'Partial uploads published by their final batch',
    type: 'counter',
    labelNames: []
  },
  dcl_partial_uploads_pending: {
    help: 'Partial uploads in the database at the last cleanup run (server-wide)',
    type: 'gauge',
    // state=(live|expired)
    labelNames: ['state']
  },
  dcl_partial_upload_duration_seconds: {
    help: 'Time from a partial upload first batch arrival to its publication',
    type: 'histogram',
    labelNames: [],
    buckets: [5, 15, 30, 60, 120, 300, 600, 900, 1800, 2700, 3600]
  },
  dcl_partial_upload_batches_per_upload: {
    help: 'Stored batches a partial upload took until publication',
    type: 'histogram',
    labelNames: [],
    buckets: [1, 2, 3, 5, 10, 20, 50, 100, 250]
  },
  dcl_partial_upload_capacity_bytes: {
    help: 'Server-wide staging byte cap for partial uploads (MAX_PENDING_BYTES)',
    type: 'gauge',
    labelNames: []
  },
  dcl_pending_deployments_expired_total: {
    help: 'Expired pending deployments reclaimed by the cleanup job',
    type: 'counter',
    labelNames: []
  },
  dcl_partial_upload_cleanup_runs_total: {
    help: 'Expired partial upload cleanup runs',
    type: 'counter',
    // outcome=(success|deferred|error); deferred means the content lock stayed busy
    labelNames: ['outcome']
  },
  dcl_partial_upload_cleanup_duration_seconds: {
    help: 'Duration of expired partial upload cleanup runs',
    type: 'histogram',
    labelNames: [],
    buckets: [0.1, 0.5, 1, 5, 15, 30, 60, 120, 300]
  },
  dcl_partial_upload_cleanup_last_success_timestamp_seconds: {
    help: 'Unix time of the last cleanup run that reclaimed every expired upload it listed',
    type: 'gauge',
    labelNames: []
  },
  dcl_upload_budget_capacity_bytes: {
    help: 'Capacity of the POST /entities in-flight upload budget',
    type: 'gauge',
    labelNames: []
  },
  dcl_multipart_upload_timeouts_total: {
    help: 'POST /entities bodies that did not arrive within MULTIPART_UPLOAD_TIMEOUT_MS (408)',
    type: 'counter',
    labelNames: []
  },
  dcl_upload_budget_reserved_bytes: {
    help: 'POST /entities body bytes reserved in the in-flight upload budget',
    type: 'gauge',
    labelNames: []
  },
  dcl_upload_budget_active: {
    help: 'POST /entities bodies being buffered',
    type: 'gauge',
    labelNames: []
  },
  dcl_upload_budget_rejections_total: {
    help: 'POST /entities uploads shed because the in-flight upload budget, or its source share, was full',
    type: 'counter',
    // reason=(bytes|source_bytes|source_concurrency)
    labelNames: ['reason']
  },
  dcl_partial_upload_metadata_checks_total: {
    help: 'Content metadata checks performed by partial uploads',
    type: 'counter',
    labelNames: []
  },
  dcl_partial_upload_batches_total: {
    help: 'Accepted partial upload batches',
    type: 'counter',
    // outcome=(incomplete|finalizing)
    labelNames: ['outcome']
  },
  dcl_partial_upload_reserved_bytes: {
    help: 'Staging bytes reserved, including expired uploads awaiting cleanup',
    type: 'gauge',
    labelNames: []
  },
  dcl_partial_upload_cleanup_backlog_bytes: {
    help: 'Expired staging bytes awaiting successful cleanup',
    type: 'gauge',
    labelNames: []
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
