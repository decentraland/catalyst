import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { buildDeployData } from '../E2ETestUtils'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Get wearable image and thumbnail', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  beforeEach(() => resetServer(server))

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
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
        expect(response.headers.get('content-type')).toEqual('image/png')
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
        expect(response.headers.get('content-type')).toEqual('image/png')
        expect(response.headers.get('ETag')).toBeTruthy()
        expect(response.headers.get('Cache-Control')).toBeTruthy()
      }
    })
  })
})
