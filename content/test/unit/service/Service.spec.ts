import { DECENTRALAND_ADDRESS } from '@dcl/catalyst-node-commons'
import { hashV1 } from '@dcl/hashing'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import assert from 'assert'
import { ContentFileHash, Deployment, Entity, EntityType, EntityVersion } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import ms from 'ms'
import { DEFAULT_ENTITIES_CACHE_SIZE, Environment, EnvironmentConfig } from '../../../src/Environment'
import * as pointers from '../../../src/logic/database-queries/pointers-queries'
import { metricsDeclaration } from '../../../src/metrics'
import { createActiveEntitiesComponent } from '../../../src/ports/activeEntities'
import { Denylist } from '../../../src/ports/denylist'
import { createDeploymentListComponent } from '../../../src/ports/deploymentListComponent'
import { createDeployRateLimiter } from '../../../src/ports/deployRateLimiterComponent'
import { createFailedDeploymentsCache } from '../../../src/ports/failedDeploymentsCache'
import { createFetchComponent } from '../../../src/ports/fetcher'
import { createFsComponent } from '../../../src/ports/fs'
import { createDatabaseComponent } from '../../../src/ports/postgres'
import { createSequentialTaskExecutor } from '../../../src/ports/sequecuentialTaskExecutor'
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
import { ServiceImpl } from '../../../src/service/ServiceImpl'
import { MockedRepository } from '../../helpers/repository/MockedRepository'
import { buildEntityAndFile } from '../../helpers/service/EntityTestFactory'
import { NoOpServerValidator, NoOpValidator } from '../../helpers/service/validations/NoOpValidator'
import { MockedStorage } from '../ports/contentStorage/MockedStorage'
import { NoOpPointerManager } from './pointers/NoOpPointerManager'

describe('Service', function() {
  const POINTERS = ['X1,Y1', 'X2,Y2']
  const auditInfo: LocalDeploymentAuditInfo = {
    authChain: Authenticator.createSimpleAuthChain('entityId', 'ethAddress', 'signature')
  }

  const initialAmountOfDeployments: number = 15

  const randomFile = Buffer.from('1234')
  let randomFileHash: ContentFileHash
  let entity: Entity
  let entityFile: Uint8Array

  // starts the variables
  beforeAll(async () => {
    randomFileHash = await hashV1(randomFile)
      ;[entity, entityFile] = await buildEntityAndFile(
        EntityType.SCENE,
        POINTERS,
        Date.now(),
        new Map([['file', randomFileHash]]),
        'metadata'
      )

    jest.spyOn(pointers, 'updateActiveDeployments').mockImplementation(() =>
      Promise.resolve()
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
    const storageSpy = jest.spyOn(service.components.storage, 'storeStream')
    jest.spyOn(service.components.deploymentManager, 'saveDeployment').mockImplementation(async (...args) => {
      console.dir([...args])
      return 123
    })
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
      expect(deltaMilliseconds).toBeLessThanOrEqual(1000)
      expect(storageSpy).toHaveBeenCalledWith(entity.id, expect.anything())
      expect(storageSpy).toHaveBeenCalledWith(randomFileHash, expect.anything())
    }
  })

  it(`When a file is already uploaded, then don't try to upload it again`, async () => {
    const service = await buildService()
    jest.spyOn(service, 'getEntityById').mockResolvedValue(undefined)

    // Consider the random file as already uploaded, but not the entity file
    jest
      .spyOn(service.components.storage, 'existMultiple')
      .mockImplementation((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, id === randomFileHash]))))
    const storeSpy = jest.spyOn(service.components.storage, 'storeStream')
    jest.spyOn(service.components.deploymentManager, 'saveDeployment').mockImplementation(async (...args) => {
      console.dir([...args])
      return 123
    })
    jest.spyOn(service.components.deploymentManager, 'setEntitiesAsOverwritten').mockResolvedValue()

    await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, DeploymentContext.LOCAL)

    expect(storeSpy).toHaveBeenCalledWith(entity.id, expect.anything())
    expect(storeSpy).not.toHaveBeenCalledWith(randomFileHash, expect.anything())
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
    await service.components.activeEntities.withPointers(POINTERS)
    // When a pointer is asked the first time, then the database is reached
    expectSpyToBeCalled(serviceSpy, { pointers: POINTERS })

    // Reset spy and call again
    serviceSpy.mockReset()
    await service.components.activeEntities.withPointers(POINTERS)
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
    await service.components.activeEntities.withPointers(POINTERS)

    expectSpyToBeCalled(serviceSpy, { pointers: POINTERS })

    // Reset spy and call again
    serviceSpy.mockReset()
    await service.components.activeEntities.withPointers(POINTERS)
    expect(serviceSpy).not.toHaveBeenCalled()
  })

  it(`When a pointer is affected by a deployment, then it is updated in the cache`, async () => {
    const service = await buildService()
    jest.spyOn(service.components.pointerManager, 'referenceEntityFromPointers').mockImplementation(() =>
      Promise.resolve(
        new Map([
          [POINTERS[0], { before: undefined, after: DELTA_POINTER_RESULT.SET }],
          [POINTERS[1], { before: undefined, after: DELTA_POINTER_RESULT.SET }]
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

    jest.spyOn(service.components.deploymentManager, 'saveDeployment').mockImplementation(() => Promise.resolve(1))
    jest
      .spyOn(service.components.deploymentManager, 'setEntitiesAsOverwritten')
      .mockImplementation(() => Promise.resolve())

    // Call the first time
    await service.components.activeEntities.withPointers(POINTERS)
    expectSpyToBeCalled(serviceSpy, { pointers: POINTERS })

    // Make deployment that should update the cache
    await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, DeploymentContext.LOCAL)

    // Reset spy and call again
    serviceSpy.mockReset()
    jest.spyOn(deployments, 'getDeployments').mockImplementation(() =>
      Promise.resolve({
        deployments: [fakeDeployment()],
        filters: {},
        pagination: { offset: 0, limit: 0, moreData: true }
      })
    )
    await service.components.activeEntities.withPointers(POINTERS)
    expectSpyToBeCalled(serviceSpy, { ids: ['QmSQc2mGpzanz1DDtTf2ZCFnwTpJvAbcwzsS4An5PXaTqg'] })
  })

  async function buildService() {
    const repository = MockedRepository.build(new Map([[EntityType.SCENE, initialAmountOfDeployments]]))
    const env = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'inexistent')
    env.setConfig(EnvironmentConfig.DENYLIST_FILE_NAME, 'file')

    const validator = new NoOpValidator()
    const serverValidator = new NoOpServerValidator()
    const deploymentManager = new DeploymentManager()
    const failedDeploymentsCache = createFailedDeploymentsCache()
    const logs = createLogComponent()
    const deployRateLimiter = createDeployRateLimiter(
      { logs },
      { defaultMax: 300, defaultTtl: ms('1m'), entitiesConfigMax: new Map(), entitiesConfigTtl: new Map() }
    )
    const metrics = createTestMetricsComponent(metricsDeclaration)
    const storage = new MockedStorage()
    const pointerManager = NoOpPointerManager.build()
    const authenticator = new ContentAuthenticator('', DECENTRALAND_ADDRESS)
    const database = await createDatabaseComponent({ logs, env, metrics })
    const deployedEntitiesFilter = createDeploymentListComponent({ database, logs })
    env.setConfig(EnvironmentConfig.ENTITIES_CACHE_SIZE, DEFAULT_ENTITIES_CACHE_SIZE)
    const fs = createFsComponent()
    const fetcher = createFetchComponent()
    const denylist: Denylist = { isDenylisted: () => false }
    const sequentialExecutor = createSequentialTaskExecutor({ logs, metrics })
    const activeEntities = createActiveEntitiesComponent({ database, logs, env, metrics, denylist, sequentialExecutor })

    return new ServiceImpl({
      env,
      pointerManager,
      failedDeploymentsCache,
      deployRateLimiter,
      deploymentManager,
      storage,
      repository,
      validator,
      serverValidator,
      metrics,
      logs,
      authenticator,
      database,
      deployedEntitiesFilter,
      activeEntities,
      denylist
    })
  }

  function expectSpyToBeCalled(
    serviceSpy: jest.SpyInstance,
    { pointers, ids }: { pointers?: string[]; ids?: string[] }
  ) {
    let filters = pointers ? { pointers } : { entiyIds: ids }
    if (pointers)
      expect(serviceSpy).toHaveBeenCalledWith(expect.anything(), {
        filters: { ...filters, onlyCurrentlyPointed: true }
      })
  }

  function fakeDeployment(): Deployment {
    return {
      entityVersion: EntityVersion.V3,
      entityType: EntityType.SCENE,
      entityId: 'someId',
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
