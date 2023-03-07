import { EntityType } from '@dcl/schemas'
import { getDeployments } from '../../../../src/logic/deployments'
import { Deployer } from '../../../../src/ports/deployer'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment, testCaseWithComponents } from '../../E2ETestEnvironment'
import { buildDeployData, deployEntitiesCombo, EntityCombo } from '../../E2ETestUtils'

/**
 * This test verifies that if concurrent deployments are made, then only one remains as active
 */
describe('Integration - Concurrent deployments', () => {
  const getTestEnv = setupTestEnvironment()

  const P1 = 'x1,y1'
  const AMOUNT_OF_DEPLOYMENTS = 500
  const type = EntityType.PROFILE

  let entities: EntityCombo[]

  it('creates initial entities', async () => {
    entities = []
    for (let i = 0; i < AMOUNT_OF_DEPLOYMENTS; i++) {
      entities[i] = await buildDeployData([P1], { type, metadata: { a: 'metadata' } })
    }
  })

  testCaseWithComponents(
    getTestEnv,
    `When deployments are executed concurrently, then only one remains active`,
    async (components) => {
      const { deployer } = components

      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      // Perform all the deployments concurrently
      await Promise.all(entities.map((entityCombo) => deployEntity(deployer, entityCombo, components)))

      // Assert that only one is active
      const { deployments } = await getDeployments(components, { filters: { pointers: [P1], onlyCurrentlyPointed: true } })
      expect(deployments.length).toEqual(1)
    }
  )

  async function deployEntity(
    deployer: Deployer,
    entity: EntityCombo,
    components: Pick<AppComponents, 'logs'>
  ) {
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
