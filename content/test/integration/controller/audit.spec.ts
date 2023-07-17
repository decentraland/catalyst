import { EntityType } from '@dcl/schemas'
import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { buildDeployData, deployEntitiesCombo } from '../E2ETestUtils'
import { TestProgram } from '../TestProgram'
import { createTestEnvironment } from '../IsolatedEnvironment'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Audit', () => {
  let testEnvironment
  let server: TestProgram

  beforeAll(async () => {
    testEnvironment = await createTestEnvironment()
    server = await testEnvironment.spawnServer([{ key: EnvironmentConfig.DISABLE_SYNCHRONIZATION, value: true }])
    await server.startProgram()
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await server.stopProgram()
    server = undefined as any
    await testEnvironment.clean()
    const detector = new LeakDetector(testEnvironment)
    testEnvironment = undefined as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it('returns the audit information about the entity', async () => {
    makeNoopValidator(server.components)

    const entity = await buildDeployData(['profileId'], { type: EntityType.PROFILE, metadata: { a: 'metadata' } })
    await deployEntitiesCombo(server.components.deployer, entity)

    const url = server.getUrl() + `/audit/profile/${entity.entity.id}`
    const res = await fetch(url)

    expect(res.status).toBe(200)
  })

  it('returns 400 when the entity type is invalid', async () => {
    makeNoopValidator(server.components)

    const url = server.getUrl() + `/audit/non-existent-type/non-existent-entity`
    const res = await fetch(url)

    expect(res.status).toBe(400)
  })

  it('returns 404 when it cannot find the entity', async () => {
    makeNoopValidator(server.components)

    const url = server.getUrl() + `/audit/profile/non-existent-entity`
    const res = await fetch(url)

    expect(res.status).toBe(404)
  })
})
