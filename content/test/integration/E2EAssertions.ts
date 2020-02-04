import { TestServer } from "./TestServer"
import { ControllerEntity } from "@katalyst/content/controller/Controller"
import { EntityId, EntityType } from "@katalyst/content/service/Entity"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { DeploymentEvent, DeploymentHistory } from "@katalyst/content/service/history/HistoryManager"
import { Hashing, ContentFileHash } from "@katalyst/content/service/Hashing"
import { AuditInfo } from "@katalyst/content/service/audit/Audit"
import { assertPromiseIsRejected } from "../helpers/PromiseAssertions"

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
        expect(await server.getEntitiesByPointers(entityType, entity.pointers)).toEqual([entity])
        await assertEntityIsOnServer(server, entityType, entity.id)
    }
}

/** Please set the expected events from older to newer */
export async function assertHistoryOnServerHasEvents(server: TestServer, ...expectedEvents: DeploymentEvent[]) {
    const deploymentHistory: DeploymentHistory = (await server.getHistory()).events
    expect(deploymentHistory.length).toEqual(expectedEvents.length, `Expected ${server.namePrefix} to have ${expectedEvents.length} deployments in history`)
    for (let i = 0; i < expectedEvents.length; i++) {
        const expectedEvent: DeploymentEvent = expectedEvents[expectedEvents.length - 1 - i]
        const actualEvent: DeploymentEvent = deploymentHistory[i]
        expect(actualEvent.entityId).toBe(expectedEvent.entityId)
        expect(actualEvent.entityType).toBe(expectedEvent.entityType)
        expect(actualEvent.timestamp).toBe(expectedEvent.timestamp)
        expect(actualEvent.serverName.startsWith(expectedEvent.serverName)).toBeTruthy()
    }
}

export async function assertEntityIsOnServer(server: TestServer, entityType: string, entityId: EntityId) {
    const entity: ControllerEntity = await server.getEntityById(entityType, entityId)
    return assertFileIsOnServer(server, entity.id)
}

export async function assertFileIsOnServer(server: TestServer, hash: ContentFileHash) {
    const content = await server.downloadContent(hash)
    const downloadedContentHash = await Hashing.calculateBufferHash(content)
    expect(downloadedContentHash).toEqual(hash)
}

export async function assertFileIsNotOnServer(server: TestServer, hash: ContentFileHash) {
    assertPromiseIsRejected(() => server.downloadContent(hash))
}

export async function assertEntityIsOverwrittenBy(server: TestServer, entity: ControllerEntity, overwrittenBy: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(parseEntityType(entity), entity.id)
    expect(auditInfo.overwrittenBy).toEqual(overwrittenBy.id)
}

export async function assertEntityIsNotOverwritten(server: TestServer, entity: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(parseEntityType(entity), entity.id)
    expect(auditInfo.overwrittenBy).toBeUndefined()
}


export async function assertEntityIsNotBlacklisted(server: TestServer, entity: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(parseEntityType(entity), entity.id)
    expect(auditInfo.isBlacklisted).toBeUndefined()
}

export async function assertEntityIsBlacklisted(server: TestServer, entity: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(parseEntityType(entity), entity.id)
    expect(auditInfo.isBlacklisted).toBeTruthy()
}

export async function assertContentNotIsBlacklisted(server: TestServer, entity: ControllerEntity, contentHash: ContentFileHash) {
    const auditInfo: AuditInfo = await server.getAuditInfo(parseEntityType(entity), entity.id)
    expect(auditInfo.blacklistedContent).not.toContain(contentHash)
}

export async function assertContentIsBlacklisted(server: TestServer, entity: ControllerEntity, contentHash: ContentFileHash) {
    const auditInfo: AuditInfo = await server.getAuditInfo(parseEntityType(entity), entity.id)
    expect(auditInfo.blacklistedContent).toContain(contentHash)
}

export function buildEvent(entity: ControllerEntity, server: TestServer, timestamp: Timestamp): DeploymentEvent {
    return {
        serverName: server.namePrefix,
        entityId: entity.id,
        entityType: EntityType[entity.type.toUpperCase().trim()],
        timestamp,
    }
}

export function assertRequiredFieldsOnEntitiesAreEqual(entity1: ControllerEntity, entity2: ControllerEntity) {
    expect(entity1.id).toEqual(entity2.id)
    expect(entity1.type).toEqual(entity2.type)
    expect(entity1.pointers).toEqual(entity2.pointers)
    expect(entity1.timestamp).toEqual(entity2.timestamp)
}

export function assertFieldsOnEntitiesExceptIdsAreEqual(entity1: ControllerEntity, entity2: ControllerEntity) {
    expect(entity1.type).toEqual(entity2.type)
    expect(entity1.pointers).toEqual(entity2.pointers)
    expect(entity1.timestamp).toEqual(entity2.timestamp)
    expect(entity1.content).toEqual(entity2.content)
    expect(entity1.metadata).toEqual(entity2.metadata)
}

function parseEntityType(entity: ControllerEntity) {
    return EntityType[entity.type.toUpperCase().trim()]
}