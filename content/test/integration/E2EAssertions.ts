import { Authenticator } from "dcl-crypto"
import assert from "assert"
import { Response } from "node-fetch"
import { LegacyDeploymentEvent, Timestamp, ServerAddress, ContentFileHash, Hashing, Deployment as ControllerDeployment, Entity as ControllerEntity, EntityContentItemReference, AuditInfo, EntityVersion } from "dcl-catalyst-commons"
import { TestServer } from "./TestServer"
import { assertPromiseIsRejected, assertPromiseRejectionGeneric } from "../helpers/PromiseAssertions"
import { DeployData } from "./E2ETestUtils"
import { FailedDeployment, FailureReason } from "@katalyst/content/service/errors/FailedDeploymentsManager"


export async function assertEntitiesAreDeployedButNotActive(server: TestServer, ...entities: ControllerEntity[]) {
    // Legacy check
    for (const entity of entities) {
        const entities: ControllerEntity[] = await server.getEntitiesByPointers(entity.type, entity.pointers)
        const unexpectedEntities = entities.filter(({ id }) => id === entity.id)
        assert.equal(unexpectedEntities.length, 0, `Expected not to find entity with id ${entity.id} when checking for pointer ${entity.pointers} on server '${server.getAddress()}.'`)
        await assertEntityIsOnServer(server, entity)
    }

    // Deployments check
    const entityIds = entities.map(({ id }) => id)
    const deployments = await server.getDeployments({ entityIds })
    assert.equal(deployments.length, entities.length)
    for (const deployment of deployments) {
        assert.notEqual(deployment.auditInfo.overwrittenBy, undefined)
        await assertFileIsOnServer(server, deployment.entityId)
    }
}

export async function assertEntityWasNotDeployed(server: TestServer, entity: ControllerEntity) {
    await assertFileIsNotOnServer(server, entity.id)

    // Legacy check
    const content: EntityContentItemReference[] = (entity.content ?? [])
    await Promise.all(content.map(({ hash }) => assertFileIsNotOnServer(server, hash)))
    const entities = await server.getEntitiesByIds(entity.type, entity.id)
    assert.equal(entities.length, 0)

    // Deployments check
    const deployments = await server.getDeployments({ entityIds: [entity.id] })
    assert.equal(deployments.length, 0)
}

export async function assertEntitiesAreActiveOnServer(server: TestServer, ...entities: ControllerEntity[]) {
    // Legacy check
    for (const entity of entities) {
        const entitiesByPointer = await server.getEntitiesByPointers(entity.type, entity.pointers)
        assert.deepStrictEqual(entitiesByPointer, [entity])
        await assertEntityIsOnServer(server, entity)
    }

    // Deployments check
    const entitiesById = new Map(entities.map((entity) => [ entity.id, entity ]))
    const allPointers = entities.map(({ pointers }) => pointers).reduce((accum, curr) => accum.concat(curr), [])
    const deployments = await server.getDeployments({ pointers: allPointers, onlyCurrentlyPointed: true })
    assert.equal(deployments.length, entities.length)
    for (const deployment of deployments) {
        assertEntityIsTheSameAsDeployment(entitiesById.get(deployment.entityId)!!, deployment)
        assert.equal(deployment.auditInfo.overwrittenBy, undefined)
        await assertFileIsOnServer(server, deployment.entityId)
    }
}

/** Please set the expected events from older to newer */
export async function assertHistoryOnServerHasEvents(server: TestServer, ...expectedEvents: LegacyDeploymentEvent[]) {
    const { events: deploymentHistory } = await server.getHistory()
    assert.equal(deploymentHistory.length, expectedEvents.length, `Expected to find ${expectedEvents.length} deployments in history on server ${server.getAddress()}. Instead, found ${deploymentHistory.length}.`)
    const { historySize } = await server.getStatus()
    assert.equal(historySize, expectedEvents.length, `Expected to find a history of size ${expectedEvents.length} on the status on ${server.getAddress()}. Instead, found ${historySize}.`)
    for (let i = 0; i < expectedEvents.length; i++) {
        const expectedEvent: LegacyDeploymentEvent = expectedEvents[expectedEvents.length - 1 - i]
        const actualEvent: LegacyDeploymentEvent = deploymentHistory[i]
        assertEqualsDeploymentEvent(actualEvent, expectedEvent)
    }
}

export async function assertDeploymentsAreReported(server: TestServer, ...expectedDeployments: ControllerDeployment[]) {
    const deployments = await server.getDeployments()
    assert.equal(deployments.length, expectedDeployments.length, `Expected to find ${expectedDeployments.length} deployments on server ${server.getAddress()}. Instead, found ${deployments.length}.`)

    // Make sure that deployments are sorted per descending local timestamp
    for (let i = 1; i < deployments.length; i++) {
        assert.ok(deployments[i - 1].auditInfo.localTimestamp > deployments[i].auditInfo.localTimestamp)
    }

    // Sort deployments by ascending origin timestamp
    const sortedDeployments = deployments.sort((a, b) => (a.auditInfo.originTimestamp > b.auditInfo.originTimestamp) ? 1 : -1)

    // Compare deployments
    for (let i = 0; i < expectedDeployments.length; i++) {
        const expectedEvent: ControllerDeployment = expectedDeployments[i]
        const actualEvent: ControllerDeployment = sortedDeployments[i]
        assertEqualsDeployment(server, actualEvent, expectedEvent)
    }
}

export function assertDeploymentFailsWith(promiseExecution: () => Promise<any>, errorMessage: string) {
    return assertPromiseRejectionGeneric(promiseExecution, (error) => {
        console.log(error)
        expect(error.endsWith(`Got status 500. Response was '${errorMessage}'`)).toBeTruthy()
    })
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

function assertEqualsDeployment(server: TestServer, actualDeployment: ControllerDeployment, expectedDeployment: ControllerDeployment) {
    assert.equal(actualDeployment.entityType, expectedDeployment.entityType)
    assert.equal(actualDeployment.entityId, expectedDeployment.entityId)
    assert.deepEqual(actualDeployment.pointers, expectedDeployment.pointers)
    assert.equal(actualDeployment.entityTimestamp, expectedDeployment.entityTimestamp)
    assert.deepEqual(actualDeployment.content, expectedDeployment.content)
    assert.deepEqual(actualDeployment.metadata, expectedDeployment.metadata)
    assert.equal(actualDeployment.deployedBy, expectedDeployment.deployedBy)
    assert.equal(actualDeployment.auditInfo.version, expectedDeployment.auditInfo.version)
    assert.deepEqual(actualDeployment.auditInfo.authChain, expectedDeployment.auditInfo.authChain)
    assert.equal(actualDeployment.auditInfo.originServerUrl, expectedDeployment.auditInfo.originServerUrl)
    assert.equal(actualDeployment.auditInfo.originTimestamp, expectedDeployment.auditInfo.originTimestamp)
    assert.deepEqual(actualDeployment.auditInfo.migrationData, expectedDeployment.auditInfo.migrationData)
    assert.equal(actualDeployment.auditInfo.isDenylisted, expectedDeployment.auditInfo.isDenylisted)
    assert.deepEqual(actualDeployment.auditInfo.denylistedContent, expectedDeployment.auditInfo.denylistedContent)
    if (server.getAddress() === actualDeployment.auditInfo.originServerUrl) {
        assert.equal(actualDeployment.auditInfo.localTimestamp, expectedDeployment.auditInfo.localTimestamp)
    } else {
        assert.ok(actualDeployment.auditInfo.localTimestamp >= expectedDeployment.auditInfo.localTimestamp)
    }
}

function assertEqualsDeploymentEvent(actualEvent: LegacyDeploymentEvent, expectedEvent: LegacyDeploymentEvent) {
    assert.equal(actualEvent.entityId, expectedEvent.entityId)
    assert.equal(actualEvent.entityType, expectedEvent.entityType)
    assert.equal(actualEvent.timestamp, expectedEvent.timestamp)
    assert.equal(actualEvent.serverName, expectedEvent.serverName)
}

async function assertEntityIsOnServer(server: TestServer, entity: ControllerEntity) {
    const fetchedEntity: ControllerEntity = await server.getEntityById(entity.type, entity.id)
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
    // Legacy check
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    assert.equal(auditInfo.overwrittenBy, overwrittenBy.id)

    // Deployments check
    const deployment = await getEntitysDeployment(server, entity)
    assert.equal(deployment.auditInfo.overwrittenBy, overwrittenBy.id)
}

export async function assertEntityIsNotOverwritten(server: TestServer, entity: ControllerEntity) {
    // Legacy check
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    assert.equal(auditInfo.overwrittenBy, undefined)

    // Deployments check
    const deployment = await getEntitysDeployment(server, entity)
    assert.equal(deployment.auditInfo.overwrittenBy, undefined)
}


export async function assertEntityIsNotDenylisted(server: TestServer, entity: ControllerEntity) {
    // Legacy check
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    assert.equal(auditInfo.isDenylisted, undefined)

    // Deployments check
    const deployment = await getEntitysDeployment(server, entity)
    assert.equal(deployment.auditInfo.isDenylisted, undefined)
}

export async function assertEntityIsDenylisted(server: TestServer, entity: ControllerEntity) {
    // Legacy check
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    assert.ok(auditInfo.isDenylisted)

    // Deployments check
    const deployment = await getEntitysDeployment(server, entity)
    assert.ok(deployment.auditInfo.isDenylisted)
}

export async function assertContentNotIsDenylisted(server: TestServer, entity: ControllerEntity, contentHash: ContentFileHash) {
    // Legacy check
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    assert.ok(!auditInfo.denylistedContent || !auditInfo.denylistedContent.includes(contentHash))

    // Deployments check
    const deployment = await getEntitysDeployment(server, entity)
    assert.ok(!deployment.auditInfo.denylistedContent || !deployment.auditInfo.denylistedContent.includes(contentHash))
}

export async function assertContentIsDenylisted(server: TestServer, entity: ControllerEntity, contentHash: ContentFileHash) {
    // Legacy check
    const auditInfo: AuditInfo = await server.getAuditInfo(entity)
    assert.ok(auditInfo.denylistedContent!!.includes(contentHash))

    // Deployments check
    const deployment = await getEntitysDeployment(server, entity)
    assert.ok(deployment.auditInfo.denylistedContent!!.includes(contentHash))
}

export function buildDeployment(deployData: DeployData, entity: ControllerEntity, server: TestServer, deploymentTimestamp: Timestamp): ControllerDeployment {
    return {
        ...entity,
        content: entity.content ? entity.content.map(({ file, hash }) => ({ key: file, hash })) : [],
        entityType: entity.type,
        entityId: entity.id,
        entityTimestamp: entity.timestamp,
        deployedBy: Authenticator.ownerAddress(deployData.authChain),
        auditInfo: {
            version: EntityVersion.V3,
            originServerUrl: server.getAddress(),
            originTimestamp: deploymentTimestamp,
            localTimestamp: deploymentTimestamp,
            authChain: deployData.authChain
        }
    }
}

export function buildEvent(entity: ControllerEntity, server: TestServer, timestamp: Timestamp): LegacyDeploymentEvent {
    return buildEventWithName(entity, encodeURIComponent(server.getAddress()), timestamp)
}

export function buildEventWithName(entity: ControllerEntity, name: string, timestamp: Timestamp): LegacyDeploymentEvent {
    return {
        serverName: name,
        entityId: entity.id,
        entityType: entity.type,
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

function assertEntityIsTheSameAsDeployment(entity: ControllerEntity, deployment: ControllerDeployment) {
    assert.strictEqual(entity.id, deployment.entityId)
    assert.strictEqual(entity.type, deployment.entityType)
    assert.strictEqual(entity.timestamp, deployment.entityTimestamp)
    assert.deepStrictEqual(entity.pointers, deployment.pointers)
    assert.deepStrictEqual(entity.metadata, deployment.metadata)
    const mappedContent = entity.content?.map(({ file, hash }) => ({ key: file, hash }))
    if (mappedContent) {
        assert.deepStrictEqual(mappedContent, deployment.content)
    } else {
        assert.ok(deployment.content === undefined || deployment.content.length === 0)
    }
}

async function getEntitysDeployment(server: TestServer, entity: ControllerEntity): Promise<ControllerDeployment> {
    const deployments = await server.getDeployments({ entityIds: [ entity.id ] })
    assert.equal(deployments.length, 1)
    const [ deployment ] = deployments
    return deployment
}

export async function assertResponseIsOkOrThrow(response: Response) {
    if (!response.ok) {
        throw new Error(await response.text())
    }
}