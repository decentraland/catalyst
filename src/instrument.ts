import { ILoggerComponent } from '@well-known-components/interfaces'

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
