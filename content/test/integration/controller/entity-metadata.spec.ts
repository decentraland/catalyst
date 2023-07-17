import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { buildDeployData } from '../E2ETestUtils'
import { TestProgram } from '../TestProgram'
import { createTestEnvironment } from '../IsolatedEnvironment'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Get wearable image and thumbnail', () => {
  let testEnvironment
  let server: TestProgram

  beforeAll(async () => {
    testEnvironment = await createTestEnvironment()
    server = await testEnvironment.spawnServer([{ key: EnvironmentConfig.DISABLE_SYNCHRONIZATION, value: true }])
    makeNoopValidator(server.components)
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

  it('when entity does not exist, it should return 404', async () => {
    const responses = await Promise.all([
      fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`),
      fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`, { method: 'HEAD' }),
      fetch(`${server.getUrl()}/queries/items/wearable/image`),
      fetch(`${server.getUrl()}/queries/items/wearable/image`, { method: 'HEAD' })
    ])

    for (const response of responses) {
      expect(response.status).toEqual(404)
    }
  })

  it('when entity has not metadata, it should return 404', async () => {
    const deployResult = await buildDeployData(['wearable'], {
      metadata: {},
      contentPaths: []
    })

    await server.deployEntity(deployResult.deployData)

    const responses = await Promise.all([
      fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`),
      fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`, { method: 'HEAD' }),
      fetch(`${server.getUrl()}/queries/items/wearable/image`),
      fetch(`${server.getUrl()}/queries/items/wearable/image`, { method: 'HEAD' })
    ])

    for (const response of responses) {
      expect(response.status).toEqual(404)
    }
  })

  describe('thumbnail', () => {
    it('when entity has not thumbnail, it should return 404', async () => {
      const deployResult = await buildDeployData(['wearable'], {
        metadata: { image: 'some-binary-file.png' },
        contentPaths: ['test/integration/resources/some-binary-file.png']
      })

      await server.deployEntity(deployResult.deployData)

      const responses = await Promise.all([
        fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`),
        fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`, { method: 'HEAD' })
      ])

      for (const response of responses) {
        expect(response.status).toEqual(404)
      }
    })

    it('when entity has thumbnail, it should return the content and set the headers', async () => {
      const deployResult = await buildDeployData(['wearable'], {
        metadata: { thumbnail: 'some-binary-file.png' },
        contentPaths: ['test/integration/resources/some-binary-file.png']
      })

      await server.deployEntity(deployResult.deployData)

      const responses = await Promise.all([
        fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`),
        fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`, { method: 'HEAD' })
      ])

      for (const response of responses) {
        expect(response.status).toEqual(200)
        expect(response.headers.get('content-type')).toEqual('application/octet-stream')
        expect(response.headers.get('ETag')).toBeTruthy()
        expect(response.headers.get('Cache-Control')).toBeTruthy()
      }
    })
  })

  describe('image', () => {
    it('when entity has not image, it should return 404', async () => {
      const deployResult = await buildDeployData(['wearable'], {
        metadata: { thumbnail: 'some-binary-file.png' },
        contentPaths: ['test/integration/resources/some-binary-file.png']
      })

      await server.deployEntity(deployResult.deployData)

      const responses = await Promise.all([
        fetch(`${server.getUrl()}/queries/items/wearable/image`),
        fetch(`${server.getUrl()}/queries/items/wearable/image`, { method: 'HEAD' })
      ])

      for (const response of responses) {
        expect(response.status).toEqual(404)
      }
    })

    it('when entity has image, it should return the content and set the headers', async () => {
      const deployResult = await buildDeployData(['wearable'], {
        metadata: { image: 'some-binary-file.png' },
        contentPaths: ['test/integration/resources/some-binary-file.png']
      })

      await server.deployEntity(deployResult.deployData)

      const responses = await Promise.all([
        fetch(`${server.getUrl()}/queries/items/wearable/image`),
        fetch(`${server.getUrl()}/queries/items/wearable/image`, { method: 'HEAD' })
      ])

      for (const response of responses) {
        expect(response.status).toEqual(200)
        expect(response.headers.get('content-type')).toEqual('application/octet-stream')
        expect(response.headers.get('ETag')).toBeTruthy()
        expect(response.headers.get('Cache-Control')).toBeTruthy()
      }
    })
  })
})
