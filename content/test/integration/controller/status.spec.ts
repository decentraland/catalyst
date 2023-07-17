import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { createTestEnvironment } from '../IsolatedEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Status', () => {
  let testEnvironment
  let server: TestProgram

  beforeAll(async () => {
    testEnvironment = await createTestEnvironment()
    server = await testEnvironment.spawnServer([{ key: EnvironmentConfig.DISABLE_SYNCHRONIZATION, value: true }])
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

  it('returns 200 when the status is ok', async () => {
    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/status`
    const res = await fetch(url)

    expect(res.status).toBe(200)
  })
})
