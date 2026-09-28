import { createTestMetricsComponent } from '@dcl/metrics'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { Pool } from 'pg'
import { createContentLocks, EntityLockTimeoutError } from '../../../../src/adapters/content-locks'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { metricsDeclaration } from '../../../../src/metrics'

describe('when deployments keep the shared gate past a writer bounded wait', () => {
  let query: jest.Mock
  let warn: jest.Mock
  let increment: jest.SpyInstance
  let operation: jest.Mock
  let error: unknown
  let statements: string[]

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue({ rows: [{ acquired: false }] })
    jest.spyOn(Pool.prototype, 'connect').mockResolvedValue({ query, release: jest.fn() } as never)
    warn = jest.fn()
    const logs: ILoggerComponent = {
      getLogger: () => ({ log: jest.fn(), debug: jest.fn(), info: jest.fn(), warn, error: jest.fn() })
    }
    const metrics = createTestMetricsComponent(metricsDeclaration)
    increment = jest.spyOn(metrics, 'increment')
    operation = jest.fn()
    const env = new Environment().setConfig(EnvironmentConfig.CONTENT_LOCK_CONNECTIONS, 1)
    const locks = createContentLocks({ env, logs, metrics }, { maxWaitMs: 100 })
    error = await locks.withWrite(operation).catch((e) => e)
    statements = query.mock.calls.map(([sql]) => (typeof sql === 'string' ? sql : sql.text))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should only try the exclusive lock, never queue for it', () => {
    expect({
      tried: statements.some((sql) => sql.includes('pg_try_advisory_lock(')),
      queued: statements.filter((sql) => /pg_advisory_lock\(|lock_timeout/.test(sql))
    }).toEqual({ tried: true, queued: [] })
  })

  it('should fail with the typed busy error without running the operation', () => {
    expect({ error, ran: operation.mock.calls.length }).toEqual({ error: new EntityLockTimeoutError(), ran: 0 })
  })

  it('should count and warn about the deferred writer', () => {
    expect({ counted: increment.mock.calls, warned: warn.mock.calls.length }).toEqual({
      counted: [['dcl_content_lock_writer_timeouts_total']],
      warned: 1
    })
  })
})
