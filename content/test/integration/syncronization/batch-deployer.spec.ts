import { EnvironmentBuilder, EnvironmentConfig } from '../../../src/Environment'
import * as deployments from '../../../src/logic/deployments'
import * as deployRemote from '../../../src/service/synchronization/deployRemoteEntity'

describe('batch deployer - ', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    vi.restoreAllMocks()
  })

  function createComponents() {
    return new EnvironmentBuilder()
      .withConfig(EnvironmentConfig.BOOTSTRAP_FROM_SCRATCH, false)
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .buildConfigAndComponents()
  }

  it('multiple sequential deployments with same entityId is done one time but markAsDeployed is called for both', async () => {
    const components = await createComponents()
    const deployedEntitites = new Set()
    const deployEntityFromRemoteServerSpy = vi
      .spyOn(deployRemote, 'deployEntityFromRemoteServer')
      .mockImplementation(async (components, entityId, ...args) => {
        deployedEntitites.add(entityId)
      })

    vi.spyOn(deployments, 'isEntityDeployed').mockImplementation(async (components, entityId) => {
      return deployedEntitites.has(entityId)
    })

    const markedAsDeployed = new Set()

    const numberOfDeployments = 15
    for (let i = 0; i < numberOfDeployments; i++) {
      await components.batchDeployer.scheduleEntityDeployment(
        {
          entityId: 'asdf',
          entityTimestamp: 123,
          entityType: 'profile',
          pointers: ['anAddress'],
          authChain: [],
          markAsDeployed: async () => {
            markedAsDeployed.add(i)
          }
        },
        []
      )
    }

    await components.batchDeployer.onIdle()
    for (let i = 0; i < numberOfDeployments; i++) {
      expect(markedAsDeployed.has(i)).toBeTruthy()
    }
    expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(1)
  })

  it('multiple concurrent deployments with same entityId is done one time but markAsDeployed is called for both', async () => {
    const components = await createComponents()
    const deployedEntitites = new Set()
    const deployEntityFromRemoteServerSpy = vi
      .spyOn(deployRemote, 'deployEntityFromRemoteServer')
      .mockImplementation(async (components, entityId, ...args) => {
        deployedEntitites.add(entityId)
      })

    vi.spyOn(deployments, 'isEntityDeployed').mockImplementation(async (components, entityId) => {
      return deployedEntitites.has(entityId)
    })

    const markedAsDeployed = new Set()
    const batchDeployments: Promise<void>[] = []
    const numberOfDeployments = 15
    for (let i = 0; i < numberOfDeployments; i++) {
      batchDeployments.push(
        components.batchDeployer.scheduleEntityDeployment(
          {
            entityId: 'asdf',
            entityTimestamp: 123,
            entityType: 'profile',
            pointers: ['anAddress'],
            authChain: [],
            markAsDeployed: async () => {
              markedAsDeployed.add(i)
            }
          },
          []
        )
      )
    }

    await Promise.all(batchDeployments)

    await components.batchDeployer.onIdle()
    for (let i = 0; i < numberOfDeployments; i++) {
      expect(markedAsDeployed.has(i)).toBeTruthy()
    }

    expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(1)
  })

  it('five concurrent deployments with different entityId are done for each one and markAsDeployed is called for each one', async () => {
    const components = await createComponents()
    const deployedEntitites = new Set()
    const deployEntityFromRemoteServerSpy = vi
      .spyOn(deployRemote, 'deployEntityFromRemoteServer')
      .mockImplementation(async (components, entityId, ...args) => {
        deployedEntitites.add(entityId)
      })

    vi.spyOn(deployments, 'isEntityDeployed').mockImplementation(async (components, entityId) => {
      return deployedEntitites.has(entityId)
    })

    const markedAsDeployed = new Set()
    const batchDeployments: Promise<void>[] = []
    const numberOfDeployments = 15
    for (let i = 0; i < numberOfDeployments; i++) {
      batchDeployments.push(
        components.batchDeployer.scheduleEntityDeployment(
          {
            entityId: i.toString(),
            entityTimestamp: 123,
            entityType: 'profile',
            pointers: ['anAddress'],
            authChain: [],
            markAsDeployed: async () => {
              markedAsDeployed.add(i)
            }
          },
          []
        )
      )
    }

    await Promise.all(batchDeployments)

    await components.batchDeployer.onIdle()
    for (let i = 0; i < numberOfDeployments; i++) {
      expect(markedAsDeployed.has(i)).toBeTruthy()
    }

    expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(numberOfDeployments)
  })

  it('markAsDeployed is called but not deployed for deployments that are already deployed', async () => {
    const components = await createComponents()
    const deployEntityFromRemoteServerSpy = vi.spyOn(deployRemote, 'deployEntityFromRemoteServer')

    vi.spyOn(deployments, 'isEntityDeployed').mockResolvedValue(true)

    const markedAsDeployed = new Set()
    await components.batchDeployer.scheduleEntityDeployment(
      {
        entityId: 'asdf',
        entityTimestamp: 123,
        entityType: 'profile',
        pointers: ['anAddress'],
        authChain: [],
        markAsDeployed: async () => {
          markedAsDeployed.add(1)
        }
      },
      []
    )

    await components.batchDeployer.onIdle()
    expect(markedAsDeployed.has(1)).toBeTruthy()
    expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(0)
  })

  it('when a deployment fails, it is reported as failed deployment and markAsDeployed is called', async () => {
    const components = await createComponents()
    const deployEntityFromRemoteServerSpy = vi
      .spyOn(deployRemote, 'deployEntityFromRemoteServer')
      .mockImplementation(async () => {
        throw new Error('error deploying entity (test)')
      })

    vi.spyOn(deployments, 'isEntityDeployed').mockResolvedValue(false)
    const reportFailureSpy = vi.spyOn(components.failedDeployments, 'reportFailure').mockResolvedValue()

    const markedAsDeployed = new Set()
    await components.batchDeployer.scheduleEntityDeployment(
      {
        entityId: 'asdf',
        entityTimestamp: 123,
        entityType: 'profile',
        pointers: ['anAddress'],
        authChain: [],
        markAsDeployed: async () => {
          markedAsDeployed.add(1)
        }
      },
      []
    )

    await components.batchDeployer.onIdle()
    expect(markedAsDeployed.has(1)).toBeTruthy()
    expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(1)
    expect(reportFailureSpy).toBeCalledTimes(1)
  })

  it('when a deployment is successfull, consecutive ones with same entityId are ignored but markAsDeployed is called', async () => {
    const components = await createComponents()
    const deployedEntitites = new Set()
    const deployEntityFromRemoteServerSpy = vi
      .spyOn(deployRemote, 'deployEntityFromRemoteServer')
      .mockImplementation(async (components, entityId, ...args) => {
        deployedEntitites.add(entityId)
      })

    const isEntityDeployedSpy = vi
      .spyOn(deployments, 'isEntityDeployed')
      .mockImplementation(async (components, entityId) => {
        return deployedEntitites.has(entityId)
      })

    const markedAsDeployed = new Set()
    const entityId = 'asdf'
    await components.batchDeployer.scheduleEntityDeployment(
      {
        entityId,
        entityTimestamp: 123,
        entityType: 'profile',
        pointers: ['anAddress'],
        authChain: [],
        markAsDeployed: async () => {
          markedAsDeployed.add(1)
        }
      },
      []
    )
    await components.batchDeployer.onIdle()

    // Now we deployed an entity with same entityId
    await components.batchDeployer.scheduleEntityDeployment(
      {
        entityId,
        entityTimestamp: 123,
        entityType: 'profile',
        pointers: ['anAddress'],
        authChain: [],
        markAsDeployed: async () => {
          markedAsDeployed.add(2)
        }
      },
      []
    )
    await components.batchDeployer.onIdle()

    expect(markedAsDeployed.has(1)).toBeTruthy()
    expect(markedAsDeployed.has(2)).toBeTruthy()
    // Only the first one is truly deployed
    expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(1)
    // It is consulted two times but by the first deployment (early noop and in-queue check)
    expect(isEntityDeployedSpy).toBeCalledTimes(2)
  })
})
