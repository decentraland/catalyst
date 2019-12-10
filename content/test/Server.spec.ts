import { Environment, STORAGE_ROOT_FOLDER, SERVER_PORT, Bean } from "../src/Environment"
import { ContentStorageFactory } from "../src/storage/ContentStorageFactory"
import { MockedService } from "./service/MockedService"
import { ControllerFactory } from "../src/controller/ControllerFactory"
import { Server } from "../src/Server"
import fetch from "node-fetch"
import { Entity, EntityType } from "../src/service/Entity"

describe("unit tests in jasmine", function() {
    const env = new Environment()

    env.setConfig(STORAGE_ROOT_FOLDER, "storage")
    env.setConfig(SERVER_PORT, process.env.PORT ?? 6969)

    env.registerBean(Bean.STORAGE, ContentStorageFactory.local(env))
    env.registerBean(Bean.SERVICE, new MockedService())
    env.registerBean(Bean.CONTROLLER, ControllerFactory.create(env))
    const server = new Server(env)
    server.start()

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

})