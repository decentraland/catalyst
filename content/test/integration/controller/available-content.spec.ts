import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { TestProgram } from '../TestProgram'
import { createTestEnvironment } from '../IsolatedEnvironment'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Available Content', () => {
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

  it('returns 400 when no cid is provided', async () => {
    makeNoopValidator(server.components)

    const url = server.getUrl() + `/available-content`
    const res = await fetch(url)

    expect(res.status).toBe(400)
  })
})
