import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { Entity as ControllerEntity, Entity, EntityType } from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { mock } from 'ts-mockito'
import { Controller, ControllerPointerChanges } from '../../src/controller/Controller'
import { ActiveDenylist } from '../../src/denylist/ActiveDenylist'
import { Environment, EnvironmentConfig } from '../../src/Environment'
import { metricsDeclaration } from '../../src/metrics'
import { ContentAuthenticator } from '../../src/service/auth/Authenticator'
import { DeploymentPointerChanges } from '../../src/service/deployments/types'
import { Server } from '../../src/service/Server'
import { ISnapshotManager } from '../../src/service/snapshots/SnapshotManager'
import { ChallengeSupervisor } from '../../src/service/synchronization/ChallengeSupervisor'
import { ContentCluster } from '../../src/service/synchronization/ContentCluster'
import { MockedRepository } from '../helpers/repository/MockedRepository'
import { randomEntity } from '../helpers/service/EntityTestFactory'
import { buildContent, MockedMetaverseContentServiceBuilder } from '../helpers/service/MockedMetaverseContentService'
import { MockedSynchronizationManager } from '../helpers/service/synchronization/MockedSynchronizationManager'

describe('Integration - Server', function () {
  let server: Server
  const content = buildContent()
  const entity1 = randomEntity(EntityType.SCENE)
  const entity2 = randomEntity(EntityType.SCENE)
  const pointerChanges: DeploymentPointerChanges = {
    entityId: entity1.id,
    entityType: entity1.type,
    localTimestamp: 10,
    changes: new Map([[entity1.pointers[0], { before: undefined, after: entity1.id }]]),
    authChain: []
  }
  const port = 8080
  const address: string = `http://localhost:${port}`

  it('starts the server', async () => {
    const deployer = new MockedMetaverseContentServiceBuilder()
      .withEntity(entity1)
      .withEntity(entity2)
      .withPointerChanges(pointerChanges)
      .withContent(content)
      .build()

    const logs = createLogComponent()
    const repository = MockedRepository.build()
    const synchronizationManager = new MockedSynchronizationManager()

    const ethNetwork = 'network'
    const denylist = new ActiveDenylist(repository, mock(ContentAuthenticator), mock(ContentCluster), ethNetwork)

    const env = new Environment()
      .setConfig(EnvironmentConfig.SERVER_PORT, port)
      .setConfig(EnvironmentConfig.LOG_LEVEL, 'off')

    const challengeSupervisor = new ChallengeSupervisor()
    const snapshotManager: ISnapshotManager = {
      getFullSnapshotMetadata() {
        throw new Error('not implemented')
      },
      getSnapshotMetadataPerEntityType() {
        throw new Error('not implemented')
      },
      async generateSnapshots() {}
    }

    const metrics = createTestMetricsComponent(metricsDeclaration)

    const controller = new Controller(
      { deployer, denylist, challengeSupervisor, snapshotManager, synchronizationManager, logs, metrics },
      ethNetwork
    )

    server = new Server({ env, controller, metrics, logs })

    await server.start()
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
    expect(deltas.length).toBe(1)
    const [controllerDelta] = deltas
    expect(controllerDelta.entityId).toBe(pointerChanges.entityId)
    expect(controllerDelta.entityType).toBe(pointerChanges.entityType)
    expect(controllerDelta.localTimestamp).toBe(pointerChanges.localTimestamp)
    const { changes } = controllerDelta
    expect(changes.length).toBe(1)
    const [change] = changes
    expect(change.pointer).toBe(entity1.pointers[0])
    expect(change.before).toBe(undefined)
    expect(change.after).toBe(entity1.id)
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
