// We are writing all metrics here so that we know where to find them in the future

import { Counter, Histogram } from 'prom-client'

export const TOTAL_AMOUNT_OF_DEPLOYMENTS = new Counter({
  name: 'total_deployments_count',
  help: 'Total number of deployments made to the content server',
  labelNames: ['entity_type']
})

export const REPOSITORY_QUEUE_TOTAL_QUERIES = new Counter({
  name: 'db_queued_queries_count',
  help: 'Total number of queries that went through the queue since the service started',
  labelNames: ['priority']
})

export const REPOSITORY_QUEUE_REJECTED_QUERIES = new Counter({
  name: 'db_queued_queries_rejected_count',
  help: 'Total number of queries that were rejected due to high number of requests',
  labelNames: ['priority']
})

export const REPOSITORY_QUEUE_EXECUTED_QUERIES = new Histogram({
  name: 'db_queued_queries_executed',
  help: 'Time spent in seconds since the queries were added to the queue until they got resolved',
  labelNames: ['priority']
})

export const DCL_CONTENT_GARBAGE_COLLECTION_ITEMS_TOTAL = new Counter({
  name: 'dcl_content_garbage_collection_items_total',
  help: 'Total number of garbage collected items',
  labelNames: []
})

export const DCL_CONTENT_GARBAGE_COLLECTION_TIME = new Histogram({
  name: 'dcl_content_garbage_collection_time',
  help: 'Histogram of time spent in garbage collection',
  labelNames: []
})

export const DCL_CONTENT_DOWNLOAD_TIME = new Histogram({
  name: 'dcl_content_download_time',
  help: 'Histogram of time spent downloading files from other catalysts',
  labelNames: ['remote_catalyst']
})

export const DCL_CONTENT_DOWNLOADED_TOTAL = new Counter({
  name: 'dcl_content_downloaded_total',
  help: 'Total downloaded files',
  labelNames: ['overwritten']
})

export const DCL_CONTENT_IGNORED_DEPLOYMENTS_TOTAL = new Counter({
  name: 'dcl_content_ignored_deployments_total',
  help: 'Total ignored deployments because are already synced',
  labelNames: []
})

export const DCL_CONTENT_FAILED_DEPLOYMENTS_TOTAL = new Counter({
  name: 'dcl_content_failed_deployments_total',
  help: 'Total failed deployments',
  labelNames: []
})
