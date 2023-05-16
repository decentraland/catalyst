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

  describe('transaction', () => {
    it('should create a new client for inner queries', async () => {
      const pool = new Pool()
      const poolClient = {
        query: jest.fn(),
        release: jest.fn()
      }
      jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      await database.transaction(async () => {})
      expect(pool.connect).toBeCalled()
    })

    it('should query BEGIN when it starts', async () => {
      const pool = new Pool()
      const poolClient = {
        query: jest.fn(),
        release: jest.fn()
      }
      jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      await database.transaction(async () => {})
      expect(pool.connect).toBeCalled()
      expect(poolClient.query).toBeCalledWith('BEGIN')
    })

    it('should run all inner queries with the provided client', async () => {
      const pool = new Pool()
      const poolClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn()
      }
      jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      const aQuery = SQL`a query`
      const otherQuery = SQL`a query`
      await database.transaction(async (databaseClient) => {
        databaseClient.queryWithValues(aQuery)
        databaseClient.queryWithValues(otherQuery)
      })
      expect(poolClient.query).toBeCalledWith(aQuery)
      expect(poolClient.query).toBeCalledWith(otherQuery)
    })

    it('should use the provided client when running within another transaction', async () => {
      const pool = new Pool()
      const poolClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn()
      }
      jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      const aQuery = SQL`a query`
      const otherQuery = SQL`a query`
      await database.transaction(async (databaseClient) => {
        databaseClient.queryWithValues(aQuery)
        databaseClient.queryWithValues(otherQuery)
      })
      expect(poolClient.query).toBeCalledWith(aQuery)
      expect(poolClient.query).toBeCalledWith(otherQuery)
    })

    it('should query COMMIT when callback finishes successfully', async () => {
      const pool = new Pool()
      const poolClient = {
        query: jest.fn(),
        release: jest.fn()
      }
      jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      await database.transaction(async () => {})
      expect(pool.connect).toBeCalled()
      expect(poolClient.query).toBeCalledWith('COMMIT')
    })

    it('should query ROLLBACK when callback throws error', async () => {
      const pool = new Pool()
      const poolClient = {
        query: jest.fn(),
        release: jest.fn()
      }
      jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      await expect(
        database.transaction(async () => {
          throw new Error('error during transaction')
        })
      ).rejects.toThrowError('error during transaction')
      expect(poolClient.query).toBeCalledWith('ROLLBACK')
    })

    it('should release client if the callback is successfull', async () => {
      const pool = new Pool()
      const poolClient = {
        query: jest.fn(),
        release: jest.fn()
      }
      jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      await database.transaction(async () => {})
      expect(poolClient.release).toBeCalledTimes(1)
    })

    it('should release client if the callback failed', async () => {
      const pool = new Pool()
      const poolClient = {
        query: jest.fn(),
        release: jest.fn()
      }
      jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      await expect(
        database.transaction(async () => {
          throw new Error('error during transaction')
        })
      ).rejects.toThrowError('error during transaction')
      expect(poolClient.release).toBeCalledTimes(1)
    })

    it('should use the pool to make queries when not using the provided database client', async () => {
      // You probable DO NOT want to do this
      const pool = new Pool()
      jest.spyOn(pool, 'query').mockImplementation(() => ({ rows: [], rowCount: 0 }))
      const poolClient = {
        query: jest.fn(),
        release: jest.fn()
      }
      jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
      const database = await createDatabase({ logs, env, metrics }, pool, {})
      const aQuery = SQL`a-query`
      await database.transaction(async () => {
        await database.queryWithValues(aQuery)
      })
      expect(pool.query).toBeCalledWith(aQuery)
      expect(poolClient.query).not.toBeCalledWith(aQuery)
    })
  })
})

it('should use the pool to make external queries even if there is a transaction open', async () => {
  const logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
  const pool = new Pool()
  jest.spyOn(pool, 'query').mockImplementation(() => ({ rows: [], rowCount: 0 }))
  const poolClient = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn()
  }
  jest.spyOn(pool, 'connect').mockImplementation(() => poolClient)
  const database = await createDatabase({ logs, env, metrics }, pool, {})
  const txQuery = SQL`tx-query`
  const txPromise = database.transaction(async (dbClient) => {
    dbClient.queryWithValues(txQuery)
  })
  const aQuery = SQL`a-query`
  const queryPromise = database.queryWithValues(aQuery)
  await Promise.all([txPromise, queryPromise])
  expect(pool.query).toBeCalledWith(aQuery)
  expect(poolClient.query).not.toBeCalledWith(aQuery)
  expect(poolClient.query).toBeCalledWith(txQuery)
})
