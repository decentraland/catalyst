import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { IBaseComponent, IDatabase } from '@well-known-components/interfaces'
import { Pool, PoolConfig } from 'pg'
import QueryStream from 'pg-query-stream'
import { SQLStatement } from 'sql-template-strings'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export interface IDatabaseComponent extends IDatabase {
  queryWithValues<T>(sql: SQLStatement): Promise<IDatabase.IQueryResult<T>>
  streamQuery<T = any>(sql: SQLStatement, config?: { batchSize?: number }): AsyncGenerator<T>

  start(): Promise<void>
  stop(): Promise<void>
}

export function createTestDatabaseComponent(): IDatabaseComponent {
  return {
    async query() {
      throw new Error('Not implemented')
    },
    async queryWithValues() {
      throw new Error('Not implemented')
    },
    async *streamQuery() {
      throw new Error('Not implemented')
    },
    async start() {},
    async stop() {}
  }
}

export async function createDatabaseComponent(
  components: Pick<AppComponents, 'logs' | 'env'>,
  options?: PoolConfig
): Promise<IDatabaseComponent & IBaseComponent> {
  const { logs } = components
  const logger = logs.getLogger('database-component')

  const defaultOptions = {
    port: components.env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
    host: components.env.getConfig<string>(EnvironmentConfig.PSQL_HOST),
    database: components.env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
    user: components.env.getConfig<string>(EnvironmentConfig.PSQL_USER),
    password: components.env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD),
    idleTimeoutMillis: components.env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT),
    query_timeout: components.env.getConfig<number>(EnvironmentConfig.PG_QUERY_TIMEOUT)
  }

  const finalOptions = { ...defaultOptions, ...options }

  // Config
  const pool: Pool = new Pool(finalOptions)

  // Methods
  async function start() {
    try {
      const db = await pool.connect()
      db.release()
    } catch (error) {
      logger.error('An error occurred trying to open the database. Did you run the migrations?')
      throw error
    }
  }

  async function query<T>(sql: string) {
    const rows = await pool.query<T[]>(sql)
    return {
      rows: rows.rows as any[],
      rowCount: rows.rowCount
    }
  }

  async function queryWithValues<T>(sql: SQLStatement) {
    const rows = await pool.query<T[]>(sql)
    return {
      rows: rows.rows as any[],
      rowCount: rows.rowCount
    }
  }

  async function* streamQuery<T>(sql: SQLStatement, config?: { batchSize?: number }): AsyncGenerator<T> {
    const client = await pool.connect()
    try {
      const stream: any = new QueryStream(sql.text, sql.values, config)

      stream.callback = function () {
        // noop
      }

      try {
        const queryPromise = client.query(stream)

        for await (const row of stream) {
          yield row
        }

        stream.destroy()

        await queryPromise
        // finish - OK, this call is necessary to finish the query when we configure query_timeout due to a bug in pg
        stream.callback(undefined, undefined)
      } catch (err) {
        // finish - with error, this call is necessary to finish the query when we configure query_timeout due to a bug in pg
        stream.callback(err, undefined)
        throw err
      }
    } finally {
      client.release()
    }
  }

  let didStop = false

  async function stop() {
    if (didStop) {
      logger.error('Stop called twice')
      return
    }
    didStop = true

    let gracePeriods = 10

    while (gracePeriods-- > 0 && pool.waitingCount) {
      logger.debug('Draining connections', {
        waitingCount: pool.waitingCount,
        gracePeriods
      })
      await sleep(200)
    }

    const promise = pool.end()
    let finished = false

    promise.then(() => (finished = true)).catch(() => (finished = true))

    while (!finished && pool.totalCount | pool.idleCount | pool.waitingCount) {
      if (pool.totalCount) {
        logger.log('Draining connections', {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        })
        await sleep(1000)
      }
    }

    await promise
  }

  return {
    query,
    queryWithValues,
    streamQuery,
    start,
    stop
  }
}
