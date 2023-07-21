import { getDeployments } from '../../../../src/logic/deployments'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { buildDeployData, buildDeployDataAfterEntity, deployEntitiesCombo, EntityCombo } from '../../E2ETestUtils'
import { createDefaultServer } from '../../simpleTestEnvironment'
import { TestProgram } from '../../TestProgram'
import LeakDetector from 'jest-leak-detector'

/**
 * This test verifies that the active entity and overwrites are calculated correctly, regardless of the order in which the entities where deployed.
 */
describe('Integration - Order Check', () => {
  const P1 = 'X1,Y1'
  const P2 = 'X2,Y2'
  const P3 = 'X3,Y3'
  const P4 = 'X4,Y4'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo, E4: EntityCombo, E5: EntityCombo

  let allEntities: EntityCombo[]

  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
    makeNoopServerValidator(server.components)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

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
    it(names, async () => {
      const { components } = server
      const entityCombos = indices.map((idx) => allEntities[idx])
      await deployEntitiesCombo(components.deployer, ...entityCombos)
      await assertCommitsWhereDoneCorrectly(components)
    })
  })

  async function assertCommitsWhereDoneCorrectly(components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>) {
    // Assert only E5 is active
    const activeEntities = await getActiveDeployments(components)
    expect(activeEntities.length).toEqual(1)
    const activeEntity = activeEntities[0]
    expect(activeEntity.entityId).toEqual(E5.entity.id)
  }

  async function getActiveDeployments(components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>) {
    const { deployments } = await getDeployments(components, components.database, {
      filters: {
        onlyCurrentlyPointed: true
      }
    })
    return deployments
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
