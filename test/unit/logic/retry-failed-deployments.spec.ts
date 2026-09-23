import { EntityType } from '@dcl/schemas'
import { createTestMetricsComponent } from '@dcl/metrics'
import { retryFailedDeploymentExecution } from '../../../src/logic/deployments'
import { EnvironmentConfig } from '../../../src/Environment'
import { FailedDeployment, FailureReason, IFailedDeploymentsComponent } from '../../../src/adapters/failed-deployments'
import { IGNORING_FIX_ERROR } from '../../../src/logic/deployment-service'
import { metricsDeclaration } from '../../../src/metrics'

const CONTENT_SERVERS = ['http://server1']
const MAX_RETRIES = 10
const BASE_RETRY_INTERVAL_MS = 15 * 60 * 1000
const MAX_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000
// Message produced by the deployment service when a pointer lock is already held.
const POINTER_LOCK_CONFLICT =
  "Errors deploying entity(entity-1):\n - The following pointers are currently being deployed: '0,0'. Please try again in a few seconds."

/** The slice of the component the retry loop uses, typed so a renamed method fails to compile. */
type FailedDeploymentsMock = Pick<
  IFailedDeploymentsComponent,
  'getAllFailedDeployments' | 'removeFailedDeployment' | 'removeExhaustedFailedDeployments' | 'reportFailure'
>

/** Never resolves — stands in for a call that is still in flight. */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined)
}

function makeDeployment(overrides: Partial<FailedDeployment> = {}): FailedDeployment {
  return {
    entityType: EntityType.PROFILE,
    entityId: 'entity-1',
    failureTimestamp: 100,
    reason: FailureReason.DEPLOYMENT_ERROR,
    authChain: [{ type: 'SIGNER' as any, payload: '0x1234', signature: '' }],
    errorDescription: 'some-error',
    snapshotHash: 'hash1',
    retryCount: 0,
    nextRetryAt: 0,
    ...overrides
  }
}

/** Lets every already-scheduled microtask and queued job run before the assertions look at them. */
async function flushPendingJobs(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

/**
 * Awaits a promise, giving up after a short grace period. A regression that leaves the retry loop
 * blocked forever then fails on its assertion in milliseconds rather than on the 60s jest timeout.
 */
async function awaitOrGiveUp(promise: Promise<unknown>): Promise<void> {
  void promise.catch(() => undefined)
  await Promise.race([promise.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 100))])
}

/** Reports whether a promise has settled, without awaiting it if it has not. */
async function settleState(promise: Promise<unknown>): Promise<'pending' | 'settled'> {
  return Promise.race([
    promise.then(
      () => 'settled' as const,
      () => 'settled' as const
    ),
    new Promise<'pending'>((resolve) => setImmediate(() => resolve('pending')))
  ])
}

describe('when retrying failed deployments', () => {
  let failedDeployments: FailedDeployment[]
  let deployEntityFromRemoteServer: jest.Mock
  let removeFailedDeployment: jest.Mock
  let removeExhaustedFailedDeployments: jest.Mock
  let reportFailure: jest.Mock
  let logger: { info: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock }
  let failedDeploymentsComponent: FailedDeploymentsMock
  let components: any

  beforeEach(() => {
    failedDeployments = []
    deployEntityFromRemoteServer = jest.fn().mockResolvedValue(undefined)
    removeFailedDeployment = jest.fn().mockResolvedValue(undefined)
    removeExhaustedFailedDeployments = jest.fn().mockResolvedValue(undefined)
    reportFailure = jest.fn().mockResolvedValue(undefined)
    logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
    failedDeploymentsComponent = {
      // Read lazily so each context's beforeEach can define its own backlog.
      getAllFailedDeployments: jest.fn(async () => failedDeployments),
      removeFailedDeployment,
      removeExhaustedFailedDeployments,
      reportFailure
    }
    components = {
      metrics: createTestMetricsComponent(metricsDeclaration),
      staticConfigs: {} as any,
      fetcher: {} as any,
      downloadQueue: {} as any,
      logs: { getLogger: () => logger },
      deployer: {} as any,
      contentCluster: { getAllServersInCluster: () => CONTENT_SERVERS },
      failedDeployments: failedDeploymentsComponent,
      storage: {} as any,
      batchDeployer: { deployEntityFromRemoteServer },
      env: {
        getConfig: jest.fn((key: EnvironmentConfig) => {
          if (key === EnvironmentConfig.SYNC_DEPLOY_CONCURRENCY) return 10
          if (key === EnvironmentConfig.MAX_FAILED_DEPLOYMENT_RETRIES) return MAX_RETRIES
          return undefined
        })
      }
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and an entry is still inside its backoff window', () => {
    beforeEach(async () => {
      failedDeployments = [makeDeployment({ retryCount: 2, nextRetryAt: Date.now() + 60_000 })]
      await retryFailedDeploymentExecution(components)
    })

    it('should not attempt to deploy it', () => {
      expect(deployEntityFromRemoteServer).not.toHaveBeenCalled()
    })

    it('should leave the entry in place', () => {
      expect(removeExhaustedFailedDeployments).not.toHaveBeenCalled()
      expect(removeFailedDeployment).not.toHaveBeenCalled()
    })
  })

  describe('and the backoff window of an entry has elapsed', () => {
    let deployment: FailedDeployment

    beforeEach(async () => {
      deployment = makeDeployment({ retryCount: 1, nextRetryAt: Date.now() - 1000 })
      failedDeployments = [deployment]
      await retryFailedDeploymentExecution(components)
    })

    it('should deploy it from the cluster servers as a fix attempt', () => {
      expect(deployEntityFromRemoteServer).toHaveBeenCalledWith(
        deployment.entityId,
        deployment.entityType,
        deployment.authChain,
        CONTENT_SERVERS,
        expect.anything()
      )
    })
  })

  describe('and an entry has no auth chain', () => {
    beforeEach(async () => {
      failedDeployments = [makeDeployment({ authChain: undefined as any })]
      await retryFailedDeploymentExecution(components)
    })

    it('should not attempt to deploy it', () => {
      expect(deployEntityFromRemoteServer).not.toHaveBeenCalled()
    })

    it('should not remove it', () => {
      expect(removeExhaustedFailedDeployments).not.toHaveBeenCalled()
      expect(removeFailedDeployment).not.toHaveBeenCalled()
    })
  })

  describe('and several entries have exhausted their retries', () => {
    let exhaustedDeployments: FailedDeployment[]

    beforeEach(async () => {
      exhaustedDeployments = ['entity-a', 'entity-b', 'entity-c'].map((entityId) =>
        makeDeployment({ entityId, retryCount: MAX_RETRIES, nextRetryAt: 0 })
      )
      failedDeployments = exhaustedDeployments
      await retryFailedDeploymentExecution(components)
    })

    it('should drop them with a single batched removal', () => {
      expect(removeExhaustedFailedDeployments).toHaveBeenCalledTimes(1)
    })

    it('should pass every exhausted entity id to that removal', () => {
      expect(removeExhaustedFailedDeployments).toHaveBeenCalledWith(['entity-a', 'entity-b', 'entity-c'], MAX_RETRIES)
    })

    it('should guard the removal with the retry cap, so a re-reported entry is spared', () => {
      expect(removeExhaustedFailedDeployments).toHaveBeenCalledWith(expect.anything(), MAX_RETRIES)
    })

    it('should not fall back to removing them one at a time', () => {
      expect(removeFailedDeployment).not.toHaveBeenCalled()
    })

    it('should not attempt to deploy them', () => {
      expect(deployEntityFromRemoteServer).not.toHaveBeenCalled()
    })

    it('should warn once for each entry it gives up on', () => {
      expect(logger.warn).toHaveBeenCalledTimes(3)
    })
  })

  describe('and exhausted entries are followed by a retryable one', () => {
    let retryableDeployment: FailedDeployment
    let deploysStartedWhileRemovalPending: number

    beforeEach(async () => {
      let resolveRemoval: () => void = () => undefined
      retryableDeployment = makeDeployment({ entityId: 'retryable', retryCount: 1, nextRetryAt: 0 })
      failedDeployments = [
        makeDeployment({ entityId: 'exhausted-a', retryCount: MAX_RETRIES }),
        makeDeployment({ entityId: 'exhausted-b', retryCount: MAX_RETRIES }),
        retryableDeployment
      ]
      // Both removal paths stay in flight, so any scan that deletes give-up entries before it
      // finishes scheduling — one at a time or in a batch — never reaches the retryable entry.
      removeExhaustedFailedDeployments.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRemoval = resolve
          })
      )
      removeFailedDeployment.mockImplementation(async (entityId: string) =>
        entityId.startsWith('exhausted') ? pending<void>() : undefined
      )
      const execution = retryFailedDeploymentExecution(components)
      await flushPendingJobs()
      deploysStartedWhileRemovalPending = deployEntityFromRemoteServer.mock.calls.length
      resolveRemoval()
      await awaitOrGiveUp(execution)
    })

    it('should start the retryable deployment without waiting for the removal to finish', () => {
      expect(deploysStartedWhileRemovalPending).toBe(1)
    })

    it('should deploy the retryable entry', () => {
      expect(deployEntityFromRemoteServer).toHaveBeenCalledWith(
        retryableDeployment.entityId,
        retryableDeployment.entityType,
        retryableDeployment.authChain,
        CONTENT_SERVERS,
        expect.anything()
      )
    })

    it('should still drop the exhausted entries in one batch', () => {
      expect(removeExhaustedFailedDeployments).toHaveBeenCalledTimes(1)
      expect(removeExhaustedFailedDeployments).toHaveBeenCalledWith(['exhausted-a', 'exhausted-b'], MAX_RETRIES)
    })
  })

  describe('and a retry is still running while exhausted entries are dropped', () => {
    let removalsIssuedWhileRetryInFlight: number

    beforeEach(async () => {
      let resolveDeploy: () => void = () => undefined
      failedDeployments = [
        makeDeployment({ entityId: 'exhausted', retryCount: MAX_RETRIES }),
        makeDeployment({ entityId: 'retryable', retryCount: 1, nextRetryAt: 0 })
      ]
      deployEntityFromRemoteServer.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDeploy = resolve
          })
      )
      const execution = retryFailedDeploymentExecution(components)
      await flushPendingJobs()
      removalsIssuedWhileRetryInFlight = removeExhaustedFailedDeployments.mock.calls.length
      resolveDeploy()
      await awaitOrGiveUp(execution)
    })

    it('should overlap the removal with the retry instead of waiting for the queue to drain', () => {
      expect(removalsIssuedWhileRetryInFlight).toBe(1)
    })
  })

  describe('and no entry has exhausted its retries', () => {
    beforeEach(async () => {
      failedDeployments = [makeDeployment({ retryCount: 1, nextRetryAt: 0 })]
      await retryFailedDeploymentExecution(components)
    })

    it('should not issue a batched removal', () => {
      expect(removeExhaustedFailedDeployments).not.toHaveBeenCalled()
    })
  })

  describe('and the batched removal fails while a retry is still in flight', () => {
    let stateWhileRetryInFlight: 'pending' | 'settled'
    let outcome: 'resolved' | Error
    let retryCleanupsDoneAtSettle: number

    beforeEach(async () => {
      let resolveDeploy: () => void = () => undefined
      failedDeployments = [
        makeDeployment({ entityId: 'exhausted', retryCount: MAX_RETRIES }),
        makeDeployment({ entityId: 'retryable', retryCount: 1, nextRetryAt: 0 })
      ]
      deployEntityFromRemoteServer.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDeploy = resolve
          })
      )
      removeExhaustedFailedDeployments.mockRejectedValue(new Error('delete failed'))
      const settled = retryFailedDeploymentExecution(components).then(
        () => 'resolved' as const,
        (error: Error) => error
      )
      // Read at the moment the function settles, so this reflects whether the retry had already
      // finished by then rather than whether it finished at all.
      const cleanupsAtSettle = settled.then(() => removeFailedDeployment.mock.calls.length)
      await flushPendingJobs()
      stateWhileRetryInFlight = await settleState(settled)
      resolveDeploy()
      outcome = await settled
      retryCleanupsDoneAtSettle = await cleanupsAtSettle
    })

    it('should not settle until the in-flight retry has finished', () => {
      expect(stateWhileRetryInFlight).toBe('pending')
    })

    it('should surface the removal error to the job runner', () => {
      expect(outcome).toBeInstanceOf(Error)
      expect((outcome as Error).message).toBe('delete failed')
    })

    it('should have let the in-flight retry run to completion before settling', () => {
      expect(retryCleanupsDoneAtSettle).toBe(1)
    })
  })

  describe('and reporting a failed retry itself throws', () => {
    let unhandledRejections: unknown[]
    let onUnhandledRejection: (reason: unknown) => void

    beforeEach(async () => {
      unhandledRejections = []
      onUnhandledRejection = (reason) => unhandledRejections.push(reason)
      process.on('unhandledRejection', onUnhandledRejection)
      failedDeployments = [makeDeployment({ retryCount: 2, nextRetryAt: 0 })]
      deployEntityFromRemoteServer.mockRejectedValue(new Error('deploy-failed'))
      // The task's own catch block writes to the database, so it can throw in turn.
      reportFailure.mockRejectedValue(new Error('database is down'))
      await retryFailedDeploymentExecution(components)
      await flushPendingJobs()
    })

    afterEach(() => {
      process.off('unhandledRejection', onUnhandledRejection)
    })

    it('should not leave the rejection unhandled, which would take the process down', () => {
      expect(unhandledRejections).toEqual([])
    })

    it('should log the unexpected failure instead', () => {
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error while retrying deployment',
        expect.objectContaining({ errorDescription: 'database is down' })
      )
    })
  })

  describe('and the deployment of an entry succeeds', () => {
    let deployment: FailedDeployment

    beforeEach(async () => {
      deployment = makeDeployment({ retryCount: 2, nextRetryAt: Date.now() - 1000 })
      failedDeployments = [deployment]
      await retryFailedDeploymentExecution(components)
    })

    it('should remove the entry, which an idempotent no-op deploy would have left behind', () => {
      expect(removeFailedDeployment).toHaveBeenCalledWith(deployment.entityId)
    })

    it('should not report a new failure', () => {
      expect(reportFailure).not.toHaveBeenCalled()
    })
  })

  describe('and the deployment of an entry fails', () => {
    let deployment: FailedDeployment
    let startedAt: number

    beforeEach(async () => {
      deployment = makeDeployment({ retryCount: 2, nextRetryAt: 0 })
      failedDeployments = [deployment]
      deployEntityFromRemoteServer.mockRejectedValue(new Error('deploy-failed'))
      startedAt = Date.now()
      await retryFailedDeploymentExecution(components)
    })

    it('should report the failure with an incremented retry count', () => {
      expect(reportFailure).toHaveBeenCalledWith(expect.objectContaining({ retryCount: 3 }))
    })

    it('should schedule the next retry in the future', () => {
      expect(reportFailure.mock.calls[0][0].nextRetryAt).toBeGreaterThan(startedAt)
    })

    it('should not remove the entry', () => {
      expect(removeFailedDeployment).not.toHaveBeenCalled()
    })
  })

  describe('and the deployment of an entry fails because its pointers are already being deployed', () => {
    let deployment: FailedDeployment
    let scheduledBackoffMs: number

    beforeEach(async () => {
      deployment = makeDeployment({ retryCount: 2, nextRetryAt: 0 })
      failedDeployments = [deployment]
      deployEntityFromRemoteServer.mockRejectedValue(new Error(POINTER_LOCK_CONFLICT))
      const startedAt = Date.now()
      await retryFailedDeploymentExecution(components)
      scheduledBackoffMs = reportFailure.mock.calls[0][0].nextRetryAt - startedAt
    })

    it('should not consume an attempt, since the entity was never evaluated', () => {
      expect(reportFailure).toHaveBeenCalledWith(expect.objectContaining({ retryCount: 2 }))
    })

    it('should defer the entry by the same backoff a failure at this stage gets', () => {
      expect(scheduledBackoffMs).toBeGreaterThanOrEqual(BASE_RETRY_INTERVAL_MS * 2 ** 2 - 1000)
      expect(scheduledBackoffMs).toBeLessThanOrEqual(BASE_RETRY_INTERVAL_MS * 2 ** 2 + 1000)
    })

    it('should keep the original failure description rather than the conflict message', () => {
      expect(reportFailure).toHaveBeenCalledWith(
        expect.objectContaining({ errorDescription: deployment.errorDescription })
      )
    })
  })

  describe('and an entry that hit a pointer-lock conflict is scanned again in the next cycle', () => {
    let deploysAfterSecondCycle: number

    beforeEach(async () => {
      failedDeployments = [makeDeployment({ retryCount: 0, nextRetryAt: 0 })]
      deployEntityFromRemoteServer.mockRejectedValue(new Error(POINTER_LOCK_CONFLICT))
      await retryFailedDeploymentExecution(components)
      // The next cycle scans what the conflict just persisted.
      failedDeployments = [reportFailure.mock.calls[0][0]]
      await retryFailedDeploymentExecution(components)
      deploysAfterSecondCycle = deployEntityFromRemoteServer.mock.calls.length
    })

    it('should not dispatch it again before the deferred deadline', () => {
      expect(deploysAfterSecondCycle).toBe(1)
    })
  })

  describe('and the deployment of an entry is skipped because newer entities exist', () => {
    beforeEach(async () => {
      failedDeployments = [makeDeployment({ retryCount: 2, nextRetryAt: 0 })]
      deployEntityFromRemoteServer.mockRejectedValue(new Error(`${IGNORING_FIX_ERROR} (pointers=0,0)`))
      await retryFailedDeploymentExecution(components)
    })

    it('should not report a failure for an entity that is intentionally not fixed', () => {
      expect(reportFailure).not.toHaveBeenCalled()
    })
  })

  describe('and an entry keeps failing after many attempts', () => {
    let scheduledBackoffMs: number

    beforeEach(async () => {
      failedDeployments = [makeDeployment({ retryCount: 8, nextRetryAt: 0 })]
      deployEntityFromRemoteServer.mockRejectedValue(new Error('deploy-failed'))
      const startedAt = Date.now()
      await retryFailedDeploymentExecution(components)
      scheduledBackoffMs = reportFailure.mock.calls[0][0].nextRetryAt - startedAt
    })

    it('should cap the backoff at 24 hours', () => {
      expect(scheduledBackoffMs).toBeLessThanOrEqual(MAX_RETRY_INTERVAL_MS)
    })

    it('should not schedule the next retry meaningfully earlier than the cap', () => {
      expect(scheduledBackoffMs).toBeGreaterThanOrEqual(MAX_RETRY_INTERVAL_MS - 1000)
    })
  })
})
