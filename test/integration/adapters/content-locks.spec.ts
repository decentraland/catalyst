import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { createContentLocks, IContentLocks } from '../../../src/adapters/content-locks'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'

describe('Integration - content locks', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    await server.stopProgram()
    server = null as any
  })

  describe('when requests wait for a busy entity lock', () => {
    let locks: IContentLocks
    let holder: Promise<string>
    let waiter: Promise<string>
    let otherEntity: string

    beforeEach(async () => {
      // Two connections: one held by the busy entity, one that must stay free while others wait on it.
      const env = new Environment(server.components.env).setConfig(EnvironmentConfig.CONTENT_LOCK_CONNECTIONS, 2)
      locks = createContentLocks({ env, logs: server.components.logs })
      let releaseHolder!: () => void
      const held = new Promise<void>((resolve) => (releaseHolder = resolve))
      holder = locks.withRead(async () => {
        await held
        return 'holder'
      }, 'busy-entity')
      await new Promise((resolve) => setTimeout(resolve, 100))
      waiter = locks.withRead(async () => 'waiter', 'busy-entity')
      await new Promise((resolve) => setTimeout(resolve, 100))
      otherEntity = await Promise.race([
        locks.withRead(async () => 'other entity', 'free-entity'),
        new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 3000))
      ])
      releaseHolder()
    })

    afterEach(async () => {
      await Promise.allSettled([holder, waiter])
      await locks[STOP_COMPONENT]?.()
    })

    it('should keep a connection free for other entities and run the waiter once the lock is released', async () => {
      expect({ otherEntity, holder: await holder, waiter: await waiter }).toEqual({
        otherEntity: 'other entity',
        holder: 'holder',
        waiter: 'waiter'
      })
    })
  })
})
