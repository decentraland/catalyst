import { delay } from '@dcl/catalyst-node-commons'
import assert from 'assert'
import { ContentFileHash } from 'dcl-catalyst-commons'
import ms from 'ms'
import { EnvironmentBuilder, EnvironmentConfig } from '../../../../src/Environment'
import { stopAllComponents } from '../../../../src/logic/components-lifecycle'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../../E2ETestEnvironment'
import {
  awaitUntil,
  buildDeployData,
  buildDeployDataAfterEntity,
  deployEntitiesCombo,
  EntityCombo
} from '../../E2ETestUtils'

loadStandaloneTestEnvironment({
  [EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL]: ms('2s'),
  [EnvironmentConfig.GARBAGE_COLLECTION]: 'true'
})('Integration - Garbage Collection', (testEnv) => {
  const P1 = 'X1,Y1',
    P2 = 'X2,Y2'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo
  let onlyE1Content: ContentFileHash
  let sharedContent: ContentFileHash

  let components: AppComponents

  beforeAll(async () => {
    E1 = await buildDeployData([P1], {
      contentPaths: ['test/integration/resources/some-binary-file.png', 'test/integration/resources/some-text-file.txt']
    })
    E2 = await buildDeployDataAfterEntity(E1, [P1], {
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })
    E3 = await buildDeployDataAfterEntity(E2, [P2])
      ;[sharedContent, onlyE1Content] = E1.entity.content?.map(({ hash }) => hash) ?? []
  })

  beforeEach(async () => {
    const baseEnv = await testEnv.getEnvForNewDatabase()
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

  it(`When garbage collection is on, then unused content is deleted`, async () => {
    // Start garbage collection
    await components.garbageCollectionManager.start()

    // Deploy E1
    await deployEntitiesCombo(components.deployer, E1)

    // Assert all content is available
    await assertContentIsAvailable(sharedContent, onlyE1Content)

    // Deploy E2
    await deployEntitiesCombo(components.deployer, E2)

    // Assert only the shared content is still available
    await awaitUntil(() => assertReportedAsDeletedAre(onlyE1Content))
    await assertContentIsAvailable(sharedContent)
  })

  it(`When garbage collection is off, then unused content isn't deleted`, async () => {
    // Deploy E1
    await deployEntitiesCombo(components.deployer, E1)

    // Assert all content is available
    await assertContentIsAvailable(sharedContent, onlyE1Content)

    // Deploy E2
    await deployEntitiesCombo(components.deployer, E2)

    // Wait a little
    await delay(ms('4s'))

    // Assert all content is still available
    await assertContentIsAvailable(sharedContent, onlyE1Content)
    await assertReportedAsDeletedAre()
  })

  it(`When garbage collection is started after deployments, then unused content is still deleted`, async () => {
    // Deploy E1 and E2
    await deployEntitiesCombo(components.deployer, E1, E2)

    // Start garbage collection
    await components.garbageCollectionManager.start()

    // Assert only the shared content is still available
    await awaitUntil(() => assertReportedAsDeletedAre(onlyE1Content))
    await assertContentIsAvailable(sharedContent)
  })

  it(`When entity is not overwritten, then it is not garbage collected`, async () => {
    // Deploy E1 and E3
    await deployEntitiesCombo(components.deployer, E1, E3)

    // Start garbage collection
    await components.garbageCollectionManager.start()

    // Wait a little
    await delay(ms('4s'))

    // Assert nothing was deleted
    await assertReportedAsDeletedAre()
    await assertContentIsAvailable(sharedContent, onlyE1Content)
  })

  function assertReportedAsDeletedAre(...fileHashes: ContentFileHash[]) {
    assert.deepEqual(components.garbageCollectionManager.deletedInLastSweep(), new Set(fileHashes))
    return Promise.resolve()
  }

  async function assertContentIsAvailable(...hashes: ContentFileHash[]) {
    const result = await components.deployer.isContentAvailable(hashes)
    const allAvailable = Array.from(result.values()).every((available) => available)
    assert.ok(allAvailable)
  }
})
