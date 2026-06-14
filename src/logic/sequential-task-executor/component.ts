import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { validateMetricsDeclaration } from '@dcl/metrics'
import PQueue from 'p-queue'
import { ISequentialTaskExecutorComponent } from './types'

type SequentialTaskComponents = {
  metrics: IMetricsComponent<keyof typeof sequentialJobMetrics>
  logs: ILoggerComponent
}

export function createSequentialTaskExecutor(
  components: SequentialTaskComponents,
  options?: { concurrency?: number }
): ISequentialTaskExecutorComponent {
  const { metrics, logs } = components
  const logger = logs.getLogger('SequentialTaskComponent')
  // Per-jobName queue concurrency. Defaults to 1 (strictly sequential) to preserve the original
  // behavior; raising it (via SEQUENTIAL_TASK_CONCURRENCY) lets the read endpoints that use this
  // executor — /deployments and /pointer-changes — run in parallel up to the DB pool size instead
  // of head-of-line blocking the whole cluster's polling on a single slow query.
  const concurrency = options?.concurrency && options.concurrency > 0 ? options.concurrency : 1
  const queues = new Map<string, PQueue>()

  function getQueue(jobName: string) {
    if (queues.has(jobName)) return queues.get(jobName)!
    const queue = new PQueue({ autoStart: true, concurrency, throwOnTimeout: false })
    queues.set(jobName, queue)
    return queue
  }

  function run<T>(jobName: string, fn: () => Promise<T>): Promise<T> {
    const queue = getQueue(jobName)

    metrics.increment('wkc_sequential_job_total', { job_name: jobName })
    const waitTimer = metrics.startTimer('wkc_sequential_job_wait_seconds', { job_name: jobName })

    return queue.add<T>(async () => {
      waitTimer.end()
      const timer = metrics.startTimer('wkc_sequential_job_duration_seconds', { job_name: jobName })
      try {
        const result = await fn()
        metrics.increment('wkc_sequential_job_run_total', { job_name: jobName, error: 'false' })
        return result
      } catch (err) {
        metrics.increment('wkc_sequential_job_run_total', { job_name: jobName, error: 'true' })
        logger.error('Error running task', { jobName, error: err.message || err.toString() })
        throw err
      } finally {
        timer.end()
      }
    })
  }

  return {
    run
  }
}

export const sequentialJobMetrics = validateMetricsDeclaration({
  wkc_sequential_job_run_total: {
    help: 'Total number of sequential jobs run',
    type: IMetricsComponent.CounterType,
    labelNames: ['job_name', 'error']
  },
  wkc_sequential_job_total: {
    help: 'Total number of sequential jobs',
    type: IMetricsComponent.CounterType,
    labelNames: ['job_name']
  },
  wkc_sequential_job_duration_seconds: {
    help: 'Histogram of run time per job_name',
    type: IMetricsComponent.HistogramType,
    labelNames: ['job_name']
  },
  wkc_sequential_job_wait_seconds: {
    help: 'Histogram of waiting time per job_name',
    type: IMetricsComponent.HistogramType,
    labelNames: ['job_name']
  }
})
