import { EntityType } from '@dcl/schemas'
import { createTestMetricsComponent } from '@dcl/metrics'
import { retryFailedDeploymentExecution } from '../../../src/logic/deployments'
import { EnvironmentConfig } from '../../../src/Environment'
import { FailedDeployment, FailureReason } from '../../../src/adapters/failed-deployments'
import { metricsDeclaration } from '../../../src/metrics'

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

function makeComponents(
  failedDeployments: FailedDeployment[],
  deployShouldFail = false
) {
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const reportedFailures: FailedDeployment[] = []
  const removedIds: string[] = []

  return {
    reportedFailures,
    removedIds,
    components: {
      metrics,
      staticConfigs: {} as any,
      fetcher: {} as any,
      downloadQueue: {} as any,
      logs: { getLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
      deployer: {} as any,
      contentCluster: { getAllServersInCluster: () => ['http://server1'] },
      failedDeployments: {
        getAllFailedDeployments: jest.fn().mockResolvedValue(failedDeployments),
        removeFailedDeployment: jest.fn(async (id: string) => {
          removedIds.push(id)
        }),
        reportFailure: jest.fn(async (d: FailedDeployment) => {
          reportedFailures.push(d)
        })
      },
      storage: {} as any,
      batchDeployer: {
        deployEntityFromRemoteServer: deployShouldFail
          ? jest.fn().mockRejectedValue(new Error('deploy-failed'))
          : jest.fn().mockResolvedValue(undefined)
      },
      env: {
        getConfig: jest.fn((key: EnvironmentConfig) => {
          if (key === EnvironmentConfig.SYNC_DEPLOY_CONCURRENCY) return 1
          if (key === EnvironmentConfig.MAX_FAILED_DEPLOYMENT_RETRIES) return 10
          return undefined
        })
      }
    } as any
  }
}

describe('retryFailedDeploymentExecution', () => {
  it('should skip entries whose nextRetryAt is in the future', async () => {
    const deployment = makeDeployment({ nextRetryAt: Date.now() + 60_000, retryCount: 2 })
    const { components } = makeComponents([deployment])

    await retryFailedDeploymentExecution(components)

    expect(components.batchDeployer.deployEntityFromRemoteServer).not.toHaveBeenCalled()
  })

  it('should retry entries whose nextRetryAt is in the past', async () => {
    const deployment = makeDeployment({ nextRetryAt: Date.now() - 1000, retryCount: 1 })
    const { components } = makeComponents([deployment])

    await retryFailedDeploymentExecution(components)

    expect(components.batchDeployer.deployEntityFromRemoteServer).toHaveBeenCalledWith(
      deployment.entityId,
      deployment.entityType,
      deployment.authChain,
      ['http://server1'],
      expect.anything()
    )
  })

  it('should evict entries that have reached the max retry count', async () => {
    const deployment = makeDeployment({ retryCount: 10, nextRetryAt: 0 })
    const { components, removedIds } = makeComponents([deployment])

    await retryFailedDeploymentExecution(components)

    expect(removedIds).toContain(deployment.entityId)
    expect(components.batchDeployer.deployEntityFromRemoteServer).not.toHaveBeenCalled()
  })

  it('should increment retryCount and set future nextRetryAt on failure', async () => {
    const deployment = makeDeployment({ retryCount: 2, nextRetryAt: 0 })
    const { components, reportedFailures } = makeComponents([deployment], true)

    await retryFailedDeploymentExecution(components)

    expect(reportedFailures).toHaveLength(1)
    expect(reportedFailures[0].retryCount).toBe(3)
    expect(reportedFailures[0].nextRetryAt).toBeGreaterThan(Date.now())
  })

  it('should not increment retryCount for transient pointer-lock conflicts', async () => {
    const deployment = makeDeployment({ retryCount: 2, nextRetryAt: 0 })
    const { components, reportedFailures } = makeComponents([deployment])
    ;(components.batchDeployer.deployEntityFromRemoteServer as jest.Mock).mockRejectedValue(
      new Error("Errors deploying entity(entity-1):\n - The following pointers are currently being deployed: '0,0'. Please try again in a few seconds.")
    )

    await retryFailedDeploymentExecution(components)

    expect(reportedFailures).toHaveLength(0)
  })

  it('should apply exponential backoff capped at 24 hours', async () => {
    const deployment = makeDeployment({ retryCount: 8, nextRetryAt: 0 })
    const { components, reportedFailures } = makeComponents([deployment], true)
    const before = Date.now()

    await retryFailedDeploymentExecution(components)

    const maxInterval = 24 * 60 * 60 * 1000
    expect(reportedFailures[0].nextRetryAt! - before).toBeLessThanOrEqual(maxInterval + 1000)
    expect(reportedFailures[0].nextRetryAt! - before).toBeGreaterThanOrEqual(maxInterval - 1000)
  })

  it('should remove the failed deployment after a successful retry', async () => {
    // deployEntity() treats an already-deployed entity as an idempotent no-op and returns
    // before its own removeFailedDeployment() cleanup, so a retry can resolve successfully
    // while leaving the row behind. Without an explicit removal the entry stays due and is
    // retried every cycle until it burns through the max-retry cap.
    const deployment = makeDeployment({ retryCount: 2, nextRetryAt: Date.now() - 1000 })
    const { components, removedIds, reportedFailures } = makeComponents([deployment])

    await retryFailedDeploymentExecution(components)

    expect(components.batchDeployer.deployEntityFromRemoteServer).toHaveBeenCalled()
    expect(removedIds).toEqual([deployment.entityId])
    expect(reportedFailures).toHaveLength(0)
  })

  it('should not remove the failed deployment when the retry fails', async () => {
    const deployment = makeDeployment({ retryCount: 2, nextRetryAt: Date.now() - 1000 })
    const { components, removedIds } = makeComponents([deployment], true)

    await retryFailedDeploymentExecution(components)

    expect(removedIds).toEqual([])
  })
})
