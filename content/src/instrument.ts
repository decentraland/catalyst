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
