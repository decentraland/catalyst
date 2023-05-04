import { SimpleContentItem } from '@dcl/catalyst-storage/dist/content-item'
import { Entity, EntityType, PointerChangesSyncDeployment } from '@dcl/schemas'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { random } from 'faker'
import fetch from 'node-fetch'
import { stopAllComponents } from '../../src/logic/components-lifecycle'
import { GlobalContext } from 'src/types'
import { EnvironmentConfig } from '../../src/Environment'
import { randomEntity } from '../helpers/service/EntityTestFactory'
import { E2ETestEnvironment } from './E2ETestEnvironment'

describe('Integration - Server', () => {
  let server: IHttpServerComponent<GlobalContext>
  const content = {
    hash: random.alphaNumeric(10),
    buffer: Buffer.from(random.alphaNumeric(10))
  }
  const entity1 = randomEntity(EntityType.SCENE)
  const entity2 = randomEntity(EntityType.SCENE)

  let address: string

  const testEnv = new E2ETestEnvironment()

  beforeAll(async () => {
    await testEnv.start()
  })

  afterAll(async () => {
    await testEnv.clearDatabases()
    await testEnv.stop()
  })

  it('starts the server', async () => {
    const components = await testEnv.buildService()

    server = components.server

    address = `http://localhost:${components.env.getConfig(EnvironmentConfig.HTTP_SERVER_PORT)}`

    // TODO
    // await server.start()

    jest.spyOn(components.activeEntities, 'withIds').mockResolvedValue([entity1, entity2])
    jest.spyOn(components.activeEntities, 'withPointers').mockResolvedValue([entity1, entity2])
    jest.spyOn(components.storage, 'retrieve').mockResolvedValue(SimpleContentItem.fromBuffer(content.buffer))
  })

  it(`Get all scenes by id`, async () => {
    const response = await fetch(`${address}/entities/scenes?id=${entity1.id}&id=${entity2.id}`)
    expect(response.ok).toBe(true)
    const scenes: Entity[] = await response.json()
    expect(scenes.length).toBe(2)
  })

  it(`Get all scenes by pointer`, async () => {
    const response = await fetch(
      `${address}/entities/scenes?pointer=${entity1.pointers[0]}&pointer=${entity2.pointers[0]}`
    )

    expect(response.ok).toBe(true)
    const scenes: Entity[] = await response.json()
    expect(scenes.length).toBe(2)
    scenes.forEach((scene) => {
      expect(scene.type).toBe(EntityType.SCENE)
    })
  })

  it(`Get does not support ids and pointers at the same time`, async () => {
    const response = await fetch(`${address}/entities/scenes?id=1&pointer=A`)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('ids or pointers must be present, but not both')
  })

  it(`Get support profiles`, async () => {
    const response = await fetch(`${address}/entities/profiles?id=1`)
    expect(response.ok).toBe(true)
  })

  it(`Get detects invalid entity types`, async () => {
    const response = await fetch(`${address}/entities/invalids?id=1`)
    expect(response.ok).toBe(false)
    expect(response.status).toBe(400)
  })

  it(`Download Content`, async () => {
    const response = await fetch(`${address}/contents/${content.hash}`)
    expect(response.ok).toBe(true)
    const buffer = await response.buffer()
    expect(buffer).toEqual(content.buffer)
  })

  it(`PointerChanges`, async () => {
    const response = await fetch(`${address}/pointer-changes?entityType=${entity1.type}`)
    expect(response.ok).toBe(true)
    const { deltas }: { deltas: PointerChangesSyncDeployment[] } = await response.json()
    expect(Array.isArray(deltas)).toBe(true)
  })

  it(`PointerChanges with offset too high`, async () => {
    const response = await fetch(`${address}/pointer-changes?offset=5001`)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: `Offset can't be higher than 5000. Please use the 'next' property for pagination.`
    })
  })

  it(`Deployments with offset too high`, async () => {
    const response = await fetch(`${address}/deployments?offset=5001`)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: `Offset can't be higher than 5000. Please use the 'next' property for pagination.`
    })
  })

  it('stops the server', async () => stopAllComponents({ server }))
})
