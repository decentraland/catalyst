import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { Pool, PoolClient } from 'pg'
import SQL from 'sql-template-strings'
import { setTimeout as sleep } from 'timers/promises'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { EntityLockTimeoutError } from './errors'
import { IContentLocks } from './types'

const CONTENT_LOCK_KEY = 'catalyst-content-gc'
// Backoff while another request holds the entity lock, up to a bounded total wait.
const ENTITY_LOCK_RETRY_MIN_MS = 25
const ENTITY_LOCK_RETRY_MAX_MS = 500
const ENTITY_LOCK_MAX_WAIT_MS = 60_000

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

  // One attempt: the shared/exclusive gate blocks only behind a GC batch, while a busy entity is
  // reported back instead of awaited so waiters never hold a pool connection.
  async function attempt<T>(
    exclusive: boolean,
    operation: () => Promise<T>,
    entityId?: string
  ): Promise<{ acquired: false } | { acquired: true; value: T }> {
    const client: PoolClient = await pool.connect()
    let failed = false
    try {
      await client.query(
        exclusive
          ? SQL`SELECT pg_advisory_lock(hashtextextended(${CONTENT_LOCK_KEY}, 0))`
          : SQL`SELECT pg_advisory_lock_shared(hashtextextended(${CONTENT_LOCK_KEY}, 0))`
      )
      if (entityId) {
        const entityLock = await client.query<{ acquired: boolean }>(
          SQL`SELECT pg_try_advisory_lock(hashtextextended(${'partial-entity:' + entityId}, 0)) AS acquired`
        )
        if (!entityLock.rows[0]?.acquired) {
          return { acquired: false }
        }
      }
      return { acquired: true, value: await operation() }
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

  async function run<T>(exclusive: boolean, operation: () => Promise<T>, entityId?: string): Promise<T> {
    const deadline = Date.now() + ENTITY_LOCK_MAX_WAIT_MS
    for (let delayMs = ENTITY_LOCK_RETRY_MIN_MS; ; delayMs = Math.min(delayMs * 2, ENTITY_LOCK_RETRY_MAX_MS)) {
      const result = await attempt(exclusive, operation, entityId)
      if (result.acquired) {
        return result.value
      }
      if (Date.now() + delayMs > deadline) {
        throw new EntityLockTimeoutError(entityId!)
      }
      await sleep(delayMs)
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
