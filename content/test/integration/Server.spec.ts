import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { Entity as ControllerEntity, Entity, EntityType } from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { stub } from 'sinon'
import { ControllerPointerChanges } from '../../src/controller/Controller'
import { EnvironmentBuilder, EnvironmentConfig } from '../../src/Environment'
import { metricsDeclaration } from '../../src/metrics'
import { Server } from '../../src/service/Server'
import { SimpleContentItem } from '../../src/storage/ContentStorage'
import { randomEntity } from '../helpers/service/EntityTestFactory'
import { buildContent } from '../helpers/service/MockedMetaverseContentService'

describe('Integration - Server', () => {
  let server: Server
  const content = buildContent()
  const entity1 = randomEntity(EntityType.SCENE)
  const entity2 = randomEntity(EntityType.SCENE)

  let address: string

  it('starts the server', async () => {
    const logs = createLogComponent()

    const env = await new EnvironmentBuilder().buildConfigAndComponents()

    const metrics = createTestMetricsComponent(metricsDeclaration)

    const controller = env.controller

    server = new Server({ env: env.env, controller, metrics, logs })

    address = `http://localhost:${env.env.getConfig(EnvironmentConfig.SERVER_PORT)}`

    await server.start()

    stub(env.deployer, 'getEntitiesByIds').resolves([entity1, entity2])
    stub(env.deployer, 'getEntitiesByPointers').resolves([entity1, entity2])
    stub(env.deployer, 'getContent').resolves(SimpleContentItem.fromBuffer(Buffer.from(content.buffer)))
  })

  it(`Get all scenes by id`, async () => {
    const response = await fetch(`${address}/entities/scenes?id=${entity1.id}&id=${entity2.id}`)
    expect(response.ok).toBe(true)
    const scenes: ControllerEntity[] = await response.json()
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
    const { deltas }: { deltas: ControllerPointerChanges[] } = await response.json()
    expect(Array.isArray(deltas)).toBe(true)
    const [controllerDelta] = deltas
    expect(controllerDelta.entityId).not.toBeNull()
    expect(controllerDelta.entityType).not.toBeNull()
    expect(controllerDelta.localTimestamp).not.toBeNull()
    const { changes } = controllerDelta
    expect(Array.isArray(changes)).toBe(true)
    const [change] = changes
    expect(change.pointer).not.toBeNull()
    expect(change.before).not.toBeNull()
    expect(change.after).not.toBeNull()
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

  it('stops the server', async () => await server.stop())
})
