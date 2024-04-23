import { AuthLinkType, Entity, EntityType } from '@dcl/schemas'
import { AuditInfo, DeploymentContext, DeploymentResult } from '../../../../src/deployment-types'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator } from '../../../helpers/service/validations/NoOpValidator'
import { EntityCombo } from '../../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../../resources/get-resource-path'
import { TestProgram } from '../../TestProgram'
import LeakDetector from 'jest-leak-detector'
import { createDefaultServer } from '../../simpleTestEnvironment'

describe('Integration - Deployment synced old entity', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopServerValidator(server.components)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it('When deploying an entity with cid v0 hashes of entities before ADR 45, it should succeed', async () => {
    const { components } = server
    const { fs } = components
    const entity: Entity = {
      version: 'v3',
      id: 'QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u',
      type: EntityType.PROFILE,
      pointers: ['0x4CAb2E350499bAd0eC5941aD6B6995a6a20f0130'],
      timestamp: 1632416205936,
      content: [
        {
          file: 'aFile-zjxd',
          hash: 'QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF'
        },
        {
          file: 'anotherFile-zjxd',
          hash: 'QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF'
        },
        {
          file: 'aThirdFile-zjxd',
          hash: 'QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF'
        }
      ]
    }

    const contentFile = await fs.readFile(
      getIntegrationResourcePathFor('QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF')
    )
    const entityFile = await fs.readFile(
      getIntegrationResourcePathFor('QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u')
    )

    const E1: EntityCombo = {
      deployData: {
        entityId: 'QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u',
        files: new Map([
          ['QmbNcPuVAq6Dv821kfFnyaM59Go3xCeBMnSxYRSHEpwWeF', contentFile],
          ['QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u', entityFile]
        ]),
        authChain: [
          {
            type: AuthLinkType.SIGNER,
            payload: '0x4CAb2E350499bAd0eC5941aD6B6995a6a20f0130',
            signature: ''
          },
          {
            type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
            payload: 'QmYfCVBv7PJCcBh3AutAzNesdGZVKUEd8KCc8Jh1Y8ba4u',
            signature:
              '0x10c80e802b3d5faea8e253c809d254ec2e17a4b36c50ade38e0a4e7766c320e903aa262a5be9458802d57f0c69b283855d3734848fc7b68467d0749f082700b01b'
          }
        ]
      },
      entity: entity
    }

    const deploymentResult = await deployEntity(components, E1)

    expect(typeof deploymentResult === 'number').toBeTruthy()
  })

  async function deployEntity(
    components: Pick<AppComponents, 'deployer'>,
    entity: EntityCombo,
    overrideAuditInfo?: Partial<AuditInfo>
  ): Promise<DeploymentResult> {
    const newAuditInfo = { version: 'v3', authChain: entity.deployData.authChain, ...overrideAuditInfo }
    return await components.deployer.deployEntity(
      Array.from(entity.deployData.files.values()),
      entity.deployData.entityId,
      newAuditInfo,
      DeploymentContext.SYNCED
    )
  }
})
