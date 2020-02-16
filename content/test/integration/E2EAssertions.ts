import { Response } from "node-fetch"
import { TestServer } from "./TestServer"
import { ControllerEntity, ControllerEntityContent } from "@katalyst/content/controller/Controller"
import { EntityType } from "@katalyst/content/service/Entity"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { DeploymentEvent, DeploymentHistory } from "@katalyst/content/service/history/HistoryManager"
import { Hashing, ContentFileHash } from "@katalyst/content/service/Hashing"
import { AuditInfo } from "@katalyst/content/service/audit/Audit"
import { assertPromiseIsRejected } from "../helpers/PromiseAssertions"
import { parseEntityType } from "./E2ETestUtils"

export async function assertEntitiesAreDeployedButNotActive(server: TestServer, ...entities: ControllerEntity[]) {
    for (const entity of entities) {
        const entityType = parseEntityType(entity)
        const entities: ControllerEntity[] = await server.getEntitiesByPointers(entityType, entity.pointers)
        expect(entities).not.toContain(entity, `Failed on server with prefix ${server.namePrefix}, when checking for pointers ${entity.pointers}`)
        await assertEntityIsOnServer(server, entity)
    }
}

export async function assertEntityWasNotDeployed(server: TestServer, entity: ControllerEntity) {
    await assertFileIsNotOnServer(server, entity.id)
    const content: ControllerEntityContent[] = (entity.content ?? [])
    await Promise.all(content.map(({ hash }) => assertFileIsNotOnServer(server, hash)))
    const entities = await server.getEntitiesByIds(entity.type, entity.id)
    expect(entities.length).toBe(0)
}

export async function assertEntitiesAreActiveOnServer(server: TestServer, ...entities: ControllerEntity[]) {
    for (const entity of entities) {
        const entityType = parseEntityType(entity)
        expect(await server.getEntitiesByPointers(entityType, entity.pointers)).toEqual([entity])
        await assertEntityIsOnServer(server, entity)
    }
}

/** Please set the expected events from older to newer */
export async function assertHistoryOnServerHasEvents(server: TestServer, ...expectedEvents: DeploymentEvent[]) {
    const deploymentHistory: DeploymentHistory = (await server.getHistory()).events
    expect(deploymentHistory.length).toEqual(expectedEvents.length, `Expected ${server.namePrefix} to have ${expectedEvents.length} deployments in history`)
    for (let i = 0; i < expectedEvents.length; i++) {
        const expectedEvent: DeploymentEvent = expectedEvents[expectedEvents.length - 1 - i]
        const actualEvent: DeploymentEvent = deploymentHistory[i]
        assertEqualsDeployment(actualEvent, expectedEvent)
    }
}

export function assertEqualsDeployment(actualEvent: DeploymentEvent, expectedEvent: DeploymentEvent) {
    expect(actualEvent.entityId).toBe(expectedEvent.entityId)
    expect(actualEvent.entityType).toBe(expectedEvent.entityType)
    expect(actualEvent.timestamp).toBe(expectedEvent.timestamp)
    expect(actualEvent.serverName.startsWith(expectedEvent.serverName)).toBeTruthy()
}

async function assertEntityIsOnServer(server: TestServer, entity: ControllerEntity) {
    const fetchedEntity: ControllerEntity = await server.getEntityById(parseEntityType(entity), entity.id)
    expect(fetchedEntity).toEqual(entity)
    return assertFileIsOnServer(server, entity.id)
}

export async function assertFileIsOnServer(server: TestServer, hash: ContentFileHash) {
    const content = await server.downloadContent(hash)
    const downloadedContentHash = await Hashing.calculateBufferHash(content)
    expect(downloadedContentHash).toEqual(hash)
}

export async function assertFileIsNotOnServer(server: TestServer, hash: ContentFileHash) {
    await assertPromiseIsRejected(() => server.downloadContent(hash))
}

export async function assertEntityIsOverwrittenBy(server: TestServer, entity: ControllerEntity, overwrittenBy: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    expect(auditInfo.overwrittenBy).toEqual(overwrittenBy.id)
}

export async function assertEntityIsNotOverwritten(server: TestServer, entity: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    expect(auditInfo.overwrittenBy).toBeUndefined()
}


export async function assertEntityIsNotDenylisted(server: TestServer, entity: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    expect(auditInfo.isDenylisted).toBeUndefined()
}

export async function assertEntityIsDenylisted(server: TestServer, entity: ControllerEntity) {
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    expect(auditInfo.isDenylisted).toBeTruthy()
}

export async function assertContentNotIsDenylisted(server: TestServer, entity: ControllerEntity, contentHash: ContentFileHash) {
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    expect(auditInfo.denylistedContent).not.toContain(contentHash)
}

export async function assertContentIsDenylisted(server: TestServer, entity: ControllerEntity, contentHash: ContentFileHash) {
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    expect(auditInfo.denylistedContent).toContain(contentHash)
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

export async function assertResponseIsOkOrThrown(response: Response) {
    if (!response.ok) {
        throw new Error(await response.text())
    }
}