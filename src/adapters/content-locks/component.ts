import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { Pool, PoolClient } from 'pg'
import SQL from 'sql-template-strings'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { IContentLocks } from './types'

const CONTENT_LOCK_KEY = 'catalyst-content-gc'

/**
 * Creates the storage/GC gate on a dedicated connection pool, shared by every process using this
 * database. Deployments share it; garbage collection takes it exclusively. Lock waits are not bounded
 * by a query timeout, so an exclusive request waits for in-flight deployments to settle.
 * @param components Environment and logging.
 * @returns Lifecycle-managed content locks.
 */
export function createContentLocks(components: Pick<AppComponents, 'env' | 'logs'>): IContentLocks {
  const { env, logs } = components
  const logger = logs.getLogger('content-locks')
  const pool = new Pool({
    port: env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
    host: env.getConfig<string>(EnvironmentConfig.PSQL_HOST),
    database: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
    user: env.getConfig<string>(EnvironmentConfig.PSQL_USER),
    password: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD),
    idleTimeoutMillis: env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT),
    max: env.getConfig<number>(EnvironmentConfig.CONTENT_LOCK_CONNECTIONS),
    connectionTimeoutMillis: 10_000
  })
  pool.on('error', (error) => logger.error(error))

  async function run<T>(exclusive: boolean, operation: () => Promise<T>, entityId?: string): Promise<T> {
    const client: PoolClient = await pool.connect()
    let failed = false
    try {
      await client.query(
        exclusive
          ? SQL`SELECT pg_advisory_lock(hashtextextended(${CONTENT_LOCK_KEY}, 0))`
          : SQL`SELECT pg_advisory_lock_shared(hashtextextended(${CONTENT_LOCK_KEY}, 0))`
      )
      if (entityId) {
        await client.query(SQL`SELECT pg_advisory_lock(hashtextextended(${'partial-entity:' + entityId}, 0))`)
      }
      return await operation()
    } finally {
      // Unlock explicitly so a healthy connection can be reused; a broken one is destroyed, which
      // releases its session locks.
      try {
        await client.query('SELECT pg_advisory_unlock_all()')
      } catch {
        failed = true
      }
      client.release(failed)
    }
  }

  return {
    async [START_COMPONENT]() {
      const client = await pool.connect()
      client.release()
    },
    async [STOP_COMPONENT]() {
      await pool.end()
    },
    withRead: (operation, entityId) => run(false, operation, entityId),
    withWrite: (operation) => run(true, operation)
  }
}
