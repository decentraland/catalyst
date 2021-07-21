import { Bean, Environment } from '@katalyst/content/Environment'
import { ContentAuthenticator } from '@katalyst/content/service/auth/Authenticator'
import { CacheManager } from '@katalyst/content/service/caching/CacheManager'
import { Deployment } from '@katalyst/content/service/deployments/DeploymentManager'
import { Entity } from '@katalyst/content/service/Entity'
import { DELTA_POINTER_RESULT, PointerManager } from '@katalyst/content/service/pointers/PointerManager'
import {
  DeploymentResult,
  isInvalidDeployment,
  LocalDeploymentAuditInfo,
  MetaverseContentService
} from '@katalyst/content/service/Service'
import { ServiceFactory } from '@katalyst/content/service/ServiceFactory'
import { ContentStorage } from '@katalyst/content/storage/ContentStorage'
import { MockedRepository } from '@katalyst/test-helpers/repository/MockedRepository'
import { MockedAccessChecker } from '@katalyst/test-helpers/service/access/MockedAccessChecker'
import { buildEntityAndFile } from '@katalyst/test-helpers/service/EntityTestFactory'
import { MockedContentCluster } from '@katalyst/test-helpers/service/synchronization/MockedContentCluster'
import { NoOpValidations } from '@katalyst/test-helpers/service/validations/NoOpValidations'
import assert from 'assert'
import { ContentFileHash, EntityType, EntityVersion, Hashing } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import { mock } from 'ts-mockito'
import { MockedStorage } from '../storage/MockedStorage'
import { NoOpDeploymentManager } from './deployments/NoOpDeploymentManager'
import { NoOpFailedDeploymentsManager } from './errors/NoOpFailedDeploymentsManager'
import { NoOpPointerManager } from './pointers/NoOpPointerManager'

describe('Service', function () {
  const POINTERS = ['X1,Y1', 'X2,Y2']
  const auditInfo: LocalDeploymentAuditInfo = {
    authChain: Authenticator.createSimpleAuthChain('entityId', 'ethAddress', 'signature'),
    version: EntityVersion.V3
  }

  const initialAmountOfDeployments: number = 15

  let randomFile: Buffer
  let randomFileHash: ContentFileHash
  let entity: Entity
  let entityFile: Buffer
  let storage: ContentStorage
  let service: MetaverseContentService
  let pointerManager: PointerManager

  beforeAll(async () => {
    randomFile = Buffer.from('1234')
    randomFileHash = await Hashing.calculateBufferHash(randomFile)
    ;[entity, entityFile] = await buildEntityAndFile(
      EntityType.SCENE,
      POINTERS,
      Date.now(),
      new Map([['file', randomFileHash]]),
      'metadata'
    )
  })

  beforeEach(async () => {
    storage = new MockedStorage()
    pointerManager = NoOpPointerManager.build()
    service = await buildService()
  })

  it(`When no file matches the given entity id, then deployment fails`, async () => {
    const deploymentResult = await service.deployEntity([randomFile], 'not-actual-hash', auditInfo)
    if (isInvalidDeployment(deploymentResult)) {
      expect(deploymentResult.errors).toEqual([`Failed to find the entity file.`])
    } else {
      assert.fail('Expected the deployment to fail')
    }
  })

  it(`When an entity is successfully deployed, then the content is stored correctly`, async () => {
    const storageSpy = spyOn(storage, 'store').and.callThrough()

    const deploymentResult: DeploymentResult = await service.deployEntity(
      [entityFile, randomFile],
      entity.id,
      auditInfo
    )
    if (isInvalidDeployment(deploymentResult)) {
      assert.fail(
        'The deployment result: ' + deploymentResult + ' was expected to be successful, it was invalid instead.'
      )
    } else {
      const deltaMilliseconds = Date.now() - deploymentResult
      expect(deltaMilliseconds).toBeGreaterThanOrEqual(0)
      expect(deltaMilliseconds).toBeLessThanOrEqual(10)
      expect(storageSpy).toHaveBeenCalledWith(entity.id, entityFile)
      expect(storageSpy).toHaveBeenCalledWith(randomFileHash, randomFile)
    }
  })

  it(`When a file is already uploaded, then don't try to upload it again`, async () => {
    // Consider the random file as already uploaded, but not the entity file
    spyOn(storage, 'exist').and.callFake((ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, id === randomFileHash])))
    )
    const storeSpy = spyOn(storage, 'store')

    await service.deployEntity([entityFile, randomFile], entity.id, auditInfo)

    expect(storeSpy).toHaveBeenCalledWith(entity.id, entityFile)
    expect(storeSpy).not.toHaveBeenCalledWith(randomFileHash, randomFile)
  })

  it(`When the service is started, then the amount of deployments is obtained from the repository`, async () => {
    await service.start()

    const status = service.getStatus()

    expect(status.historySize).toBe(initialAmountOfDeployments)
  })

  it(`When a new deployment is made, then the amount of deployments is increased`, async () => {
    await service.start()
    await service.deployEntity([entityFile, randomFile], entity.id, auditInfo)

    const status = service.getStatus()

    expect(status.historySize).toBe(initialAmountOfDeployments + 1)
  })

  it(`When a new deployment is made and fails, then the amount of deployments is not modified`, async () => {
    await service.start()
    try {
      await service.deployEntity([randomFile], randomFileHash, auditInfo)
    } catch {}

    const status = service.getStatus()

    expect(status.historySize).toBe(initialAmountOfDeployments)
  })

  it(`When the same pointer is asked twice, then the second time cached the result is returned`, async () => {
    const serviceSpy = spyOn(service, 'getDeployments').and.callFake(() =>
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
    serviceSpy.calls.reset()
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)
    expect(serviceSpy).not.toHaveBeenCalled()
  })

  it(`When a pointer is affected by a deployment, then it is invalidated from the cache`, async () => {
    spyOn(pointerManager, 'referenceEntityFromPointers').and.callFake(() =>
      Promise.resolve(
        new Map([
          [POINTERS[0], { before: undefined, after: DELTA_POINTER_RESULT.CLEARED }],
          [POINTERS[1], { before: undefined, after: DELTA_POINTER_RESULT.CLEARED }]
        ])
      )
    )
    const serviceSpy = spyOn(service, 'getDeployments').and.callFake(() =>
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
    await service.deployEntity([entityFile, randomFile], entity.id, auditInfo)

    // Reset spy and call again
    serviceSpy.calls.reset()
    await service.getEntitiesByPointers(EntityType.SCENE, POINTERS)
    expectSpyToBeCalled(serviceSpy, POINTERS)
  })

  async function buildService() {
    const env = new Environment()
      .registerBean(Bean.STORAGE, storage)
      .registerBean(Bean.ACCESS_CHECKER, new MockedAccessChecker())
      .registerBean(Bean.AUTHENTICATOR, mock<ContentAuthenticator>())
      .registerBean(Bean.VALIDATIONS, new NoOpValidations())
      .registerBean(Bean.CONTENT_CLUSTER, MockedContentCluster.withoutIdentity())
      .registerBean(Bean.FAILED_DEPLOYMENTS_MANAGER, NoOpFailedDeploymentsManager.build())
      .registerBean(Bean.POINTER_MANAGER, pointerManager)
      .registerBean(Bean.DEPLOYMENT_MANAGER, NoOpDeploymentManager.build())
      .registerBean(Bean.REPOSITORY, MockedRepository.build(new Map([[EntityType.SCENE, initialAmountOfDeployments]])))
      .registerBean(Bean.CACHE_MANAGER, new CacheManager())
    return ServiceFactory.create(env)
  }

  function expectSpyToBeCalled(serviceSpy: jasmine.Spy, pointers: string[]) {
    expect(serviceSpy).toHaveBeenCalledWith(
      {
        filters: { entityTypes: [EntityType.SCENE], pointers: pointers, onlyCurrentlyPointed: true }
      },
      undefined
    )
  }

  function fakeDeployment(): Deployment {
    return {
      entityType: EntityType.SCENE,
      entityId: '',
      entityTimestamp: 10,
      deployedBy: '',
      pointers: POINTERS,
      auditInfo: {
        ...auditInfo,
        localTimestamp: 10
      }
    }
  }
})
