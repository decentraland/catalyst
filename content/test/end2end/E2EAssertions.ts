import { TestServer } from "./TestServer"
import { ControllerEntity } from "../../src/controller/Controller"
import { Pointer, EntityId, EntityType } from "../../src/service/Entity"
import { Timestamp } from "../../src/service/Service"
import { DeploymentEvent, DeploymentHistory } from "../../src/service/history/HistoryManager"
import { Hashing } from "../../src/service/Hashing"
import { AuditInfo } from "../../src/service/audit/Audit"

export async function assertEntitiesAreDeployedButNotActive(server: TestServer, ...entities: ControllerEntity[]) {
    for (const entity of entities) {
        const entityType = parseEntityType(entity)
        const entities: ControllerEntity[] = await server.getEntitiesByPointers(entityType, entity.pointers)
        expect(entities).not.toContain(entity, `Failed on server with prefix ${server.namePrefix}, when checking for pointers ${entity.pointers}`)
        await assertEntityIsOnServer(server, entityType, entity.id)
    }
}

export async function assertEntitiesAreActiveOnServer(server: TestServer, ...entities: ControllerEntity[]) {
    for (const entity of entities) {
        const entityType = parseEntityType(entity)
        const activePointers: Pointer[] = await server.getActivePointers(entityType)
        entity.pointers.forEach(pointer => expect(activePointers).toContain(pointer, `Failed on server ${server.namePrefix}`))
        expect(await server.getEntitiesByPointers(entityType, entity.pointers)).toEqual([entity])
        await assertEntityIsOnServer(server, entityType, entity.id)
    }
}

/** Please set the expected events from older to newer */
export async function assertHistoryOnServerHasEvents(server: TestServer, ...expectedEvents: DeploymentEvent[]) {
    const deploymentHistory: DeploymentHistory = await server.getHistory()
    expect(deploymentHistory.length).toEqual(expectedEvents.length)
    for (let i = 0; i < expectedEvents.length; i++) {
        const expectedEvent: DeploymentEvent = expectedEvents[expectedEvents.length - 1 - i]
        const actualEvent: DeploymentEvent = deploymentHistory[i]
        expect(actualEvent.entityId).toBe(expectedEvent.entityId)
        expect(actualEvent.entityType).toBe(expectedEvent.entityType)
        expect(actualEvent.timestamp).toBe(expectedEvent.timestamp)
        expect(actualEvent.serverName.startsWith(expectedEvent.serverName)).toBeTruthy()
    }
}

export async function assertEntityIsOnServer(server: TestServer, entityType: EntityType, entityId: EntityId) {
    const entity: ControllerEntity = await server.getEntityById(entityType, entityId)
    const content = await server.downloadContent(entity.id)
    const downloadedContentHash = await Hashing.calculateBufferHash(content)
    expect(downloadedContentHash).toEqual(entityId)
}

export async function assertEntityIsOverwrittenBy(server: TestServer, entity: ControllerEntity, overwrittenBy: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(parseEntityType(entity), entity.id)
    expect(auditInfo.overwrittenBy).toEqual(overwrittenBy.id)
}

export async function assertEntityIsNotOverwritten(server: TestServer, entity: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(parseEntityType(entity), entity.id)
    expect(auditInfo.overwrittenBy).toBeUndefined()
}

export function buildEvent(entity: ControllerEntity, server: TestServer, timestamp: Timestamp): DeploymentEvent {
    return {
        serverName: server.namePrefix,
        entityId: entity.id,
        entityType: EntityType[entity.type.toUpperCase().trim()],
        timestamp,
    }
}

function parseEntityType(entity: ControllerEntity) {
    return EntityType[entity.type.toUpperCase().trim()]
}