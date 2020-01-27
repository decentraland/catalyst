import fetch from "node-fetch"
import { Environment, EnvironmentBuilder, EnvironmentConfig } from "@katalyst/content/Environment"
import { Server } from "@katalyst/content/Server"
import { Entity, EntityType } from "@katalyst/content/service/Entity"
import { ControllerEntity } from "@katalyst/content/controller/Controller"
import { MockedMetaverseContentServiceBuilder, buildContent } from "@katalyst/test-helpers/service/MockedMetaverseContentService"
import { MockedSynchronizationManager } from "@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager"
import { randomEntity } from "@katalyst/test-helpers/service/EntityTestFactory"

describe("unit tests in jasmine", function() {
    let env: Environment
    let server: Server
    const content = buildContent()
    const entity1 = randomEntity(EntityType.SCENE)
    const entity2 = randomEntity(EntityType.SCENE)

    beforeAll(async () => {
        env = await new EnvironmentBuilder()
            .withService(new MockedMetaverseContentServiceBuilder()
                .withEntity(entity1)
                .withEntity(entity2)
                .withContent(content)
                .build())
            .withSynchronizationManager(new MockedSynchronizationManager())
            .withConfig(EnvironmentConfig.METRICS, false)
            .build()
        server = new Server(env)
        await server.start()
    })
    afterAll(() => server.stop())

    it(`Get all scenes by id`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(EnvironmentConfig.SERVER_PORT)}/entities/scenes?id=${entity1.id}&id=${entity2.id}`)
        expect(response.ok).toBe(true)
        const scenes: ControllerEntity[] = await response.json();
        expect(scenes.length).toBe(2)
    });

    it(`Get all scenes by pointer`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(EnvironmentConfig.SERVER_PORT)}/entities/scenes?pointer=${entity1.pointers[0]}&pointer=${entity2.pointers[0]}`)
        expect(response.ok).toBe(true)
        const scenes: Entity[] = await response.json();
        expect(scenes.length).toBe(2)
        scenes.forEach(scene => {
            expect(scene.type).toBe(EntityType.SCENE)
        })
    });

    it(`Get does not support ids and pointers at the same time`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(EnvironmentConfig.SERVER_PORT)}/entities/scenes?id=1&pointer=A`)
        expect(response.status).toBe(400)
        const body = await response.json();
        expect(body.error).toBe("ids or pointers must be present, but not both")
    });

    it(`Get support profiles`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(EnvironmentConfig.SERVER_PORT)}/entities/profiles?id=1`)
        expect(response.ok).toBe(true)
    });

    it(`Get detects invalid entity types`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(EnvironmentConfig.SERVER_PORT)}/entities/invalids?id=1`)
        expect(response.ok).toBe(false)
        expect(response.status).toBe(400)
    });

    it(`Download Content`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(EnvironmentConfig.SERVER_PORT)}/contents/${content.hash}`)
        expect(response.ok).toBe(true)
        const buffer = await response.buffer()
        expect(buffer).toEqual(content.buffer)
    });

})