import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { IBaseComponent, IDatabase } from '@well-known-components/interfaces'
import { Client, ClientConfig, Pool, PoolClient, PoolConfig } from 'pg'
import QueryStream from 'pg-query-stream'
import { SQLStatement } from 'sql-template-strings'
import { EnvironmentConfig } from '../Environment.js'
import { AppComponents } from '../types.js'

export type DatabaseClient = Omit<IDatabaseComponent, 'transaction'>

export type DatabaseTransactionalClient = DatabaseClient & {
  insideTx: true
}

export interface IDatabaseComponent extends IDatabase, IBaseComponent {
  queryWithValues<T>(sql: SQLStatement, durationQueryNameLabel?: string): Promise<IDatabase.IQueryResult<T>>
  streamQuery<T = any>(
    sql: SQLStatement,
    config?: { batchSize?: number },
    durationQueryNameLabel?: string
  ): AsyncGenerator<T>
  transaction(
    functionToRunWithinTransaction: (client: DatabaseTransactionalClient) => Promise<void>,
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

  const streamQueriesConfig: ClientConfig = { ...poolConfig, query_timeout: streamQueryTimeout }

  const pool: Pool = new Pool(poolConfig)

  return createDatabase(components, pool, streamQueriesConfig)
}

export async function createDatabase(
  components: Pick<AppComponents, 'logs' | 'env' | 'metrics'>,
  pool: Pool,
  streamQueriesConfig: ClientConfig
): Promise<IDatabaseComponent> {
  const { logs } = components
  const logger = logs.getLogger('database-component')

  const startTimer = (durationQueryNameLabel: string | undefined) =>
    (durationQueryNameLabel
      ? components.metrics.startTimer('dcl_db_query_duration_seconds', { query: durationQueryNameLabel })
      : { end: () => {} }
    ).end

  async function createDatabaseClient(initializedClient?: PoolClient): Promise<IDatabaseComponent> {
    /**
     * If 'initializedClient' is defined, it means it was created by a transaction, so we must run all the queries within
     * the transaction using the same client or it would lead to problems. If it is undefined, we use the pool to run
     * normal queries.
     * */
    const queryClient = initializedClient ? initializedClient : pool

    return {
      async query<T>(sql: string): Promise<IDatabase.IQueryResult<T>> {
        const rows = await queryClient.query<T[]>(sql)
        return {
          rows: rows.rows as any[],
          rowCount: rows.rowCount
        }
      },
      async queryWithValues<T>(sql: SQLStatement, durationQueryNameLabel?: string): Promise<IDatabase.IQueryResult<T>> {
        const endTimer = startTimer(durationQueryNameLabel)
        try {
          const rows = await queryClient.query<T[]>(sql)
          endTimer({ status: 'success' })
          return {
            rows: rows.rows as any[],
            rowCount: rows.rowCount
          }
        } catch (error) {
          endTimer({ status: 'error' })
          logger.error(error)
          throw error
        }
      },

      async *streamQuery<T>(
        sql: SQLStatement,
        config?: { batchSize?: number },
        durationQueryNameLabel?: string
      ): AsyncGenerator<T> {
        // Create a streamPool and reuse it ?
        const endTimer = startTimer(durationQueryNameLabel)
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
            endTimer({ status: 'success' })
          } catch (error) {
            // finish - with error, this call is necessary to finish the query when we configure query_timeout due to a bug in pg
            stream.callback(error, undefined)
            endTimer({ status: 'error' })
            logger.error('Error running stream query:')
            logger.error(error)
            throw error
          }
        } finally {
          await client.end()
        }
      },

      async transaction(
        functionToRunWithinTransaction: (databaseClient: DatabaseTransactionalClient) => Promise<void>,
        durationQueryNameLabel?: string
      ): Promise<void> {
        /**
         * It starts a transaction and creates a database client. Then it runs the lambda function parameter
         * using that client. If it success, commits the transaction. If not, it rollbacks the transaction.
         * @functionToRunWithinTransaction The code that will run within the transaction.
         * @durationQueryNameLabel If present, it will be used to instrument the transaction duration.
         * IMPORTANT: PostgreSQL isolates a transaction to individual client. You MUST use the database client provided
         * in the lambda function. It will make sure that the queries are made using the same client.
         */
        if (initializedClient) {
          const endInnerTimer = startTimer(durationQueryNameLabel)
          try {
            const txDb = await createDatabaseClient(initializedClient)
            const res = await functionToRunWithinTransaction({ insideTx: true, ...txDb })
            endInnerTimer({ status: 'success' })
            return res
          } catch (error) {
            endInnerTimer({ status: 'error' })
            throw error
          }
        }
        const endTimer = startTimer(durationQueryNameLabel)
        /**
         * Note: we don't try/catch this because if connecting throws an exception, the client will be undefined.
         * No need to dispose the client.
         */
        const client: PoolClient = await pool.connect()
        components.metrics.increment('dcl_db_tx_acquired_clients_total')
        try {
          await client.query('BEGIN')
          const databaseWithNewClient = await createDatabaseClient(client)
          await functionToRunWithinTransaction({ insideTx: true, ...databaseWithNewClient })
          await client.query('COMMIT')
          endTimer({ status: 'success' })
        } catch (error) {
          await client.query('ROLLBACK')
          endTimer({ status: 'error' })
          logger.error(`Error running ${durationQueryNameLabel ?? ''} transaction:`)
          logger.error(error)
          throw error
        } finally {
          client.release()
          components.metrics.increment('dcl_db_tx_released_clients_total')
        }
      }
    }
  }

  const database = await createDatabaseClient()

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
