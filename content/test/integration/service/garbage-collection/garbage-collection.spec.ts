import { EntityType } from '@dcl/schemas'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import assert from 'assert'
import ms from 'ms'
import SQL from 'sql-template-strings'
import { EnvironmentBuilder, EnvironmentConfig } from '../../../../src/Environment'
import { stopAllComponents } from '../../../../src/logic/components-lifecycle'
import { AppComponents, PROFILE_DURATION } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment } from '../../E2ETestEnvironment'
import {
  awaitUntil,
  buildDeployData,
  buildDeployDataAfterEntity,
  deployEntitiesCombo,
  EntityCombo
} from '../../E2ETestUtils'

describe('Integration - Garbage Collection', () => {
  const getTestEnv = setupTestEnvironment({
    [EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL]: ms('2s'),
    [EnvironmentConfig.GARBAGE_COLLECTION]: 'true'
  })

  const P1 = 'X1,Y1',
    P2 = 'X2,Y2'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo
  let onlyE1Content: string
  let sharedContent: string

  let components: AppComponents

  beforeEach(async () => {
    const baseEnv = await getTestEnv().getEnvForNewDatabase()
    components = await new EnvironmentBuilder(baseEnv)
      .withConfig(EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL, ms('2s'))
      .withConfig(EnvironmentConfig.GARBAGE_COLLECTION, 'true')
      .buildConfigAndComponents()
    makeNoopValidator(components)
    makeNoopServerValidator(components)
  })

  afterEach(async () => {
    await stopAllComponents(components)
  })

  describe('Unused hashes', () => {
    beforeAll(async () => {
      E1 = await buildDeployData([P1], {
        contentPaths: [
          'test/integration/resources/some-binary-file.png',
          'test/integration/resources/some-text-file.txt'
        ],
        metadata: { a: 'metadata' }
      })
      E2 = await buildDeployDataAfterEntity(E1, [P1], {
        contentPaths: ['test/integration/resources/some-binary-file.png'],
        metadata: { a: 'metadata' }
      })
      E3 = await buildDeployDataAfterEntity(E2, [P2])
      ;[sharedContent, onlyE1Content] = E1.entity.content?.map(({ hash }) => hash) ?? []
    })

    it(`When garbage collection is on, then unused content is deleted`, async () => {
      // Start garbage collection
      await components.garbageCollectionManager.start()

      // Deploy E1
      await deployEntitiesCombo(components.deployer, E1)

      // Assert all content is available
      await assertContentIsAvailable(components, sharedContent, onlyE1Content)

      // Deploy E2
      await deployEntitiesCombo(components.deployer, E2)

      // Assert only the shared content is still available
      await awaitUntil(() => assertReportedAsDeletedAre(onlyE1Content))
      await assertContentIsAvailable(components, sharedContent)
    })

    it(`When garbage collection is off, then unused content isn't deleted`, async () => {
      // Deploy E1
      await deployEntitiesCombo(components.deployer, E1)

      // Assert all content is available
      await assertContentIsAvailable(components, sharedContent, onlyE1Content)

      // Deploy E2
      await deployEntitiesCombo(components.deployer, E2)

      // Wait a little
      await sleep(ms('4s'))

      // Assert all content is still available
      await assertContentIsAvailable(components, sharedContent, onlyE1Content)
      assert.deepEqual(components.garbageCollectionManager.getLastSweepResults()?.gcUnusedHashResult, undefined)
    })

    it(`When garbage collection is started after deployments, then unused content is still deleted`, async () => {
      // Deploy E1 and E2
      await deployEntitiesCombo(components.deployer, E1, E2)

      // Start garbage collection
      await components.garbageCollectionManager.start()

      // Assert only the shared content is still available
      await awaitUntil(() => assertReportedAsDeletedAre(onlyE1Content))
      await assertContentIsAvailable(components, sharedContent)
    })

    it(`When entity is not overwritten, then it is not garbage collected`, async () => {
      // Deploy E1 and E3
      await deployEntitiesCombo(components.deployer, E1, E3)

      // Start garbage collection
      await components.garbageCollectionManager.start()

      // Wait a little
      await sleep(ms('4s'))

      // Assert nothing was deleted
      await assertReportedAsDeletedAre()
      await assertContentIsAvailable(components, sharedContent, onlyE1Content)
    })

    function assertReportedAsDeletedAre(...fileHashes: string[]) {
      assert.deepEqual(
        components.garbageCollectionManager.getLastSweepResults()?.gcUnusedHashResult,
        new Set(fileHashes)
      )
      return Promise.resolve()
    }
  })

  describe('Old profiles', () => {
    it('No matter GC status, it should collect old profiles active entities', async () => {
      const timestamp = Date.now() - PROFILE_DURATION * 2
      const p1 = await buildDeployData(['0x000000000'], {
        type: EntityType.PROFILE,
        contentPaths: [
          'test/integration/resources/some-binary-file.png',
          'test/integration/resources/some-text-file.txt'
        ],
        timestamp,
        metadata: {}
      })

      const p2 = await buildDeployData(['0x000000001'], {
        type: EntityType.PROFILE,
        contentPaths: [
          'test/integration/resources/some-binary-file.png',
          'test/integration/resources/some-text-file.txt'
        ],
        timestamp: Date.now(),
        metadata: {}
      })

      await deployEntitiesCombo(components.deployer, p1)
      await deployEntitiesCombo(components.deployer, p2)

      // Start garbage collection
      await components.garbageCollectionManager.start()

      const results = components.garbageCollectionManager.getLastSweepResults()
      expect(results).toBeTruthy()
      expect(results?.gcProfileActiveEntitiesResult).toContain(p1.entity.pointers[0])
      expect(results?.gcProfileActiveEntitiesResult).not.toContain(p2.entity.pointers[0])
    })

    async function findDeploymentId(entityId: string): Promise<number> {
      const result = await components.database.queryWithValues<{ id: number }>(
        SQL`SELECT id FROM deployments WHERE entity_id = ${entityId}`,
        'find_deployment_id'
      )
      return result.rows[0].id
    }

    it('removing stale profile should remove deployment and files', async () => {
      const timestamp = Date.now() - PROFILE_DURATION * 2
      const p1 = await buildDeployData(['0x000000000'], {
        type: EntityType.PROFILE,
        contentPaths: [
          'test/integration/resources/some-binary-file.png',
          'test/integration/resources/some-text-file.txt'
        ],
        timestamp,
        metadata: {}
      })

      const p2 = await buildDeployData(['0x000000001'], {
        type: EntityType.PROFILE,
        timestamp: Date.now(),
        metadata: {}
      })

      await deployEntitiesCombo(components.deployer, p1)
      const p1DeploymentId = await findDeploymentId(p1.entity.id)
      await deployEntitiesCombo(components.deployer, p2)

      // Start garbage collection
      await components.garbageCollectionManager.start()

      const results = components.garbageCollectionManager.getLastSweepResults()
      expect(results?.gcProfileActiveEntitiesResult).toContain(p1.entity.pointers[0])
      expect(results?.gcProfileActiveEntitiesResult).not.toContain(p2.entity.pointers[0])
      expect(results?.gcStaleProfilesResult?.hashesDeleted.size).toEqual(2)
      expect(results?.gcStaleProfilesResult?.deploymentsDeleted).toContain(p1DeploymentId)
    })

    it('if an older and newer profile share files, the files should not be deleted', async () => {
      const timestamp = Date.now() - PROFILE_DURATION * 2
      const p1 = await buildDeployData(['0x000000000'], {
        type: EntityType.PROFILE,
        contentPaths: [
          'test/integration/resources/some-binary-file.png',
          'test/integration/resources/some-text-file.txt'
        ],
        timestamp,
        metadata: {}
      })

      const p2 = await buildDeployData(['0x000000001'], {
        type: EntityType.PROFILE,
        contentPaths: [
          'test/integration/resources/some-binary-file.png',
          'test/integration/resources/some-text-file.txt'
        ],
        timestamp: Date.now(),
        metadata: {}
      })

      await deployEntitiesCombo(components.deployer, p1)
      const p1DeploymentId = await findDeploymentId(p1.entity.id)
      await deployEntitiesCombo(components.deployer, p2)

      // Start garbage collection
      await components.garbageCollectionManager.start()

      const results = components.garbageCollectionManager.getLastSweepResults()
      expect(results?.gcProfileActiveEntitiesResult).toContain(p1.entity.pointers[0])
      expect(results?.gcProfileActiveEntitiesResult).not.toContain(p2.entity.pointers[0])
      expect(results?.gcStaleProfilesResult?.hashesDeleted.size).toEqual(0)
      expect(results?.gcStaleProfilesResult?.deploymentsDeleted).toContain(p1DeploymentId)
    })
  })

  async function assertContentIsAvailable(components: AppComponents, ...hashes: string[]) {
    const result = await components.storage.existMultiple(hashes)
    const allAvailable = Array.from(result.values()).every((available) => available)
    assert.ok(allAvailable)
  }
})
