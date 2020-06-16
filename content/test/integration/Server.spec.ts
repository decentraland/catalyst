import fetch from "node-fetch"
import { EntityType, Entity as ControllerEntity } from "dcl-catalyst-commons"
import { Environment, EnvironmentConfig, Bean } from "@katalyst/content/Environment"
import { Server } from "@katalyst/content/Server"
import { Entity } from "@katalyst/content/service/Entity"
import { MockedMetaverseContentServiceBuilder, buildContent } from "@katalyst/test-helpers/service/MockedMetaverseContentService"
import { randomEntity } from "@katalyst/test-helpers/service/EntityTestFactory"
import { ControllerFactory } from "@katalyst/content/controller/ControllerFactory"
import { MockedSynchronizationManager } from "@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager"
import { NoOpMigrationManager } from "@katalyst/test-helpers/NoOpMigrationManager"
import { NoOpGarbageCollectionManager } from "@katalyst/test-helpers/service/garbage-collection/NoOpGarbageCollectionManager"

describe("Integration - Server", function() {
    let server: Server
    const content = buildContent()
    const entity1 = randomEntity(EntityType.SCENE)
    const entity2 = randomEntity(EntityType.SCENE)
    const port = 8080
    const address: string = `http://localhost:${port}`

    beforeAll(async () => {
        const service = new MockedMetaverseContentServiceBuilder()
            .withEntity(entity1)
            .withEntity(entity2)
            .withContent(content)
            .build()
        const env = new Environment()
            .registerBean(Bean.SERVICE, service)
            .registerBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
            .registerBean(Bean.MIGRATION_MANAGER, new NoOpMigrationManager())
            .registerBean(Bean.GARBAGE_COLLECTION_MANAGER, NoOpGarbageCollectionManager.build())
            .setConfig(EnvironmentConfig.SERVER_PORT, port)
            .setConfig(EnvironmentConfig.LOG_LEVEL, 'debug')

        const controller = ControllerFactory.create(env)
        env.registerBean(Bean.CONTROLLER, controller)
        server = new Server(env)
        await server.start()
    })

    afterAll(async () => await server.stop())

    it(`Get all scenes by id`, async () => {
        const response = await fetch(`${address}/entities/scenes?id=${entity1.id}&id=${entity2.id}`)
        expect(response.ok).toBe(true)
        const scenes: ControllerEntity[] = await response.json();
        expect(scenes.length).toBe(2)
    });

    it(`Get all scenes by pointer`, async () => {
        const response = await fetch(`${address}/entities/scenes?pointer=${entity1.pointers[0]}&pointer=${entity2.pointers[0]}`)
        expect(response.ok).toBe(true)
        const scenes: Entity[] = await response.json();
        expect(scenes.length).toBe(2)
        scenes.forEach(scene => {
            expect(scene.type).toBe(EntityType.SCENE)
        })
    });

    it(`Get does not support ids and pointers at the same time`, async () => {
        const response = await fetch(`${address}/entities/scenes?id=1&pointer=A`)
        expect(response.status).toBe(400)
        const body = await response.json();
        expect(body.error).toBe("ids or pointers must be present, but not both")
    });

    it(`Get support profiles`, async () => {
        const response = await fetch(`${address}/entities/profiles?id=1`)
        expect(response.ok).toBe(true)
    });

    it(`Get detects invalid entity types`, async () => {
        const response = await fetch(`${address}/entities/invalids?id=1`)
        expect(response.ok).toBe(false)
        expect(response.status).toBe(400)
    });

    it(`Download Content`, async () => {
        const response = await fetch(`${address}/contents/${content.hash}`)
        expect(response.ok).toBe(true)
        const buffer = await response.buffer()
        expect(buffer).toEqual(content.buffer)
    });

})