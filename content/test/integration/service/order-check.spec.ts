import { AuditInfo } from 'dcl-catalyst-commons'
import { AppComponents } from '../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'
import { buildDeployData, buildDeployDataAfterEntity, deployEntitiesCombo, EntityCombo } from '../E2ETestUtils'

/**
 * This test verifies that the active entity and overwrites are calculated correctly, regardless of the order in which the entities where deployed.
 */
loadStandaloneTestEnvironment()('Integration - Order Check', (testEnv) => {
  const P1 = 'X1,Y1'
  const P2 = 'X2,Y2'
  const P3 = 'X3,Y3'
  const P4 = 'X4,Y4'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo, E4: EntityCombo, E5: EntityCombo

  let allEntities: EntityCombo[]

  beforeAll(async () => {
    E1 = await buildDeployData([P1])
    E2 = await buildDeployDataAfterEntity(E1, [P2])
    E3 = await buildDeployDataAfterEntity(E2, [P1, P2, P3])
    E4 = await buildDeployDataAfterEntity(E3, [P1, P3, P4])
    E5 = await buildDeployDataAfterEntity(E4, [P2, P4])
    allEntities = [E1, E2, E3, E4, E5]
    allEntities.forEach(({ entity }, idx) => console.debug(`E${idx + 1}: ${entity.id}`))
  })

  permutator([0, 1, 2, 3, 4]).forEach(function (indices) {
    const names = indices.map((idx) => `E${idx + 1}`).join(' -> ')
    testCaseWithComponents(testEnv, names, async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      const entityCombos = indices.map((idx) => allEntities[idx])
      await deployEntitiesCombo(components.deployer, ...entityCombos)
      await assertCommitsWhereDoneCorrectly(components)
    })
  })

  async function assertCommitsWhereDoneCorrectly(components: Pick<AppComponents, 'deployer'>) {
    // Assert only E5 is active
    const activeEntities = await getActiveDeployments(components)
    expect(activeEntities.length).toEqual(1)
    const activeEntity = activeEntities[0]
    expect(activeEntity.entityId).toEqual(E5.entity.id)

    await assertOverwrittenBy(components, E1, E3)
    await assertOverwrittenBy(components, E2, E3)
    await assertOverwrittenBy(components, E3, E4)
    await assertOverwrittenBy(components, E4, E5)
    await assertNotOverwritten(components, E5)
  }

  async function getActiveDeployments(components: Pick<AppComponents, 'deployer'>) {
    const { deployments } = await components.deployer.getDeployments({
      filters: {
        onlyCurrentlyPointed: true
      }
    })
    return deployments
  }

  async function assertOverwrittenBy(
    components: Pick<AppComponents, 'deployer'>,
    overwritten: EntityCombo,
    overwrittenBy: EntityCombo
  ) {
    const auditInfo = await getAuditInfo(components, overwritten)
    expect(auditInfo?.overwrittenBy).toEqual(overwrittenBy.entity.id)
  }

  async function assertNotOverwritten(components: Pick<AppComponents, 'deployer'>, entity: EntityCombo) {
    const auditInfo = await getAuditInfo(components, entity)
    expect(auditInfo?.overwrittenBy).toBeUndefined()
  }

  async function getAuditInfo(components: Pick<AppComponents, 'deployer'>, entity: EntityCombo): Promise<AuditInfo> {
    const { deployments } = await components.deployer.getDeployments({
      filters: {
        entityTypes: [entity.controllerEntity.type],
        entityIds: [entity.controllerEntity.id]
      }
    })
    return deployments[0].auditInfo
  }

  function permutator<T>(array: Array<T>): Array<Array<T>> {
    const result: Array<Array<T>> = []

    const permute = (arr: Array<T>, m: Array<T> = []) => {
      if (arr.length === 0) {
        result.push(m)
      } else {
        for (let i = 0; i < arr.length; i++) {
          const curr = arr.slice()
          const next = curr.splice(i, 1)
          permute(curr.slice(), m.concat(next))
        }
      }
    }
    permute(array)
    return result
  }
})
