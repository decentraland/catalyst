import { EnvironmentConfig } from '../../../src/Environment'
import * as deployments from '../../../src/logic/deployments'
import * as deployRemote from '../../../src/service/synchronization/deployRemoteEntity'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment({ [EnvironmentConfig.DISABLE_SYNCHRONIZATION]: true })('batch deployer - ', (testEnv) => {

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  testCaseWithComponents(
    testEnv,
    'multiple sequential deployments with same entityId is done one time but markAsDeployed is called for both',
    async (components) => {

      const deployedEntitites = new Set()
      const deployEntityFromRemoteServerSpy = jest.spyOn(deployRemote, 'deployEntityFromRemoteServer').mockImplementation(async (components, entityId, ...args) => {
        deployedEntitites.add(entityId)
      })

      jest.spyOn(deployments, 'isEntityDeployed').mockImplementation(async (components, entityId) => {
        return deployedEntitites.has(entityId)
      })

      const markedAsDeployed = new Set()

      const numberOfDeployments = 15
      for (let i = 0; i < numberOfDeployments; i++) {
        await components.batchDeployer.deployEntity({
          entityId: 'asdf',
          entityTimestamp: 123,
          entityType: 'profile',
          pointers: ['anAddress'],
          authChain: [],
          markAsDeployed: async () => { markedAsDeployed.add(i) }
        }, [])
      }

      await components.batchDeployer.onIdle()
      for (let i = 0; i < numberOfDeployments; i++) {
        expect(markedAsDeployed.has(i)).toBeTruthy()
      }
      expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(1)
    }
  )

  testCaseWithComponents(
    testEnv,
    'multiple concurrent deployments with same entityId is done one time but markAsDeployed is called for both',
    async (components) => {

      const deployedEntitites = new Set()
      const deployEntityFromRemoteServerSpy = jest.spyOn(deployRemote, 'deployEntityFromRemoteServer').mockImplementation(async (components, entityId, ...args) => {
        deployedEntitites.add(entityId)
      })

      jest.spyOn(deployments, 'isEntityDeployed').mockImplementation(async (components, entityId) => {
        return deployedEntitites.has(entityId)
      })


      const markedAsDeployed = new Set()
      const batchDeployments: Promise<void>[] = []
      const numberOfDeployments = 15
      for (let i = 0; i < numberOfDeployments; i++) {
        batchDeployments.push(
          components.batchDeployer.deployEntity({
            entityId: 'asdf',
            entityTimestamp: 123,
            entityType: 'profile',
            pointers: ['anAddress'],
            authChain: [],
            markAsDeployed: async () => { markedAsDeployed.add(i) }
          }, [])
        )
      }

      await Promise.all(batchDeployments)

      await components.batchDeployer.onIdle()
      for (let i = 0; i < numberOfDeployments; i++) {
        expect(markedAsDeployed.has(i)).toBeTruthy()
      }

      expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(1)
    }
  )

  testCaseWithComponents(
    testEnv,
    'five concurrent deployments with different entityId are done for each one and markAsDeployed is called for each one',
    async (components) => {

      const deployedEntitites = new Set()
      const deployEntityFromRemoteServerSpy = jest.spyOn(deployRemote, 'deployEntityFromRemoteServer').mockImplementation(async (components, entityId, ...args) => {
        deployedEntitites.add(entityId)
      })

      jest.spyOn(deployments, 'isEntityDeployed').mockImplementation(async (components, entityId) => {
        return deployedEntitites.has(entityId)
      })


      const markedAsDeployed = new Set()
      const batchDeployments: Promise<void>[] = []
      const numberOfDeployments = 15
      for (let i = 0; i < numberOfDeployments; i++) {
        batchDeployments.push(
          components.batchDeployer.deployEntity({
            entityId: i.toString(),
            entityTimestamp: 123,
            entityType: 'profile',
            pointers: ['anAddress'],
            authChain: [],
            markAsDeployed: async () => { markedAsDeployed.add(i) }
          }, [])
        )
      }

      await Promise.all(batchDeployments)

      await components.batchDeployer.onIdle()
      for (let i = 0; i < numberOfDeployments; i++) {
        expect(markedAsDeployed.has(i)).toBeTruthy()
      }

      expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(numberOfDeployments)
    }
  )

  testCaseWithComponents(
    testEnv,
    'markAsDeployed is called but not deployed for deployments that are already deployed',
    async (components) => {

      const deployEntityFromRemoteServerSpy = jest.spyOn(deployRemote, 'deployEntityFromRemoteServer')

      jest.spyOn(deployments, 'isEntityDeployed').mockResolvedValue(true)


      const markedAsDeployed = new Set()
      await components.batchDeployer.deployEntity({
        entityId: 'asdf',
        entityTimestamp: 123,
        entityType: 'profile',
        pointers: ['anAddress'],
        authChain: [],
        markAsDeployed: async () => { markedAsDeployed.add(1) }
      }, [])

      await components.batchDeployer.onIdle()
      expect(markedAsDeployed.has(1)).toBeTruthy()
      expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(0)
    }
  )

  testCaseWithComponents(
    testEnv,
    'when a deployment fails, it is reported as failed deployment and markAsDeployed is called',
    async (components) => {

      const deployEntityFromRemoteServerSpy = jest.spyOn(deployRemote, 'deployEntityFromRemoteServer').mockImplementation(async () => {
        throw new Error('error deploying entity (test)')
      })

      jest.spyOn(deployments, 'isEntityDeployed').mockResolvedValue(false)
      const reportFailureSpy = jest.spyOn(components.failedDeployments, 'reportFailure').mockResolvedValue()


      const markedAsDeployed = new Set()
      await components.batchDeployer.deployEntity({
        entityId: 'asdf',
        entityTimestamp: 123,
        entityType: 'profile',
        pointers: ['anAddress'],
        authChain: [],
        markAsDeployed: async () => { markedAsDeployed.add(1) }
      }, [])

      await components.batchDeployer.onIdle()
      expect(markedAsDeployed.has(1)).toBeTruthy()
      expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(1)
      expect(reportFailureSpy).toBeCalledTimes(1)
    }
  )

  testCaseWithComponents(
    testEnv,
    'when a deployment is successfull, consecutive ones with same entityId are ignored but markAsDeployed is called',
    async (components) => {

      const deployedEntitites = new Set()
      const deployEntityFromRemoteServerSpy = jest.spyOn(deployRemote, 'deployEntityFromRemoteServer').mockImplementation(async (components, entityId, ...args) => {
        deployedEntitites.add(entityId)
      })

      const isEntityDeployedSpy = jest.spyOn(deployments, 'isEntityDeployed').mockImplementation(async (components, entityId) => {
        return deployedEntitites.has(entityId)
      })

      const markedAsDeployed = new Set()
      const entityId = 'asdf'
      await components.batchDeployer.deployEntity({
        entityId,
        entityTimestamp: 123,
        entityType: 'profile',
        pointers: ['anAddress'],
        authChain: [],
        markAsDeployed: async () => { markedAsDeployed.add(1) }
      }, [])
      await components.batchDeployer.onIdle()

      // Now we deployed an entity with same entityId
      await components.batchDeployer.deployEntity({
        entityId,
        entityTimestamp: 123,
        entityType: 'profile',
        pointers: ['anAddress'],
        authChain: [],
        markAsDeployed: async () => { markedAsDeployed.add(2) }
      }, [])
      await components.batchDeployer.onIdle()

      expect(markedAsDeployed.has(1)).toBeTruthy()
      expect(markedAsDeployed.has(2)).toBeTruthy()
      // Only the first one is truly deployed
      expect(deployEntityFromRemoteServerSpy).toBeCalledTimes(1)
      // It is consulted two times but by the first deployment (early noop and in-queue check)
      expect(isEntityDeployedSpy).toBeCalledTimes(2)
    }
  )
})
