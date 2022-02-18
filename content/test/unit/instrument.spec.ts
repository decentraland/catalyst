import { createTestMetricsComponent } from '@well-known-components/metrics'
import SQL, { SQLStatement } from 'sql-template-strings'
import { runReportingQueryDurationMetric } from '../../src/instrument'
import { metricsDeclaration } from '../../src/metrics'
import { AppComponents } from "../../src/types"

describe('instrument', () => {
  describe('withQueryDurationTimeMetric', () => {
    let components: Pick<AppComponents, 'database' | 'metrics'>
    const query: SQLStatement = SQL`SELECT deployments.id FROM deployments`
    const prometheusDBQueryName = 'dcl_db_query_duration_seconds'
    const expectedQueryLabelValue = 'get_historical_deployments'
    let startTimerSpy: jest.SpyInstance
    let endTimerMock: jest.Mock

    beforeAll(() => {
      components = {
        database: { queryWithValues: () => {} } as any,
        metrics: createTestMetricsComponent(metricsDeclaration)
      }
    })

    beforeEach(() => {
      endTimerMock = jest.fn()
      startTimerSpy = jest.spyOn(components.metrics, 'startTimer').mockReturnValue({ end: endTimerMock } )
    })
    describe('when the query is successful', () => {
      it('should return the query values and set the status label to sucess', async () => {
        const expectedQueryResult = { rows: [1,2,3], rowCount: 3 }
        jest.spyOn(components.database, 'queryWithValues').mockResolvedValue(expectedQueryResult)

        const queryResult = await runReportingQueryDurationMetric(
          components,
          'get_historical_deployments',
          () => components.database.queryWithValues(query)
        )

        expect(startTimerSpy).toBeCalledWith(prometheusDBQueryName, { query: expectedQueryLabelValue })
        expect(endTimerMock).toBeCalledWith({ status: 'success'})
        expect(queryResult).toEqual(expectedQueryResult)
      })
    })
    describe('when the query fails', () => {
      it('should re-thrown exception and set the status label to error', async () => {
        jest.spyOn(components.database, 'queryWithValues').mockRejectedValue(new Error('error with postgres'))

        await expect(runReportingQueryDurationMetric(
          components,
          'get_historical_deployments',
          () => components.database.queryWithValues(query)
        )).rejects.toThrow('error with postgres')

        expect(startTimerSpy).toBeCalledWith(prometheusDBQueryName, { query: expectedQueryLabelValue })
        expect(endTimerMock).toBeCalledWith({ status: 'error'})
      })
    })
})
})
