import { createInMemoryStorage } from '@dcl/catalyst-storage'
import { Authenticator } from '@dcl/crypto'
import { EntityType, EthAddress } from '@dcl/schemas'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { HTTPProvider } from 'eth-connect'
import ms from 'ms'
import { Deployment } from '../../../src/deployment-types'
import { DEFAULT_ENTITIES_CACHE_SIZE, Environment, EnvironmentConfig } from '../../../src/Environment'
import * as deployments from '../../../src/logic/deployments'
import { metricsDeclaration } from '../../../src/metrics'
import { createActiveEntitiesComponent } from '../../../src/ports/activeEntities'
import { createClock } from '../../../src/ports/clock'
import { Denylist } from '../../../src/ports/denylist'
import { createDeployedEntitiesBloomFilter } from '../../../src/ports/deployedEntitiesBloomFilter'
import { createDeployRateLimiter } from '../../../src/ports/deployRateLimiterComponent'
import { createFailedDeployments } from '../../../src/ports/failedDeployments'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'
import { createSequentialTaskExecutor } from '../../../src/ports/sequecuentialTaskExecutor'
import { ContentAuthenticator } from '../../../src/service/auth/Authenticator'
import { EntityVersion } from '../../../src/types'
import { NoOpServerValidator, NoOpValidator } from '../../helpers/service/validations/NoOpValidator'
import { NoOpPointerManager } from '../service/pointers/NoOpPointerManager'

export const DECENTRALAND_ADDRESS: EthAddress = '0x1337e0507eb4ab47e08a179573ed4533d9e22a7b'

describe('activeEntities', () => {
  const fakeDeployment: Deployment = {
    entityVersion: EntityVersion.V3,
    entityType: EntityType.SCENE,
    entityId: 'someId',
    entityTimestamp: 10,
    deployedBy: '',
    pointers: ['apointer'],
    auditInfo: {
      authChain: Authenticator.createSimpleAuthChain('entityId', 'ethAddress', 'signature'),
      version: EntityVersion.V3,
      localTimestamp: 10
    }
  }

  /** Mock of deployments.getDeploymentsForActiveEntities*/
  const sut = vi
    .spyOn(deployments, 'getDeploymentsForActiveEntities')
    .mockImplementation(() => Promise.resolve([fakeDeployment]))

  afterAll(() => {
    vi.restoreAllMocks()
  })

  describe('withPointers should', () => {
    const pointersToUseByCases = {
      lowercase: ['apointer'],
      uppercase: ['APointer']
    }

    beforeEach(() => {
      sut.mockClear()
    })

    it(`return a cached result on second retrieval when the same pointer is asked twice using the same case`, async () => {
      const components = await buildComponents()
      sut.mockImplementation(() => Promise.resolve([{ ...fakeDeployment, pointers: pointersToUseByCases.lowercase }]))

      const firstResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.lowercase
      )
      expect(sut).toHaveBeenCalledWith(expect.anything(), undefined, pointersToUseByCases.lowercase)

      sut.mockClear()

      const secondResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.lowercase
      )
      expect(sut).not.toHaveBeenCalled()

      expect(firstResult).toMatchObject(secondResult)
    })

    it(`return a cached result on second retrieval when the same pointer is asked twice using the same case but the pointers retrieved are in different case`, async () => {
      const components = await buildComponents()
      sut.mockImplementation(() => Promise.resolve([{ ...fakeDeployment, pointers: pointersToUseByCases.uppercase }]))

      const firstResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.lowercase
      )
      expect(sut).toHaveBeenCalledWith(expect.anything(), undefined, pointersToUseByCases.lowercase)

      sut.mockClear()

      const secondResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.uppercase
      )
      expect(sut).not.toHaveBeenCalled()

      expect(firstResult).toMatchObject(secondResult)
    })

    it(`return a cached result on second retrieval when the same pointer is asked twice using different cases (1st lower, then upper)`, async () => {
      const components = await buildComponents()
      sut.mockImplementation(() => Promise.resolve([{ ...fakeDeployment, pointers: pointersToUseByCases.lowercase }]))

      const firstResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.lowercase
      )
      expect(sut).toHaveBeenCalledWith(expect.anything(), undefined, pointersToUseByCases.lowercase)

      sut.mockClear()

      const secondResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.uppercase
      )
      expect(sut).not.toHaveBeenCalled()

      expect(firstResult).toMatchObject(secondResult)
    })

    it(`return a cached result on second retrieval when the same pointer is asked twice using different cases (1st upper, then lower)`, async () => {
      const components = await buildComponents()
      sut.mockImplementation(() => Promise.resolve([{ ...fakeDeployment, pointers: pointersToUseByCases.lowercase }]))

      const firstResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.uppercase
      )
      expect(sut).toHaveBeenCalledWith(expect.anything(), undefined, pointersToUseByCases.uppercase)

      sut.mockClear()

      const secondResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.lowercase
      )
      expect(sut).not.toHaveBeenCalled()

      expect(firstResult).toMatchObject(secondResult)
    })

    it(`return a cached result after the first retrieval when the same pointer is asked three times using different cases`, async () => {
      const components = await buildComponents()
      sut.mockImplementation(() => Promise.resolve([{ ...fakeDeployment, pointers: pointersToUseByCases.lowercase }]))

      const firstResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.lowercase
      )
      expect(sut).toHaveBeenCalledWith(expect.anything(), undefined, pointersToUseByCases.lowercase)

      sut.mockClear()

      const secondResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.uppercase
      )
      expect(sut).not.toHaveBeenCalled()

      const thirdResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.uppercase
      )
      expect(sut).not.toHaveBeenCalled()

      expect(firstResult).toMatchObject(secondResult)
      expect(firstResult).toMatchObject(thirdResult)
    })

    it(`return a cached result after the first retrieval when the same pointer is asked three times using different cases inverted`, async () => {
      const components = await buildComponents()
      sut.mockImplementation(() => Promise.resolve([{ ...fakeDeployment, pointers: pointersToUseByCases.lowercase }]))

      const firstResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.uppercase
      )
      expect(sut).toHaveBeenCalledWith(expect.anything(), undefined, pointersToUseByCases.uppercase)

      sut.mockClear()

      const secondResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.lowercase
      )
      expect(sut).not.toHaveBeenCalled()

      const thirdResult = await components.activeEntities.withPointers(
        components.database,
        pointersToUseByCases.lowercase
      )
      expect(sut).not.toHaveBeenCalled()

      expect(firstResult).toMatchObject(secondResult)
      expect(firstResult).toMatchObject(thirdResult)
    })

    it(`return a cached result after the first retrieval when the same pointer is asked four times using different cases`, async () => {
      const components = await buildComponents()
      sut.mockImplementation(() => Promise.resolve([{ ...fakeDeployment, pointers: pointersToUseByCases.lowercase }]))

      // Call the first time
      await components.activeEntities.withPointers(components.database, pointersToUseByCases.lowercase)
      // When a pointer is asked the first time, then the database is reached
      expect(sut).toHaveBeenCalledWith(expect.anything(), undefined, pointersToUseByCases.lowercase)

      // Reset spy and call again
      sut.mockClear()
      await components.activeEntities.withPointers(components.database, pointersToUseByCases.uppercase)
      expect(sut).not.toHaveBeenCalled()

      await components.activeEntities.withPointers(components.database, pointersToUseByCases.uppercase)
      expect(sut).not.toHaveBeenCalled()

      await components.activeEntities.withPointers(components.database, pointersToUseByCases.lowercase)
      expect(sut).not.toHaveBeenCalled()
    })
  })

  describe('withIds should', () => {
    const idsToUseByCases = {
      lowercase: ['anid'],
      uppercase: ['AnId']
    }

    beforeEach(() => {
      sut.mockClear()
    })

    it(`treat entity id on cache keys as case sensitive, then result changes depending on the cases passed in the id`, async () => {
      const components = await buildComponents()
      sut.mockImplementation(() => Promise.resolve([{ ...fakeDeployment, entityId: idsToUseByCases.lowercase[0] }]))

      const firstResult = await components.activeEntities.withIds(components.database, idsToUseByCases.lowercase)
      expect(sut).toHaveBeenCalledWith(expect.anything(), idsToUseByCases.lowercase, undefined)

      sut.mockClear()

      const secondResult = await components.activeEntities.withIds(components.database, idsToUseByCases.lowercase)
      expect(sut).not.toHaveBeenCalled()

      expect(firstResult).toMatchObject(secondResult)
    })

    it(`return a cached result only when the id is equally considering case sensitive (1st lower, 2nd upper, 3rd lower)`, async () => {
      const components = await buildComponents()
      sut.mockImplementationOnce(() => Promise.resolve([{ ...fakeDeployment, entityId: idsToUseByCases.lowercase[0] }]))

      const firstResult = await components.activeEntities.withIds(components.database, idsToUseByCases.lowercase)
      expect(sut).toHaveBeenCalledWith(expect.anything(), idsToUseByCases.lowercase, undefined)

      sut.mockClear()
      sut.mockImplementationOnce(() =>
        Promise.resolve([
          { ...fakeDeployment, entityId: idsToUseByCases.uppercase[0], pointers: ['adifferentpointer'] }
        ])
      )

      const secondResult = await components.activeEntities.withIds(components.database, idsToUseByCases.uppercase)
      expect(sut).toHaveBeenCalledWith(expect.anything(), idsToUseByCases.uppercase, undefined)
      expect(secondResult).not.toMatchObject(firstResult)
      expect(secondResult[0].id).toEqual(idsToUseByCases.uppercase[0])

      sut.mockClear()

      const thirdResult = await components.activeEntities.withIds(components.database, idsToUseByCases.lowercase)
      expect(sut).not.toHaveBeenCalled()
      expect(firstResult).toMatchObject(thirdResult)
    })

    it(`return a cached result only when the id is equally considering case sensitive (1st lower, 2nd upper, 3rd lower, 4th upper)`, async () => {
      const components = await buildComponents()
      sut.mockImplementationOnce(() => Promise.resolve([{ ...fakeDeployment, entityId: idsToUseByCases.lowercase[0] }]))

      const firstResult = await components.activeEntities.withIds(components.database, idsToUseByCases.lowercase)
      expect(sut).toHaveBeenCalledWith(expect.anything(), idsToUseByCases.lowercase, undefined)

      sut.mockClear()
      sut.mockImplementationOnce(() =>
        Promise.resolve([
          { ...fakeDeployment, entityId: idsToUseByCases.uppercase[0], pointers: ['adifferentpointer'] }
        ])
      )

      const secondResult = await components.activeEntities.withIds(components.database, idsToUseByCases.uppercase)
      expect(sut).toHaveBeenCalledWith(expect.anything(), idsToUseByCases.uppercase, undefined)
      expect(secondResult).not.toMatchObject(firstResult)
      expect(secondResult[0].id).toEqual(idsToUseByCases.uppercase[0])

      sut.mockClear()

      const thirdResult = await components.activeEntities.withIds(components.database, idsToUseByCases.lowercase)
      expect(sut).not.toHaveBeenCalled()
      expect(firstResult).toMatchObject(thirdResult)

      const fourthResult = await components.activeEntities.withIds(components.database, idsToUseByCases.uppercase)
      expect(sut).not.toHaveBeenCalled()
      expect(secondResult).toMatchObject(fourthResult)
    })

    it(`return a cached result only when the id is equally considering case sensitive (1st lower, 2nd upper, 3rd lower, 4th lower)`, async () => {
      const components = await buildComponents()
      sut.mockImplementationOnce(() => Promise.resolve([{ ...fakeDeployment, entityId: idsToUseByCases.lowercase[0] }]))

      const firstResult = await components.activeEntities.withIds(components.database, idsToUseByCases.lowercase)
      expect(sut).toHaveBeenCalledWith(expect.anything(), idsToUseByCases.lowercase, undefined)

      sut.mockClear()
      sut.mockImplementationOnce(() =>
        Promise.resolve([
          { ...fakeDeployment, entityId: idsToUseByCases.uppercase[0], pointers: ['adifferentpointer'] }
        ])
      )

      const secondResult = await components.activeEntities.withIds(components.database, idsToUseByCases.uppercase)
      expect(sut).toHaveBeenCalledWith(expect.anything(), idsToUseByCases.uppercase, undefined)
      expect(secondResult).not.toMatchObject(firstResult)
      expect(secondResult[0].id).toEqual(idsToUseByCases.uppercase[0])

      sut.mockClear()

      const thirdResult = await components.activeEntities.withIds(components.database, idsToUseByCases.lowercase)
      expect(sut).not.toHaveBeenCalled()
      expect(firstResult).toMatchObject(thirdResult)

      const fourthResult = await components.activeEntities.withIds(components.database, idsToUseByCases.lowercase)
      expect(sut).not.toHaveBeenCalled()
      expect(firstResult).toMatchObject(fourthResult)
    })
  })
})

async function buildComponents() {
  const database = createTestDatabaseComponent()
  database.queryWithValues = () => Promise.resolve({ rows: [], rowCount: 0 })
  database.query = () => Promise.resolve({ rows: [], rowCount: 0 })
  database.transaction = () => Promise.resolve()
  const env = new Environment()
  env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'inexistent')
  env.setConfig(EnvironmentConfig.DENYLIST_FILE_NAME, 'file')
  const clock = createClock()
  const serverValidator = new NoOpServerValidator()
  const logs = await createLogComponent({
    config: createConfigComponent({
      LOG_LEVEL: 'DEBUG'
    })
  })
  const deployRateLimiter = createDeployRateLimiter(
    { logs },
    { defaultMax: 300, defaultTtl: ms('1m'), entitiesConfigMax: new Map(), entitiesConfigTtl: new Map() }
  )
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const failedDeployments = await createFailedDeployments({ metrics, database })
  const storage = createInMemoryStorage()
  const pointerManager = NoOpPointerManager.build()
  const authenticator = new ContentAuthenticator(
    new HTTPProvider('https://rpc.decentraland.org/mainnet?project=catalyst-ci'),
    DECENTRALAND_ADDRESS
  )
  const deployedEntitiesBloomFilter = createDeployedEntitiesBloomFilter({ database, logs, clock })
  env.setConfig(EnvironmentConfig.ENTITIES_CACHE_SIZE, DEFAULT_ENTITIES_CACHE_SIZE)
  const denylist: Denylist = { isDenylisted: () => false }
  const sequentialExecutor = createSequentialTaskExecutor({ logs, metrics })
  const activeEntities = createActiveEntitiesComponent({ database, logs, env, metrics, denylist, sequentialExecutor })

  return {
    env,
    pointerManager,
    failedDeployments,
    clock,
    deployRateLimiter,
    storage,
    validator: new NoOpValidator(),
    serverValidator,
    metrics,
    logs,
    authenticator,
    database,
    deployedEntitiesBloomFilter,
    activeEntities,
    denylist
  }
}
