import { createInMemoryStorage } from '@dcl/catalyst-storage'
import { Authenticator } from '@dcl/crypto'
import { hashV1 } from '@dcl/hashing'
import { Entity, EntityType, EthAddress } from '@dcl/schemas'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import assert from 'assert'
import { HTTPProvider } from 'eth-connect'

import { isEntityContentUnchanged } from '../../../src/ports/deployer'
import { DEFAULT_ENTITIES_CACHE_SIZE, Environment, EnvironmentConfig } from '../../../src/Environment'
import {
  Deployment,
  DeploymentContext,
  DeploymentResult,
  LocalDeploymentAuditInfo,
  isInvalidDeployment
} from '../../../src/deployment-types'
import * as deploymentQueries from '../../../src/logic/database-queries/deployments-queries'
import * as failedDeploymentQueries from '../../../src/logic/database-queries/failed-deployments-queries'
import * as pointers from '../../../src/logic/database-queries/pointers-queries'
import * as deploymentLogic from '../../../src/logic/deployments'
import * as deployments from '../../../src/logic/deployments'
import { metricsDeclaration } from '../../../src/metrics'
import { createActiveEntitiesComponent } from '../../../src/ports/activeEntities'
import { Denylist } from '../../../src/ports/denylist'
import { createNoOpDeployRateLimiter } from '../../mocks/deploy-rate-limiter-mock'
import { createDeployedEntitiesBloomFilter } from '../../../src/ports/deployedEntitiesBloomFilter'
import { createDeployer } from '../../../src/ports/deployer'
import { createFailedDeployments } from '../../../src/ports/failedDeployments'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'
import { createSequentialTaskExecutor } from '../../../src/ports/sequecuentialTaskExecutor'
import { ContentAuthenticator } from '../../../src/service/auth/Authenticator'
import { DELTA_POINTER_RESULT } from '../../../src/service/pointers/PointerManager'
import { EntityVersion } from '../../../src/types'
import { buildEntityAndFile } from '../../helpers/entity-tests-helper'
import { NoOpServerValidator, NoOpValidator } from '../../helpers/service/validations/NoOpValidator'
import { NoOpPointerManager } from '../service/pointers/NoOpPointerManager'
import { createDeploymentsComponentMock } from '../../mocks/deployments-component-mock'

export const DECENTRALAND_ADDRESS: EthAddress = '0x1337e0507eb4ab47e08a179573ed4533d9e22a7b'

describe('Deployer', function () {
  const POINTERS = ['X1,Y1', 'X2,Y2']
  const auditInfo: LocalDeploymentAuditInfo = {
    authChain: Authenticator.createSimpleAuthChain('entityId', 'ethAddress', 'signature')
  }

  const randomFile = Buffer.from('1234')
  let randomFileHash: string
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
      { metadata: 'metadata' }
    )

    jest.spyOn(pointers, 'updateActiveDeployments').mockImplementation(() => Promise.resolve())
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  it(`When no file matches the given entity id, then deployment fails`, async () => {
    jest.spyOn(failedDeploymentQueries, 'getSnapshotFailedDeployments').mockResolvedValue([])
    jest.spyOn(failedDeploymentQueries, 'deleteFailedDeployment').mockResolvedValue()
    const service = await buildDeployer()
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
    jest.spyOn(failedDeploymentQueries, 'getSnapshotFailedDeployments').mockResolvedValue([])
    jest.spyOn(failedDeploymentQueries, 'deleteFailedDeployment').mockResolvedValue()
    jest.spyOn(deploymentLogic, 'calculateOverwrites').mockResolvedValue({ overwrote: new Set(), overwrittenBy: null })
    jest.spyOn(deploymentLogic, 'saveDeploymentAndContentFiles').mockResolvedValue(1)
    jest.spyOn(deploymentQueries, 'setEntitiesAsOverwritten').mockResolvedValue()
    const service = await buildDeployer()
    const storageSpy = jest.spyOn(service.components.storage, 'storeStream')

    const deploymentResult: DeploymentResult = await service.deployEntity(
      [entityFile, randomFile],
      entity.id,
      auditInfo,
      DeploymentContext.LOCAL
    )
    if (isInvalidDeployment(deploymentResult)) {
      assert.fail(
        'The deployment result: ' +
          JSON.stringify(deploymentResult) +
          ' was expected to be successful, it was invalid instead.'
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
    const service = await buildDeployer()
    jest.spyOn(deploymentQueries, 'getEntityById').mockResolvedValue(undefined)

    // Consider the random file as already uploaded, but not the entity file
    jest
      .spyOn(service.components.storage, 'existMultiple')
      .mockImplementation((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, id === randomFileHash]))))
    const storeSpy = jest.spyOn(service.components.storage, 'storeStream')
    jest.spyOn(deploymentLogic, 'saveDeploymentAndContentFiles').mockImplementation(async (...args) => {
      console.dir([...args])
      return 123
    })
    jest.spyOn(deploymentQueries, 'setEntitiesAsOverwritten').mockResolvedValue()

    await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, DeploymentContext.LOCAL)

    expect(storeSpy).toHaveBeenCalledWith(entity.id, expect.anything())
    expect(storeSpy).not.toHaveBeenCalledWith(randomFileHash, expect.anything())
  })

  it(`Given a pointer with no deployment, when is asked twice, then the second time cached the result is returned`, async () => {
    const service = await buildDeployer()
    const serviceSpy = jest
      .spyOn(deployments, 'getDeploymentsForActiveEntities')
      .mockImplementation(() => Promise.resolve([fakeDeployment()]))

    // Call the first time
    await service.components.activeEntities.withPointers(service.components.database, POINTERS)

    expect(serviceSpy).toHaveBeenCalledWith(expect.anything(), undefined, POINTERS)

    // Reset spy and call again
    serviceSpy.mockClear()
    await service.components.activeEntities.withPointers(service.components.database, POINTERS)
    expect(serviceSpy).not.toHaveBeenCalled()
  })

  it(`When a pointer is affected by a deployment, then it is updated in the cache`, async () => {
    const service = await buildDeployer()
    jest.spyOn(service.components.pointerManager, 'referenceEntityFromPointers').mockImplementation(() =>
      Promise.resolve(
        new Map([
          [POINTERS[0], { before: undefined, after: DELTA_POINTER_RESULT.SET }],
          [POINTERS[1], { before: undefined, after: DELTA_POINTER_RESULT.SET }]
        ])
      )
    )

    let serviceSpy = jest
      .spyOn(deployments, 'getDeploymentsForActiveEntities')
      .mockImplementation(() => Promise.resolve([fakeDeployment()]))

    jest.spyOn(deploymentLogic, 'saveDeploymentAndContentFiles').mockImplementation(() => Promise.resolve(1))
    jest.spyOn(deploymentQueries, 'setEntitiesAsOverwritten').mockImplementation(() => Promise.resolve())

    // Call the first time
    await service.components.activeEntities.withPointers(service.components.database, POINTERS)
    expect(serviceSpy).toHaveBeenCalledWith(expect.anything(), undefined, POINTERS)

    // Make deployment that should update the cache
    await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, DeploymentContext.LOCAL)

    // Reset spy and call again
    serviceSpy.mockClear()

    serviceSpy = jest
      .spyOn(deployments, 'getDeploymentsForActiveEntities')
      .mockImplementation(() => Promise.resolve([fakeDeployment('QmSQc2mGpzanz1DDtTf2ZCFnwTpJvAbcwzsS4An5PXaTqg')]))
    await service.components.activeEntities.withPointers(service.components.database, POINTERS)

    // expect(serviceSpy).toHaveBeenCalledWith(expect.anything(), ['QmSQc2mGpzanz1DDtTf2ZCFnwTpJvAbcwzsS4An5PXaTqg'], undefined)
  })

  async function buildDeployer() {
    const clock = { now: Date.now }
    const database = createTestDatabaseComponent()
    database.query = () => Promise.resolve({ rows: [], rowCount: 0, notices: [] } as any)
    database.withAsyncContextTransaction = (fn: () => Promise<any>) => fn()
    const env = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'inexistent')
    env.setConfig(EnvironmentConfig.DENYLIST_FILE_NAME, 'file')

    const serverValidator = new NoOpServerValidator()
    const logs = await createLogComponent({
      config: createConfigComponent({
        LOG_LEVEL: 'DEBUG'
      })
    })
    const deployRateLimiter = createNoOpDeployRateLimiter()
    const metrics = createTestMetricsComponent(metricsDeclaration)
    const failedDeployments = await createFailedDeployments({ metrics, database })
    const storage = createInMemoryStorage()
    const pointerManager = NoOpPointerManager.build()
    const authenticator = new ContentAuthenticator(
      new HTTPProvider('https://rpc.decentraland.org/mainnet?project=catalyst-ci'),
      [DECENTRALAND_ADDRESS]
    )
    const deployedEntitiesBloomFilter = createDeployedEntitiesBloomFilter({ database, logs, clock })
    env.setConfig(EnvironmentConfig.ENTITIES_CACHE_SIZE, DEFAULT_ENTITIES_CACHE_SIZE)
    const denylist: Denylist = { isDenylisted: () => false }
    const sequentialExecutor = createSequentialTaskExecutor({ logs, metrics })
    const deployments = createDeploymentsComponentMock()
    const activeEntities = createActiveEntitiesComponent({
      database,
      logs,
      env,
      metrics,
      denylist,
      sequentialExecutor,
      deployments
    })
    await failedDeployments.start()
    const deployerComponents = {
      env,
      pointerManager,
      failedDeployments,
      deployRateLimiter,
      storage,
      validator: new NoOpValidator(),
      serverValidator,
      metrics,
      logs,
      authenticator,
      database,
      deployedEntitiesBloomFilter: deployedEntitiesBloomFilter,
      activeEntities,
      denylist,
      clock
    }
    const deployer = createDeployer(deployerComponents)
    return {
      ...deployer,
      components: deployerComponents
    }
  }
  describe('isEntityContentUnchanged', () => {
    function entityWith(metadata: any): Entity {
      return {
        id: 'id',
        type: EntityType.PROFILE,
        pointers: ['0x1234'],
        timestamp: Date.now(),
        version: 'v3',
        content: [],
        metadata
      }
    }

    it('should return true for identical metadata', () => {
      const a = entityWith({ avatars: [{ name: 'test' }] })
      const b = entityWith({ avatars: [{ name: 'test' }] })
      expect(isEntityContentUnchanged(a, b)).toBe(true)
    })

    it('should return true when metadata keys are in different order', () => {
      const a = entityWith({ name: 'test', color: 'red', size: 10 })
      const b = entityWith({ size: 10, name: 'test', color: 'red' })
      expect(isEntityContentUnchanged(a, b)).toBe(true)
    })

    it('should return false when metadata values differ', () => {
      const a = entityWith({ avatars: [{ name: 'test' }] })
      const b = entityWith({ avatars: [{ name: 'changed' }] })
      expect(isEntityContentUnchanged(a, b)).toBe(false)
    })

    it('should return false when metadata has extra keys', () => {
      const a = entityWith({ name: 'test' })
      const b = entityWith({ name: 'test', extra: true })
      expect(isEntityContentUnchanged(a, b)).toBe(false)
    })

    it('should ignore top-level entity fields (id, timestamp, pointers)', () => {
      const a = entityWith({ avatars: [] })
      const b = entityWith({ avatars: [] })
      b.id = 'different-id'
      b.timestamp = a.timestamp + 1000
      b.pointers = ['0x5678']
      expect(isEntityContentUnchanged(a, b)).toBe(true)
    })
  })

  function fakeDeployment(entityId?: string): Deployment {
    return {
      entityVersion: EntityVersion.V3,
      entityType: EntityType.SCENE,
      entityId: entityId || 'someId',
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
