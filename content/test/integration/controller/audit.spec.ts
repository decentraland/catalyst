import { EntityType } from '@dcl/schemas'
import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { buildDeployData, deployEntitiesCombo } from '../E2ETestUtils'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'

describe('Integration - Audit', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
  })

  it('returns 400 when no cid is provided', async () => {
    const url = server.getUrl() + `/available-content`
    const res = await fetch(url)

    expect(res.status).toBe(400)
  })

  it('returns the audit information about the entity', async () => {
    const entity = await buildDeployData(['profileId'], { type: EntityType.PROFILE, metadata: { a: 'metadata' } })
    await deployEntitiesCombo(server.components.deployer, entity)

    const url = server.getUrl() + `/audit/profile/${entity.entity.id}`
    const res = await fetch(url)

    expect(res.status).toBe(200)
  })

  it('returns 400 when the entity type is invalid', async () => {
    const url = server.getUrl() + `/audit/non-existent-type/non-existent-entity`
    const res = await fetch(url)

    expect(res.status).toBe(400)
  })

  it('returns 404 when it cannot find the entity', async () => {
    const url = server.getUrl() + `/audit/profile/non-existent-entity`
    const res = await fetch(url)

    expect(res.status).toBe(404)
  })
})
