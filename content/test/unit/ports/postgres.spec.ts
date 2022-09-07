import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { Pool } from 'pg'
import SQL from 'sql-template-strings'
import { Environment } from '../../../src/Environment'
import { metricsDeclaration } from '../../../src/metrics'
import { createDatabase } from '../../../src/ports/postgres'

const metrics = createTestMetricsComponent(metricsDeclaration)
const env = new Environment()

describe('start', () => {
  let logs: ILoggerComponent

  beforeAll(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
  })
  it('should release client when connection is succesful', async () => {
    const p = new Pool()
    const clientMock = {
      release: jest.fn()
    }
    jest.spyOn(p, 'connect').mockImplementation(() => clientMock)
    const database = await createDatabase({ logs, env, metrics }, p, {})
    expect(database.start).toBeDefined()
    if (database.start) await database.start()
    expect(clientMock.release).toBeCalledTimes(1)
  })
})

describe('stop', () => {
  let logs: ILoggerComponent

  beforeAll(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
  })
  it('should release client when connection is succesful', async () => {
    const p = new Pool()
    const clientMock = {
      release: jest.fn()
    }
    jest.spyOn(p, 'connect').mockImplementation(() => clientMock)
    const database = await createDatabase({ logs, env, metrics }, p, {})
    expect(database.start).toBeDefined()
    if (database.start) await database.start()
    expect(clientMock.release).toBeCalledTimes(1)
  })
})

describe('DatabaseClient', () => {
  let logs: ILoggerComponent

  beforeAll(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
  })
  describe('when running outside a transaction', () => {
    it('(query) should use pool to run', async () => {
      const pool = new Pool()
      jest.spyOn(pool, 'query').mockImplementation(() => ({ rows: [], rowCount: 0 }))
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      const aQuery = 'a query'
      await database.query(aQuery)
      expect(pool.query).toBeCalledWith(aQuery)
    })

    it('(queryWithValues) should use pool', async () => {
      const pool = new Pool()
      jest.spyOn(pool, 'query').mockImplementation(() => ({ rows: [], rowCount: 0 }))
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      const aSQLQuery = SQL`aQuery`
      await database.queryWithValues(aSQLQuery)
      expect(pool.query).toBeCalledWith(aSQLQuery)
    })
  })
})
