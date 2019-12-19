import { Environment, SERVER_PORT, EnvironmentBuilder } from "../src/Environment"
import { MockedService } from "./service/MockedService"
import { Server } from "../src/Server"
import fetch from "node-fetch"
import { Entity, EntityType } from "../src/service/Entity"
import { MockedSynchronizationManager } from "./service/synchronization/MockedSynchronizationManager"

describe("unit tests in jasmine", function() {
    let env: Environment
    let server: Server

    beforeAll(async () => {
        env = await new EnvironmentBuilder()
            .withService(new MockedService())
            .withSynchronizationManager(new MockedSynchronizationManager())
            .build()
        server = new Server(env)
        await server.start()
    })
    afterAll(() => server.stop())

    it(`Get all scenes by id`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/entities/scenes?id=1&id=2`)
        expect(response.ok).toBe(true)
        const scenes: Entity[] = await response.json();
        expect(scenes.length).toBe(2)
        scenes.forEach(scene => {
            expect(scene.type).toBe(EntityType.SCENE)
        })
    });

    it(`Get all scenes by pointer`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/entities/scenes?pointer=A&pointer=B`)
        expect(response.ok).toBe(true)
        const scenes: Entity[] = await response.json();
        expect(scenes.length).toBe(2)
        scenes.forEach(scene => {
            expect(scene.type).toBe(EntityType.SCENE)
        })
    });

    it(`Get does not support ids and pointers at the same time`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/entities/scenes?id=1&pointer=A`)
        expect(response.status).toBe(400)
        const body = await response.json();
        expect(body.error).toBe("ids or pointers must be present, but not both")
    });

    it(`Get support profiles`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/entities/profiles?id=1`)
        expect(response.ok).toBe(true)
    });

    it(`Get support wearables`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/entities/wearables?id=1`)
        expect(response.ok).toBe(true)
    });

    it(`Get detects invalid entity types`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/entities/invalids?id=1`)
        expect(response.ok).toBe(false)
        expect(response.status).toBe(400)
    });

    it(`Download Content`, async () => {
        const response = await fetch(`http://localhost:${env.getConfig(SERVER_PORT)}/contents/some-file-hash`)
        expect(response.ok).toBe(true)
        const buffer = await response.buffer()
        expect(buffer).toEqual(Buffer.from([1,2,3]))
    });

})