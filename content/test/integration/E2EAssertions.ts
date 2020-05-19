import assert from "assert"
import { Response } from "node-fetch"
import { TestServer } from "./TestServer"
import { ControllerEntity, ControllerEntityContent } from "@katalyst/content/controller/Controller"
import { EntityType } from "@katalyst/content/service/Entity"
import { Timestamp } from "@katalyst/content/service/time/TimeSorting"
import { LegacyDeploymentEvent, LegacyDeploymentHistory } from "@katalyst/content/service/history/HistoryManager"
import { Hashing, ContentFileHash } from "@katalyst/content/service/Hashing"
import { LegacyAuditInfo } from "@katalyst/content/service/Audit"
import { assertPromiseIsRejected } from "../helpers/PromiseAssertions"
import { parseEntityType } from "./E2ETestUtils"
import { FailedDeployment, FailureReason } from "@katalyst/content/service/errors/FailedDeploymentsManager"
import { ServerAddress } from "@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient"


export async function assertEntitiesAreDeployedButNotActive(server: TestServer, ...entities: ControllerEntity[]) {
    for (const entity of entities) {
        const entityType = parseEntityType(entity)
        const entities: ControllerEntity[] = await server.getEntitiesByPointers(entityType, entity.pointers)
        const unexpectedEntities = entities.filter(({ id }) => id === entity.id)
        assert.equal(unexpectedEntities.length, 0, `Expected not to find entity with id ${entity.id} when checking for pointer ${entity.pointers} on server '${server.getAddress()}.'`)
        await assertEntityIsOnServer(server, entity)
    }
}

export async function assertEntityWasNotDeployed(server: TestServer, entity: ControllerEntity) {
    await assertFileIsNotOnServer(server, entity.id)
    const content: ControllerEntityContent[] = (entity.content ?? [])
    await Promise.all(content.map(({ hash }) => assertFileIsNotOnServer(server, hash)))
    const entities = await server.getEntitiesByIds(entity.type, entity.id)
    assert.equal(entities.length, 0)
}

export async function assertEntitiesAreActiveOnServer(server: TestServer, ...entities: ControllerEntity[]) {
    for (const entity of entities) {
        const entityType = parseEntityType(entity)
        const entitiesByPointer = await server.getEntitiesByPointers(entityType, entity.pointers)
        assert.deepStrictEqual(entitiesByPointer, [entity])
        await assertEntityIsOnServer(server, entity)
    }
}

/** Please set the expected events from older to newer */
export async function assertHistoryOnServerHasEvents(server: TestServer, ...expectedEvents: LegacyDeploymentEvent[]) {
    const deploymentHistory: LegacyDeploymentHistory = (await server.getHistory()).events
    assert.equal(deploymentHistory.length, expectedEvents.length, `Expected to find ${expectedEvents.length} deployments in history on server ${server.getAddress()}. Instead, found ${deploymentHistory.length}.`)
    const { historySize } = await server.getStatus()
    assert.equal(historySize, expectedEvents.length, `Expected to find a history of size ${expectedEvents.length} on the status on ${server.getAddress()}. Instead, found ${historySize}.`)
    for (let i = 0; i < expectedEvents.length; i++) {
        const expectedEvent: LegacyDeploymentEvent = expectedEvents[expectedEvents.length - 1 - i]
        const actualEvent: LegacyDeploymentEvent = deploymentHistory[i]
        assertEqualsDeployment(actualEvent, expectedEvent)
    }
}

export async function assertThereIsAFailedDeployment(server: TestServer): Promise<FailedDeployment> {
    const failedDeployments: FailedDeployment[] = await server.getFailedDeployments()
    assert.equal(failedDeployments.length, 1)
    return failedDeployments[0]
}

export async function assertDeploymentFailed(server: TestServer, reason: FailureReason, entity: ControllerEntity, originTimestamp: Timestamp, originServerUrl: ServerAddress) {
    const failedDeployment = await assertThereIsAFailedDeployment(server)
    assert.equal(failedDeployment.entityType, entity.type)
    assert.equal(failedDeployment.entityId, entity.id)
    assert.equal(failedDeployment.originTimestamp, originTimestamp)
    assert.equal(failedDeployment.originServerUrl, originServerUrl)
    assert.equal(failedDeployment.reason, reason)
    assert.ok(failedDeployment.failureTimestamp > originTimestamp)
}

function assertEqualsDeployment(actualEvent: LegacyDeploymentEvent, expectedEvent: LegacyDeploymentEvent) {
    assert.equal(actualEvent.entityId, expectedEvent.entityId)
    assert.equal(actualEvent.entityType, expectedEvent.entityType)
    assert.equal(actualEvent.timestamp, expectedEvent.timestamp)
    assert.ok(actualEvent.serverName.startsWith(expectedEvent.serverName))
}

async function assertEntityIsOnServer(server: TestServer, entity: ControllerEntity) {
    const fetchedEntity: ControllerEntity = await server.getEntityById(parseEntityType(entity), entity.id)
    assert.deepStrictEqual(fetchedEntity, entity)
    return assertFileIsOnServer(server, entity.id)
}

export async function assertFileIsOnServer(server: TestServer, hash: ContentFileHash) {
    const content = await server.downloadContent(hash)
    const downloadedContentHash = await Hashing.calculateBufferHash(content)
    assert.equal(downloadedContentHash, hash)
}

export async function assertFileIsNotOnServer(server: TestServer, hash: ContentFileHash) {
    await assertPromiseIsRejected(() => server.downloadContent(hash))
}

export async function assertEntityIsOverwrittenBy(server: TestServer, entity: ControllerEntity, overwrittenBy: ControllerEntity) {
    const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
    assert.equal(auditInfo.overwrittenBy, overwrittenBy.id)
}

export async function assertEntityIsNotOverwritten(server: TestServer, entity: ControllerEntity) {
    const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
    assert.equal(auditInfo.overwrittenBy, undefined)
}


export async function assertEntityIsNotDenylisted(server: TestServer, entity: ControllerEntity) {
    const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
    assert.equal(auditInfo.isDenylisted, undefined)
}

export async function assertEntityIsDenylisted(server: TestServer, entity: ControllerEntity) {
    const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
    assert.ok(auditInfo.isDenylisted)
}

export async function assertContentNotIsDenylisted(server: TestServer, entity: ControllerEntity, contentHash: ContentFileHash) {
    const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
    assert.ok(!auditInfo.denylistedContent || !auditInfo.denylistedContent.includes(contentHash))
}

export async function assertContentIsDenylisted(server: TestServer, entity: ControllerEntity, contentHash: ContentFileHash) {
    const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
    assert.ok(auditInfo.denylistedContent!!.includes(contentHash))
}

export function buildEvent(entity: ControllerEntity, server: TestServer, timestamp: Timestamp): LegacyDeploymentEvent {
    return buildEventWithName(entity, server.namePrefix, timestamp)
}

export function buildEventWithName(entity: ControllerEntity, name: string, timestamp: Timestamp): LegacyDeploymentEvent {
    return {
        serverName: name,
        entityId: entity.id,
        entityType: EntityType[entity.type.toUpperCase().trim()],
        timestamp,
    }
}

export function assertRequiredFieldsOnEntitiesAreEqual(entity1: ControllerEntity, entity2: ControllerEntity) {
    assert.equal(entity1.id, entity2.id)
    assert.equal(entity1.type, entity2.type)
    assert.deepStrictEqual(entity1.pointers, entity2.pointers)
    assert.equal(entity1.timestamp, entity2.timestamp)
}

export function assertFieldsOnEntitiesExceptIdsAreEqual(entity1: ControllerEntity, entity2: ControllerEntity) {
    assert.equal(entity1.type, entity2.type)
    assert.deepStrictEqual(entity1.pointers, entity2.pointers)
    assert.equal(entity1.timestamp, entity2.timestamp)
    assert.deepStrictEqual(entity1.content, entity2.content)
    assert.deepStrictEqual(entity1.metadata, entity2.metadata)
}

export async function assertResponseIsOkOrThrow(response: Response) {
    if (!response.ok) {
        throw new Error(await response.text())
    }
}