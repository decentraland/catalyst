import { ILoggerComponent } from '@well-known-components/interfaces'
import { AppComponents } from './types'

export async function runReportingQueryDurationMetric<T>(
  components: Pick<AppComponents, 'metrics'>,
  queryNameLabel: string,
  functionToRun: () => Promise<T>
): Promise<T> {
  const { end: endTimer } = components.metrics.startTimer('dcl_db_query_duration_seconds', {
    query: queryNameLabel
  })
  try {
    const res = await functionToRun()
    endTimer({ status: 'success' })
    return res
  } catch (err) {
    endTimer({ status: 'error' })
    throw err
  }
}

export async function runLoggingPerformance<T>(
  logger: ILoggerComponent.ILogger,
  taskName: string,
  functionToRun: () => Promise<T>
): Promise<T> {
  logger.debug(`Starting '${taskName}'. Process memory: ${JSON.stringify(process.memoryUsage())}`)
  const startTimeMs = performance.now()
  try {
    const res = await functionToRun()
    return res
  } catch (err) {
    throw err
  } finally {
    const endTimeMs = performance.now()
    const elapsedTimeMs = endTimeMs - startTimeMs
    const elapsedTimeStr =
      (Math.floor(elapsedTimeMs / (1000 * 60)) % 60) + ':' + ((elapsedTimeMs / 1000) % 60).toFixed(3)
    logger.debug(
      `Finished '${taskName}' in ${elapsedTimeStr} (m:s.mmm). Process memory: ${JSON.stringify(process.memoryUsage())}`
    )
  }
}
