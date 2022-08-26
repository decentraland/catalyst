import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { IBaseComponent, IDatabase } from '@well-known-components/interfaces'
import { Client, ClientConfig, Pool, PoolClient, PoolConfig } from 'pg'
import QueryStream from 'pg-query-stream'
import { SQLStatement } from 'sql-template-strings'
import { EnvironmentConfig } from '../Environment'
import { generateReportingQueryDurationMetric, runReportingQueryDurationMetric } from '../instrument'
import { AppComponents } from '../types'

export interface IDatabaseComponent extends IDatabase, IBaseComponent {
  queryWithValues<T>(sql: SQLStatement, durationQueryNameLabel?: string): Promise<IDatabase.IQueryResult<T>>
  streamQuery<T = any>(
    sql: SQLStatement,
    config?: { batchSize?: number },
    durationQueryNameLabel?: string
  ): AsyncGenerator<T>
  transaction(
    functionToRunWithinTransaction: (client: IDatabaseComponent) => Promise<void>,
    durationQueryNameLabel?: string
  ): Promise<void>
  start?(): Promise<void>
}

export function createTestDatabaseComponent(): IDatabaseComponent {
  return {
    async query() {
      throw new Error('query Not implemented')
    },
    async queryWithValues() {
      throw new Error('queryWithValues Not implemented')
    },
    async *streamQuery() {
      throw new Error('streamQuery Not implemented')
    },
    async transaction() {
      throw new Error('transactionQuery Not implemented')
    },
    async start() {},
    async stop() {}
  }
}

export async function createDatabaseComponent(
  components: Pick<AppComponents, 'logs' | 'env' | 'metrics'>,
  options?: PoolConfig
): Promise<IDatabaseComponent> {
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
  const streamQueryTimeout = components.env.getConfig<number>(EnvironmentConfig.PG_STREAM_QUERY_TIMEOUT)

  const poolConfig = { ...defaultOptions, ...options }

  const streamQueriesConfig: ClientConfig = {
    ...poolConfig,
    query_timeout: streamQueryTimeout
  }

  const pool: Pool = new Pool(poolConfig)

  async function createDatabase(poolClient?: PoolClient): Promise<IDatabaseComponent> {
    /**
     * If 'poolClient' is defined, it means it was created by a transaction, so we must run all the queries within
     * the transaction using the same client or it would lead to problems. If it is undefined, we use the pool to run
     * queries.
     * */
    const client = poolClient ? poolClient : pool

    async function* streamQueryInternal<T>(sql: SQLStatement, config?: { batchSize?: number }): AsyncGenerator<T> {
      // Create a streamPool and reuse it ?
      const client = new Client(streamQueriesConfig)
      await client.connect()

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
        await client.end()
      }
    }

    return {
      async query<T>(sql: string): Promise<IDatabase.IQueryResult<T>> {
        const rows = await client.query<T[]>(sql)
        return {
          rows: rows.rows as any[],
          rowCount: rows.rowCount
        }
      },
      async queryWithValues<T>(sql: SQLStatement, durationQueryNameLabel?: string): Promise<IDatabase.IQueryResult<T>> {
        const rows = durationQueryNameLabel
          ? await runReportingQueryDurationMetric(components, durationQueryNameLabel, () => pool.query(sql))
          : await client.query<T[]>(sql)

        return {
          rows: rows.rows as any[],
          rowCount: rows.rowCount
        }
      },

      async *streamQuery<T>(
        sql: SQLStatement,
        config?: { batchSize?: number },
        durationQueryNameLabel?: string
      ): AsyncGenerator<T> {
        yield* durationQueryNameLabel
          ? generateReportingQueryDurationMetric(components, durationQueryNameLabel, streamQueryInternal(sql, config))
          : streamQueryInternal(sql, config)
      },

      async transaction(
        functionToRunWithinTransaction: (database: IDatabaseComponent) => Promise<void>,
        durationQueryNameLabel?: string
      ): Promise<void> {
        // We must use the same client and not the pool client. Check documentation
        // note: we don't try/catch this because if connecting throws an exception
        // we don't need to dispose of the client (it will be undefined)
        const client = poolClient ? poolClient : await pool.connect()
        try {
          await client.query('BEGIN')
          const database = await createDatabase(client)
          await functionToRunWithinTransaction(database)
          await client.query('COMMIT')
        } catch (e) {
          await client.query('ROLLBACK')
          // log?
          throw e
        } finally {
          // If it's a transaction with a transaction, it mustn't release the client, only the outer transaction.
          if (!poolClient) {
            client.release()
          }
        }
      }
    }
  }

  const database = await createDatabase()

  let didStop = false

  return {
    ...database,
    async start() {
      try {
        const db = await pool.connect()
        db.release()
      } catch (error) {
        logger.error('An error occurred trying to open the database. Did you run the migrations?')
        throw error
      }
    },
    async stop() {
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
  }
}
