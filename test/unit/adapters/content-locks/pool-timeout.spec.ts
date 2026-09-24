import { createLogComponent } from '@well-known-components/logger'
import { Pool } from 'pg'
import { createContentLocks, EntityLockTimeoutError } from '../../../../src/adapters/content-locks'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'

describe('when the lock pool times out while opening a new connection', () => {
  let connect: jest.SpyInstance
  let operation: jest.Mock
  let error: unknown

  beforeEach(async () => {
    connect = jest
      .spyOn(Pool.prototype, 'connect')
      .mockRejectedValue(new Error('Connection terminated due to connection timeout') as never)
    operation = jest.fn()
    const env = new Environment().setConfig(EnvironmentConfig.CONTENT_LOCK_CONNECTIONS, 1)
    const locks = createContentLocks({ env, logs: await createLogComponent({}) }, { maxWaitMs: 100 })
    error = await locks.withRead(operation, 'an-entity').catch((e) => e)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should retry it like a busy lock and fail with the typed busy error without running the operation', () => {
    expect({
      error,
      retried: connect.mock.calls.length > 1,
      ran: operation.mock.calls.length
    }).toEqual({ error: new EntityLockTimeoutError('an-entity'), retried: true, ran: 0 })
  })
})
