import { Pointer } from 'dcl-catalyst-commons'
import { getPointerChanges } from '../../../../src/service/pointers/pointers'
import { PointerChanges } from '../../../../src/service/pointers/types'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../../E2ETestEnvironment'
import { buildDeployData, buildDeployDataAfterEntity, deployEntitiesCombo, EntityCombo } from '../../E2ETestUtils'

/**
 * This test verifies that the pointer changes are calculated correctly
 */
loadStandaloneTestEnvironment()('Integration - Pointer Changes Check', (testEnv) => {
  const P1 = 'x1,y1'
  const P2 = 'x2,y2'
  const P3 = 'x3,y3'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo, E4: EntityCombo

  it('creates deploy data', async () => {
    E1 = await buildDeployData([P1])
    E2 = await buildDeployDataAfterEntity(E1, [P2])
    E3 = await buildDeployDataAfterEntity(E2, [P1, P2, P3])
    E4 = await buildDeployDataAfterEntity(E3, [P3])
  })

  testCaseWithComponents(
    testEnv,
    'When an entity is deployed and set as active but it has no one to overwrite, then it is reported correctly',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      await deployEntitiesCombo(components.deployer, E1)

      const changes = await getChangesInPointersFor(components, E1)

      assertChangesAre(changes, [P1, { before: undefined, after: E1 }])
    }
  )

  testCaseWithComponents(
    testEnv,
    'When an entity is deployed and set as active, and it overwrites others, then it is reported correctly',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      await deployEntitiesCombo(components.deployer, E1, E3)

      const changes = await getChangesInPointersFor(components, E3)

      assertChangesAre(
        changes,
        [P1, { before: E1, after: E3 }],
        [P2, { before: undefined, after: E3 }],
        [P3, { before: undefined, after: E3 }]
      )
    }
  )

  testCaseWithComponents(
    testEnv,
    'When an entity is deployed but set as inactive, and it has no one to overwrite, then it is reported correctly',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      await deployEntitiesCombo(components.deployer, E3, E1)

      const changes = await getChangesInPointersFor(components, E1)

      assertChangesAre(changes)
    }
  )

  testCaseWithComponents(
    testEnv,
    'When an entity is deployed but set as inactive, and it overwrites others, then it is reported correctly',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      await deployEntitiesCombo(components.deployer, E1, E2, E4, E3)

      const changes = await getChangesInPointersFor(components, E3)

      assertChangesAre(changes, [P1, { before: E1, after: undefined }], [P2, { before: E2, after: undefined }])
    }
  )

  function assertChangesAre(
    changes: PointerChanges,
    ...expectedChanges: [Pointer, { before: EntityCombo | undefined; after: EntityCombo | undefined }][]
  ) {
    const expectedChangesMap = new Map(
      expectedChanges.map(([pointer, changes]) => [
        pointer,
        { before: changes.before?.entity?.id, after: changes.after?.entity?.id }
      ])
    )
    expect(changes).toEqual(expectedChangesMap)
  }

  async function getChangesInPointersFor(
    components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>,
    entityCombo: EntityCombo
  ): Promise<PointerChanges> {
    const result = await getPointerChanges(components, {
      filters: { entityTypes: [entityCombo.entity.type] }
    })
    const pointerChanges = result.pointerChanges.filter((delta) => delta.entityId === entityCombo.entity.id)[0]

    if (!pointerChanges) {
      console.dir(result)
      throw new Error(`There are no pointerChanges for entityId ${entityCombo.entity.id}`)
    }

    return pointerChanges.changes
  }
})
