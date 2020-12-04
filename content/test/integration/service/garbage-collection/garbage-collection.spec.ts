import ms from 'ms'
import assert from 'assert'
import { ContentFileHash } from 'dcl-catalyst-commons'
import { delay } from 'decentraland-katalyst-utils/util'
import { loadTestEnvironment } from '../../E2ETestEnvironment'
import { MetaverseContentService } from '@katalyst/content/service/Service'
import { EnvironmentBuilder, Bean, EnvironmentConfig } from '@katalyst/content/Environment'
import { NoOpValidations } from '@katalyst/test-helpers/service/validations/NoOpValidations'
import { GarbageCollectionManager } from '@katalyst/content/service/garbage-collection/GarbageCollectionManager'
import {
  EntityCombo,
  awaitUntil,
  buildDeployData,
  buildDeployDataAfterEntity,
  deployEntitiesCombo
} from '../../E2ETestUtils'

describe('Integration - Garbage Collection', () => {
  const P1 = 'X1,Y1',
    P2 = 'X2,Y2'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo
  let onlyE1Content: ContentFileHash
  let sharedContent: ContentFileHash

  const testEnv = loadTestEnvironment()
  let service: MetaverseContentService
  let garbageCollector: GarbageCollectionManager

  beforeAll(async () => {
    E1 = await buildDeployData([P1], {
      contentPaths: [
        'content/test/integration/resources/some-binary-file.png',
        'content/test/integration/resources/some-text-file.txt'
      ]
    })
    E2 = await buildDeployDataAfterEntity(E1, [P1], {
      contentPaths: ['content/test/integration/resources/some-binary-file.png']
    })
    E3 = await buildDeployDataAfterEntity(E2, [P2])
    ;[sharedContent, onlyE1Content] = Array.from(E1.entity.content!.values())
  })

  beforeEach(async () => {
    const baseEnv = await testEnv.getEnvForNewDatabase()
    const env = await new EnvironmentBuilder(baseEnv)
      .withConfig(EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL, ms('2s'))
      .withConfig(EnvironmentConfig.GARBAGE_COLLECTION, 'true')
      .withConfig(EnvironmentConfig.LOG_LEVEL, 'debug')
      .withBean(Bean.VALIDATIONS, new NoOpValidations())
      .build()

    service = env.getBean(Bean.SERVICE)
    garbageCollector = env.getBean(Bean.GARBAGE_COLLECTION_MANAGER)
  })

  afterEach(async () => {
    await garbageCollector?.stop()
  })

  it(`When garbage collection is on, then unused content is deleted`, async () => {
    // Start garbage collection
    await garbageCollector.start()

    // Deploy E1
    await deployEntitiesCombo(service, E1)

    // Assert all content is available
    await assertContentIsAvailable(sharedContent, onlyE1Content)

    // Deploy E2
    await deployEntitiesCombo(service, E2)

    // Assert only the shared content is still available
    await awaitUntil(() => assertReportedAsDeletedAre(onlyE1Content))
    await assertContentIsAvailable(sharedContent)
  })

  it(`When garbage collection is off, then unused content isn't deleted`, async () => {
    // Deploy E1
    await deployEntitiesCombo(service, E1)

    // Assert all content is available
    await assertContentIsAvailable(sharedContent, onlyE1Content)

    // Deploy E2
    await deployEntitiesCombo(service, E2)

    // Wait a little
    await delay(ms('4s'))

    // Assert all content is still available
    await assertContentIsAvailable(sharedContent, onlyE1Content)
    await assertReportedAsDeletedAre()
  })

  it(`When garbage collection is started after deployments, then unused content is still deleted`, async () => {
    // Deploy E1 and E2
    await deployEntitiesCombo(service, E1, E2)

    // Start garbage collection
    await garbageCollector.start()

    // Assert only the shared content is still available
    await awaitUntil(() => assertReportedAsDeletedAre(onlyE1Content))
    await assertContentIsAvailable(sharedContent)
  })

  it(`When entity is not overwritten, then it is not garbage collected`, async () => {
    // Deploy E1 and E3
    await deployEntitiesCombo(service, E1, E3)

    // Start garbage collection
    await garbageCollector.start()

    // Wait a little
    await delay(ms('4s'))

    // Assert nothing was deleted
    await assertReportedAsDeletedAre()
    await assertContentIsAvailable(sharedContent, onlyE1Content)
  })

  function assertReportedAsDeletedAre(...fileHashes: ContentFileHash[]) {
    assert.deepEqual(garbageCollector.deletedInLastSweep(), new Set(fileHashes))
    return Promise.resolve()
  }

  async function assertContentIsAvailable(...hashes: ContentFileHash[]) {
    const result = await service.isContentAvailable(hashes)
    const allAvailable = Array.from(result.values()).every((available) => available)
    assert.ok(allAvailable)
  }
})
