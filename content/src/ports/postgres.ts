import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { IBaseComponent, IDatabase, ILoggerComponent } from '@well-known-components/interfaces'
import { Pool, PoolConfig } from 'pg'
import QueryStream from 'pg-query-stream'
import { SQLStatement } from 'sql-template-strings'

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
  components: {
    logs: ILoggerComponent
  },
  options: PoolConfig
): Promise<IDatabaseComponent & IBaseComponent> {
  const { logs } = components
  const logger = logs.getLogger('database-component')

  // Config
  let db: Pool

  // Methods
  async function start() {
    logger.log('Starting database')
    try {
      db = new Pool(options)
      await db.connect()
    } catch (error) {
      logger.error('An error occurred trying to open the database. Did you run the migrations?')
      throw error
    }
  }

  async function query<T>(sql: string) {
    const rows = await db.query<T[]>(sql)
    return {
      rows: rows.rows as any[],
      rowCount: rows.rowCount
    }
  }

  async function queryWithValues<T>(sql: SQLStatement) {
    const rows = await db.query<T[]>(sql)
    return {
      rows: rows.rows as any[],
      rowCount: rows.rowCount
    }
  }

  async function* streamQuery<T>(sql: SQLStatement, config?: { batchSize?: number }): AsyncGenerator<T> {
    const stream: any = new QueryStream(sql.text, sql.values, config)

    let wasCalled = false

    const queryPromise = db.query(stream, newCallback)
    const originalCallback = stream.callback

    // this is a hack to prevent query timeout in stream
    function newCallback(...args) {
      if (args[0]) {
        console.error(args)
      }
      wasCalled = true
      if (originalCallback) {
        return originalCallback.apply(null, ...args)
      }
    }

    hack: {
      // this is a hack to prevent query timeout in stream
      if (!originalCallback) {
        stream.callback = newCallback
      }
    }

    for await (const row of stream) {
      yield row
    }

    stream.destroy()

    // this is a hack to prevent query timeout in stream
    if (stream.callback !== originalCallback && !wasCalled) {
      stream.callback()
    }

    await queryPromise
  }

  async function stop() {
    logger.log('Stopping database')
    const promise = db.end()
    let finished = false

    promise.then(() => (finished = true)).catch(() => (finished = true))

    while (!finished) {
      logger.log('Waiting to end', {
        totalCount: db.totalCount,
        idleCount: db.idleCount,
        waitingCount: db.waitingCount
      })
      await sleep(1000)
    }

    logger.log('Stopping database OK')
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
