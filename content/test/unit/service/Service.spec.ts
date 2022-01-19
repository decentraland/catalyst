import { DECENTRALAND_ADDRESS } from '@catalyst/commons'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import assert from 'assert'
import { ContentFileHash, Deployment, Entity, EntityType, EntityVersion, Hashing } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import { Environment } from '../../../src/Environment'
import { metricsDeclaration } from '../../../src/metrics'
import { createBloomFilterComponent } from '../../../src/ports/bloomFilter'
import { createFailedDeploymentsCache } from '../../../src/ports/failedDeploymentsCache'
import { createDatabaseComponent } from '../../../src/ports/postgres'
import { ContentAuthenticator } from '../../../src/service/auth/Authenticator'
import { DeploymentManager } from '../../../src/service/deployments/DeploymentManager'
import * as deployments from '../../../src/service/deployments/deployments'
import { DELTA_POINTER_RESULT } from '../../../src/service/pointers/PointerManager'
import {
  DeploymentContext,
  DeploymentResult,
  isInvalidDeployment,
  LocalDeploymentAuditInfo
} from '../../../src/service/Service'
import { ServiceFactory } from '../../../src/service/ServiceFactory'
import { MockedRepository } from '../../helpers/repository/MockedRepository'
import { buildEntityAndFile } from '../../helpers/service/EntityTestFactory'
import { NoOpServerValidator, NoOpValidator } from '../../helpers/service/validations/NoOpValidator'
import { MockedStorage } from '../storage/MockedStorage'
import { NoOpPointerManager } from './pointers/NoOpPointerManager'

describe('Service', function () {
  const POINTERS = ['X1,Y1', 'X2,Y2']
  const auditInfo: LocalDeploymentAuditInfo = {
    authChain: Authenticator.createSimpleAuthChain('entityId', 'ethAddress', 'signature')
  }

  const initialAmountOfDeployments: number = 15

  const randomFile = Buffer.from('1234')
  let randomFileHash: ContentFileHash
  let entity: Entity
  let entityFile: Uint8Array
  // let service: ServiceImpl

  it('starts the variables', async () => {
    randomFileHash = await Hashing.calculateBufferHash(randomFile)
    ;[entity, entityFile] = await buildEntityAndFile(
      EntityType.SCENE,
      POINTERS,
      Date.now(),
      new Map([['file', randomFileHash]]),
      'metadata'
    )
  })

  it(`When no file matches the given entity id, then deployment fails`, async () => {
    const service = await buildService()
    const deploymentResult = await service.deployEntity(
      [randomFile],
      'not-actual-hash',
      auditInfo,
      DeploymentContext.LOCAL
    )
    if (isInvalidDeployment(deploymentResult)) {
      expect(deploymentResult.errors).toEqual([`Failed to find the entity file.`])
    } else {
      assert.fail('Expected the deployment to fail')
    }
  })

  it(`When an entity is successfully deployed, then the content is stored correctly`, async () => {
    const service = await buildService()

    jest.spyOn(service, 'getEntityById').mockResolvedValue(undefined)
    const storageSpy = jest.spyOn(service.components.storage, 'storeContent')
    jest.spyOn(service.components.deploymentManager, 'saveDeployment').mockImplementation(async (...args) => {
      console.dir([...args])
      return 123
    })
    jest.spyOn(service.components.deploymentManager, 'savePointerChanges').mockResolvedValue()
    jest.spyOn(service.components.deploymentManager, 'setEntitiesAsOverwritten').mockResolvedValue()

    const deploymentResult: DeploymentResult = await service.deployEntity(
      [entityFile, randomFile],
      entity.id,
      auditInfo,
      DeploymentContext.LOCAL
    )
    if (isInvalidDeployment(deploymentResult)) {
      assert.fail(
        'The deployment result: ' + deploymentResult + ' was expected to be successful, it was invalid instead.'
      )
    } else {
      const deltaMilliseconds = Date.now() - deploymentResult
      expect(deltaMilliseconds).toBeGreaterThanOrEqual(0)
      expect(deltaMilliseconds).toBeLessThanOrEqual(30)
      expect(storageSpy).toHaveBeenCalledWith(entity.id, entityFile)
      expect(storageSpy).toHaveBeenCalledWith(randomFileHash, randomFile)
    }
  })

  it(`When a file is already uploaded, then don't try to upload it again`, async () => {
    const service = await buildService()
    jest.spyOn(service, 'getEntityById').mockResolvedValue(undefined)

    // Consider the random file as already uploaded, but not the entity file
    jest
      .spyOn(service.components.storage, 'exist')
      .mockImplementation((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, id === randomFileHash]))))
    const storeSpy = jest.spyOn(service.components.storage, 'storeContent')
    jest.spyOn(service.components.deploymentManager, 'saveDeployment').mockImplementation(async (...args) => {
      console.dir([...args])
      return 123
    })
    jest.spyOn(service.components.deploymentManager, 'savePointerChanges').mockResolvedValue()
    jest.spyOn(service.components.deploymentManager, 'setEntitiesAsOverwritten').mockResolvedValue()

    await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, DeploymentContext.LOCAL)

    expect(storeSpy).toHaveBeenCalledWith(entity.id, entityFile)
    expect(storeSpy).not.toHaveBeenCalledWith(randomFileHash, randomFile)
  })

  it(`When the same pointer is asked twice, then the second time cached the result is returned`, async () => {
    const service = await buildService()
    const serviceSpy = jest.spyOn(deployments, 'getDeployments').mockImplementation(() =>
      Promise.resolve({
        deployments: [fakeDeployment()],
        filters: {},
        pagination: { offset: 0, limit: 0, moreData: true }
      })
    )

    // Call the first time
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)
    // When a pointer is asked the first time, then the database is reached
    expectSpyToBeCalled(serviceSpy, POINTERS)

    // Reset spy and call again
    serviceSpy.mockReset()
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)
    expect(serviceSpy).not.toHaveBeenCalled()
  })

  it(`Given a pointer with no deployment, when is asked twice, then the second time cached the result is returned`, async () => {
    const service = await buildService()
    const serviceSpy = jest.spyOn(deployments, 'getDeployments').mockImplementation(() =>
      Promise.resolve({
        deployments: [fakeDeployment()],
        filters: {},
        pagination: { offset: 0, limit: 0, moreData: true }
      })
    )

    // Call the first time
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)

    expectSpyToBeCalled(serviceSpy, POINTERS)

    // Reset spy and call again
    serviceSpy.mockReset()
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)
    expect(serviceSpy).not.toHaveBeenCalled()
  })

  // TODO [well-known-components]: evaluate if this test makes sense
  xit(`When a pointer is affected by a deployment, then it is invalidated from the cache`, async () => {
    const service = await buildService()
    jest.spyOn(service.components.pointerManager, 'referenceEntityFromPointers').mockImplementation(() =>
      Promise.resolve(
        new Map([
          [POINTERS[0], { before: undefined, after: DELTA_POINTER_RESULT.CLEARED }],
          [POINTERS[1], { before: undefined, after: DELTA_POINTER_RESULT.CLEARED }]
        ])
      )
    )
    const serviceSpy = jest.spyOn(deployments, 'getDeployments').mockImplementation(() =>
      Promise.resolve({
        deployments: [fakeDeployment()],
        filters: {},
        pagination: { offset: 0, limit: 0, moreData: true }
      })
    )
    jest.spyOn(service, 'getEntityById').mockResolvedValue({ entityId: entity.id, localTimestamp: entity.timestamp })

    // Call the first time
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)
    expectSpyToBeCalled(serviceSpy, POINTERS)

    // Make deployment that should invalidate the cache
    await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, DeploymentContext.LOCAL)

    // Reset spy and call again
    serviceSpy.mockReset()
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)
    expectSpyToBeCalled(serviceSpy, POINTERS)
  })

  // TODO [well-known-components]: evaluate if this test makes sense
  xit(`When a pointer has no entity after a deployment, then it is invalidated from the cache`, async () => {
    const service = await buildService()
    jest.spyOn(service.components.pointerManager, 'referenceEntityFromPointers').mockImplementation(() =>
      Promise.resolve(
        new Map([
          [POINTERS[0], { before: undefined, after: DELTA_POINTER_RESULT.SET }],
          [POINTERS[1], { before: undefined, after: DELTA_POINTER_RESULT.SET }]
        ])
      )
    )
    const serviceSpy = jest.spyOn(service, 'getDeployments').mockImplementation(() =>
      Promise.resolve({
        deployments: [fakeDeployment()],
        filters: {},
        pagination: { offset: 0, limit: 0, moreData: true }
      })
    )

    // Call the first time
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)
    expectSpyToBeCalled(serviceSpy, POINTERS)

    // Make deployment that should invalidate the cache
    const [deleterEntity, deleterEntityFile] = await buildEntityAndFile(
      EntityType.SCENE,
      POINTERS.slice(0, 1),
      Date.now(),
      new Map([['file', randomFileHash]]),
      'metadata'
    )
    await service.deployEntity([deleterEntityFile, randomFile], deleterEntity.id, auditInfo, DeploymentContext.LOCAL)

    // Reset spy and call again
    serviceSpy.mockReset()
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)
    expectSpyToBeCalled(serviceSpy, POINTERS)
  })

  async function buildService() {
    const repository = MockedRepository.build(new Map([[EntityType.SCENE, initialAmountOfDeployments]]))
    const env = new Environment()
    const validator = new NoOpValidator()
    const serverValidator = new NoOpServerValidator()
    const deploymentManager = new DeploymentManager()
    const failedDeploymentsCache = createFailedDeploymentsCache()
    const metrics = createTestMetricsComponent(metricsDeclaration)
    const logs = createLogComponent()
    const storage = new MockedStorage()
    const pointerManager = NoOpPointerManager.build()
    const authenticator = new ContentAuthenticator('', DECENTRALAND_ADDRESS)
    const database = await createDatabaseComponent({ logs, env })

    const deployedEntitiesFilter = createBloomFilterComponent({
      sizeInBytes: 512
    })

    return ServiceFactory.create({
      env,
      pointerManager,
      failedDeploymentsCache,
      deploymentManager,
      storage,
      repository,
      validator,
      serverValidator,
      metrics,
      logs,
      authenticator,
      database,
      deployedEntitiesFilter
    })
  }

  function expectSpyToBeCalled(serviceSpy: jest.SpyInstance, pointers: string[]) {
    expect(serviceSpy).toHaveBeenCalledWith(expect.anything(), {
      filters: { entityTypes: [EntityType.SCENE], pointers: pointers, onlyCurrentlyPointed: true }
    })
  }

  function fakeDeployment(): Deployment {
    return {
      entityVersion: EntityVersion.V3,
      entityType: EntityType.SCENE,
      entityId: '',
      entityTimestamp: 10,
      deployedBy: '',
      pointers: POINTERS,
      auditInfo: {
        ...auditInfo,
        version: EntityVersion.V3,
        localTimestamp: 10
      }
    }
  }
})
