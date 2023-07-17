import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { TestProgram } from '../TestProgram'
import { createTestEnvironment } from '../IsolatedEnvironment'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Entities', () => {
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

  it('returns 500 when there is an exception while deploying the entity', async () => {
    jest.spyOn(server.components.deployer, 'deployEntity').mockRejectedValue({ error: 'error' })

    makeNoopValidator(server.components)

    const url = server.getUrl() + `/entities`
    const res = await fetch(url, { method: 'POST' })

    expect(res.status).toBe(500)
  })
})
