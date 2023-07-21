import { EntityType } from '@dcl/schemas'
import { getDeployments } from '../../../../src/logic/deployments'
import { Deployer } from '../../../../src/ports/deployer'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { buildDeployData, deployEntitiesCombo, EntityCombo } from '../../E2ETestUtils'
import { TestProgram } from '../../TestProgram'
import LeakDetector from 'jest-leak-detector'
import { createDefaultServer } from '../../simpleTestEnvironment'

const P1 = 'x1,y1'
const AMOUNT_OF_DEPLOYMENTS = 5
const type = EntityType.PROFILE

/**
 * This test verifies that if concurrent deployments are made, then only one remains as active
 */
describe('Integration - Concurrent deployments', () => {
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

  it('When deployments are executed concurrently, then only one remains active', async () => {
    const p: Promise<EntityCombo>[] = []
    for (let i = 0; i < AMOUNT_OF_DEPLOYMENTS; i++) {
      p.push(buildDeployData([P1], { type, metadata: { a: 'metadata' } }))
    }
    const entities = await Promise.all(p)

    const { components } = server
    const { deployer } = components

    // Perform all the deployments concurrently
    await Promise.all(entities.map((entityCombo) => deployEntity(deployer, entityCombo, components)))

    // Assert that only one is active
    const { deployments } = await getDeployments(components, components.database, {
      filters: { pointers: [P1], onlyCurrentlyPointed: true }
    })
    expect(deployments.length).toEqual(1)
  })

  async function deployEntity(deployer: Deployer, entity: EntityCombo, components: Pick<AppComponents, 'logs'>) {
    const logger = components.logs.getLogger('ConcurrentCheckTest/DeployEntity')
    try {
      logger.info('deploying', entity as any)
      await deployEntitiesCombo(deployer, entity)
    } catch (error) {
      if (!error.message.startsWith(`The following pointers are currently being deployed`)) {
        logger.error('deploying error')
        logger.error(error)
        throw error
      }
    }
  }
})
