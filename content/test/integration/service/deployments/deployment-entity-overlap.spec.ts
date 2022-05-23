import { AuditInfo, EntityType, EntityVersion } from 'dcl-catalyst-commons'
import { stub } from 'sinon'
import {
  DeploymentContext,
  DeploymentResult,
  isInvalidDeployment,
  isSuccessfulDeployment
} from '../../../../src/service/Service'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../../E2ETestEnvironment'
import { buildDeployData, buildDeployDataAfterEntity, createIdentity, EntityCombo, Identity } from '../../E2ETestUtils'

/**
 * This test verifies some scenarios that could happen during scene deployments.
 */
loadStandaloneTestEnvironment()('Integration - Deployment with Entity Overlaps', (testEnv) => {
  const P1 = '0,0'
  const P2 = '0,1'
  const P3 = '1,1'
  let identity: Identity
  let E1: EntityCombo, E2: EntityCombo

  beforeEach(async () => {
    identity = createIdentity()
    E1 = await buildDeployData([P1, P2], {
      type: EntityType.SCENE,
      metadata: {
        main: 'main.js',
        scene: {
          base: P1,
          parcels: [P1, P2]
        }
      },
      identity
    })
  })

  testCaseWithComponents(
    testEnv,
    'When new scene is deployed on overlapping parcels, then new deployment removes previous scenes from orphaned parcels',
    async (components) => {
      // make validators stub
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      E2 = await buildDeployDataAfterEntity(E1, [P2], {
        type: EntityType.SCENE,
        metadata: {
          main: 'main.js',
          scene: {
            base: P2,
            parcels: [P2]
          }
        },
        identity
      })

      // Deploy E1 on P1, P2
      await deploy(components, E1)
      await assertDeploymentsAre(components, E1)

      // Deploy E2 on P2
      await deploy(components, E2)
      await assertDeploymentsAre(components, E2) // E1 should no longer be active
    }
  )

  testCaseWithComponents(testEnv, 'When scene is deployed, then server checks for permissions', async (components) => {
    // make validators stub
    stub(components.validator, 'validate')
      .onFirstCall()
      .resolves({ ok: true })
      .onSecondCall()
      .resolves({
        ok: false,
        errors: [
          `The provided Eth Address does not have access to the following parcel: (${P1})`,
          `The provided Eth Address does not have access to the following parcel: (${P2})`
        ]
      })
    makeNoopServerValidator(components)

    E2 = await buildDeployDataAfterEntity(E1, [P1, P2], {
      type: EntityType.SCENE,
      metadata: {
        main: 'main.js',
        scene: {
          base: P1,
          parcels: [P1, P2]
        }
      }
    })

    // Deploy E1 on P1, P2
    await deploy(components, E1)
    await assertDeploymentsAre(components, E1)

    // Deploy E2 on P1
    await expect(deploy(components, E2)).rejects.toThrow(
      'The provided Eth Address does not have access to the following parcel: (0,0),The provided Eth Address does not have access to the following parcel: (0,1)'
    )
    await assertDeploymentsAre(components, E1) // E2 should have not been deployed
  })

  testCaseWithComponents(
    testEnv,
    'When parcel changes owner, then new deployment by new owner succeeds and removes previous scenes from orphaned parcels',
    async (components) => {
      // make noop server validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      // Deploy E1 on P1, P2
      await deploy(components, E1)
      await assertDeploymentsAre(components, E1)

      // Change ownership of P2
      // Nothing to do really, as the mock above already allows the new deployment

      // Deploy E2 on P2, P3
      E2 = await buildDeployDataAfterEntity(E1, [P2, P3], {
        type: EntityType.SCENE,
        metadata: {
          main: 'main.js',
          scene: {
            base: P2,
            parcels: [P2, P3]
          }
        }
      })

      await deploy(components, E2)
      await assertDeploymentsAre(components, E2) // E1 should have no scenes now
    }
  )

  async function assertDeploymentsAre(components: Pick<AppComponents, 'deployer'>, ...expectedEntities: EntityCombo[]) {
    const actualDeployments = await components.deployer.getDeployments({ filters: { onlyCurrentlyPointed: true } })
    const expectedEntityIds = expectedEntities.map((entityCombo) => entityCombo.entity.id).sort()
    const actualEntityIds = actualDeployments.deployments.map(({ entityId }) => entityId).sort()
    expect({ deployedEntityIds: actualEntityIds }).toEqual({ deployedEntityIds: expectedEntityIds })
  }

  async function deploy(components: Pick<AppComponents, 'deployer'>, ...entities: EntityCombo[]): Promise<number[]> {
    return deployWithAuditInfo(components, entities, {})
  }

  async function deployWithAuditInfo(
    components: Pick<AppComponents, 'deployer'>,
    entities: EntityCombo[],
    overrideAuditInfo?: Partial<AuditInfo>
  ) {
    const timestamps: number[] = []
    for (const { deployData } of entities) {
      const newAuditInfo = { version: EntityVersion.V3, authChain: deployData.authChain, ...overrideAuditInfo }
      const deploymentResult: DeploymentResult = await components.deployer.deployEntity(
        Array.from(deployData.files.values()),
        deployData.entityId,
        newAuditInfo,
        DeploymentContext.LOCAL
      )
      if (isSuccessfulDeployment(deploymentResult)) {
        timestamps.push(deploymentResult)
      } else if (isInvalidDeployment(deploymentResult)) {
        throw new Error(deploymentResult.errors.join(','))
      } else {
        throw new Error('deployEntity returned invalid result' + JSON.stringify(deploymentResult))
      }
    }
    return timestamps
  }
})
