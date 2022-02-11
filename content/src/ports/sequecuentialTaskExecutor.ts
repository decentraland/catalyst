// TODO: move this port to WKC repository

import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { validateMetricsDeclaration } from '@well-known-components/metrics'
import PQueue from 'p-queue'

export type ISequentialTaskExecutorComponent = {
  /**
   * Runs sequential jobs with a max concurrency of 1 per jobName.
   */
  run<T>(jobName: string, fn: () => Promise<T>): Promise<T>
}

type SequentialTaskComponents = {
  metrics: IMetricsComponent<keyof typeof sequentialJobMetrics>
  logs: ILoggerComponent
}

export function createSequentialTaskExecutor(components: SequentialTaskComponents): ISequentialTaskExecutorComponent {
  const { metrics, logs } = components
  const logger = logs.getLogger('SequentialTaskComponent')
  const queues = new Map<string, PQueue>()

  function getQueue(jobName: string) {
    if (queues.has(jobName)) return queues.get(jobName)!
    const queue = new PQueue({ autoStart: true, concurrency: 1, throwOnTimeout: false })
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
