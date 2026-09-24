import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { Pool, PoolClient } from 'pg'
import SQL from 'sql-template-strings'
import { setTimeout as sleep } from 'timers/promises'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { EntityLockTimeoutError } from './errors'
import { ContentLocksOptions, IContentLocks } from './types'

const CONTENT_LOCK_KEY = 'catalyst-content-gc'
// Backoff while GC or another request holds a lock, up to a bounded total wait.
const ENTITY_LOCK_RETRY_MIN_MS = 25
const ENTITY_LOCK_RETRY_MAX_MS = 500
const ENTITY_LOCK_MAX_WAIT_MS = 60_000

function isPoolTimeout(error: unknown): boolean {
  return error instanceof Error && error.message.includes('timeout exceeded when trying to connect')
}

/**
 * Creates the storage/GC gate on a dedicated connection pool, shared by every process using this
 * database. Deployments share it; garbage collection takes it exclusively, one writer per process at a
 * time so waiting writers hold at most one connection.
 * @param components Environment and logging.
 * @param options Bounded wait and pool connection timeout.
 * @returns Lifecycle-managed content locks.
 */
export function createContentLocks(
  components: Pick<AppComponents, 'env' | 'logs'>,
  options: ContentLocksOptions = {}
): IContentLocks {
  const { env, logs } = components
  const maxWaitMs = options.maxWaitMs ?? ENTITY_LOCK_MAX_WAIT_MS
  const logger = logs.getLogger('content-locks')
  const pool = new Pool({
    port: env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
    host: env.getConfig<string>(EnvironmentConfig.PSQL_HOST),
    database: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
    user: env.getConfig<string>(EnvironmentConfig.PSQL_USER),
    password: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD),
    idleTimeoutMillis: env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT),
    max: env.getConfig<number>(EnvironmentConfig.CONTENT_LOCK_CONNECTIONS),
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000
  })
  pool.on('error', (error) => logger.error(error))

  // One attempt. Only GC blocks on the exclusive gate; deployments report a GC batch or a busy entity
  // back instead of waiting, so they never hold a pool connection while waiting.
  async function attempt<T>(
    exclusive: boolean,
    operation: () => Promise<T>,
    entityId?: string
  ): Promise<{ acquired: false } | { acquired: true; value: T }> {
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch (error) {
      // A saturated pool is busy like a held lock: retried, then reported as a typed timeout.
      if (isPoolTimeout(error)) {
        return { acquired: false }
      }
      throw error
    }
    let failed = false
    try {
      if (exclusive) {
        await client.query(SQL`SELECT pg_advisory_lock(hashtextextended(${CONTENT_LOCK_KEY}, 0))`)
      } else {
        const gate = await client.query<{ acquired: boolean }>(
          SQL`SELECT pg_try_advisory_lock_shared(hashtextextended(${CONTENT_LOCK_KEY}, 0)) AS acquired`
        )
        if (!gate.rows[0]?.acquired) {
          return { acquired: false }
        }
      }
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
    const deadline = Date.now() + maxWaitMs
    for (let delayMs = ENTITY_LOCK_RETRY_MIN_MS; ; delayMs = Math.min(delayMs * 2, ENTITY_LOCK_RETRY_MAX_MS)) {
      const result = await attempt(exclusive, operation, entityId)
      if (result.acquired) {
        return result.value
      }
      if (Date.now() + delayMs > deadline) {
        throw new EntityLockTimeoutError(entityId)
      }
      await sleep(delayMs)
    }
  }

  // Writers are rare (GC and expired-upload cleanup). Queuing them in-process keeps a waiting writer from
  // holding more than one connection while it waits behind in-flight deployments.
  let writers: Promise<unknown> = Promise.resolve()
  function withWrite<T>(operation: () => Promise<T>): Promise<T> {
    const turn = writers.then(() => run(true, operation))
    writers = turn.catch(() => undefined)
    return turn
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
    withWrite
  }
}
