import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { createContentLocks, EntityLockTimeoutError, IContentLocks } from '../../../src/adapters/content-locks'
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

  describe('when deployments arrive while garbage collection holds the exclusive lock', () => {
    let locks: IContentLocks
    let gc: Promise<string>
    let deployments: Promise<string[]>
    let lockWaiters: number

    beforeEach(async () => {
      const env = new Environment(server.components.env).setConfig(EnvironmentConfig.CONTENT_LOCK_CONNECTIONS, 2)
      locks = createContentLocks({ env, logs: server.components.logs })
      let releaseGc!: () => void
      const held = new Promise<void>((resolve) => (releaseGc = resolve))
      gc = locks.withWrite(async () => {
        await held
        return 'gc'
      })
      await new Promise((resolve) => setTimeout(resolve, 100))
      deployments = Promise.all([1, 2, 3].map((i) => locks.withRead(async () => `deployment ${i}`)))
      await new Promise((resolve) => setTimeout(resolve, 300))
      const waiting = await server.components.database.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'advisory'`
      )
      lockWaiters = Number(waiting.rows[0].count)
      releaseGc()
    })

    afterEach(async () => {
      await Promise.allSettled([gc, deployments])
      await locks[STOP_COMPONENT]?.()
    })

    it('should not hold connections waiting on the lock and run every deployment once GC finishes', async () => {
      expect({ lockWaiters, gc: await gc, deployments: await deployments }).toEqual({
        lockWaiters: 0,
        gc: 'gc',
        deployments: ['deployment 1', 'deployment 2', 'deployment 3']
      })
    })
  })

  describe('when several writers queue behind a deployment holding the shared lock', () => {
    let locks: IContentLocks
    let deployment: Promise<string>
    let writers: Promise<string[]>
    let lockWaiters: number

    beforeEach(async () => {
      const env = new Environment(server.components.env).setConfig(EnvironmentConfig.CONTENT_LOCK_CONNECTIONS, 3)
      locks = createContentLocks({ env, logs: server.components.logs })
      let releaseDeployment!: () => void
      const held = new Promise<void>((resolve) => (releaseDeployment = resolve))
      deployment = locks.withRead(async () => {
        await held
        return 'deployment'
      })
      await new Promise((resolve) => setTimeout(resolve, 100))
      writers = Promise.all([1, 2, 3].map((i) => locks.withWrite(async () => `writer ${i}`)))
      await new Promise((resolve) => setTimeout(resolve, 300))
      const waiting = await server.components.database.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'advisory'`
      )
      lockWaiters = Number(waiting.rows[0].count)
      releaseDeployment()
    })

    afterEach(async () => {
      await Promise.allSettled([deployment, writers])
      await locks[STOP_COMPONENT]?.()
    })

    it('should let only one writer wait on a connection and run all of them once the deployment ends', async () => {
      expect({ lockWaiters, writers: await writers }).toEqual({
        lockWaiters: 1,
        writers: ['writer 1', 'writer 2', 'writer 3']
      })
    })
  })

  describe('when a writer waits behind a deployment that keeps the shared lock past the bounded wait', () => {
    let locks: IContentLocks
    let deployment: Promise<string>
    let writerError: unknown
    let laterDeployment: string

    beforeEach(async () => {
      const env = new Environment(server.components.env).setConfig(EnvironmentConfig.CONTENT_LOCK_CONNECTIONS, 3)
      locks = createContentLocks({ env, logs: server.components.logs }, { maxWaitMs: 1_000, writerLockTimeoutMs: 200 })
      let releaseDeployment!: () => void
      const held = new Promise<void>((resolve) => (releaseDeployment = resolve))
      deployment = locks.withRead(async () => {
        await held
        return 'deployment'
      })
      await new Promise((resolve) => setTimeout(resolve, 100))
      writerError = await locks.withWrite(async () => 'writer').catch((e) => e)
      laterDeployment = await Promise.race([
        locks.withRead(async () => 'later deployment'),
        new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 3000))
      ])
      releaseDeployment()
    })

    afterEach(async () => {
      await Promise.allSettled([deployment])
      await locks[STOP_COMPONENT]?.()
    })

    it('should fail the writer with the typed busy error and leave the gate open to later deployments', () => {
      expect({ writerError, laterDeployment }).toEqual({
        writerError: new EntityLockTimeoutError(),
        laterDeployment: 'later deployment'
      })
    })
  })

  describe('when the lock pool stays saturated past the bounded wait', () => {
    let locks: IContentLocks
    let holder: Promise<string>
    let error: unknown

    beforeEach(async () => {
      const env = new Environment(server.components.env).setConfig(EnvironmentConfig.CONTENT_LOCK_CONNECTIONS, 1)
      locks = createContentLocks({ env, logs: server.components.logs }, { maxWaitMs: 300, connectionTimeoutMs: 100 })
      let releaseHolder!: () => void
      const held = new Promise<void>((resolve) => (releaseHolder = resolve))
      holder = locks.withRead(async () => {
        await held
        return 'holder'
      })
      await new Promise((resolve) => setTimeout(resolve, 100))
      error = await locks.withRead(async () => 'blocked', 'saturated-entity').catch((e) => e)
      releaseHolder()
    })

    afterEach(async () => {
      await Promise.allSettled([holder])
      await locks[STOP_COMPONENT]?.()
    })

    it('should fail with the typed busy error instead of a raw pool timeout', () => {
      expect(error).toEqual(new EntityLockTimeoutError('saturated-entity'))
    })
  })
})
