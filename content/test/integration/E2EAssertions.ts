import assert from 'assert'
import { DeploymentData } from 'dcl-catalyst-client'
import {
  ContentFileHash,
  Deployment as ControllerDeployment,
  Entity as ControllerEntity,
  EntityContentItemReference,
  EntityVersion,
  Hashing,
  LegacyAuditInfo,
  Timestamp
} from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import { Response } from 'node-fetch'
import { FailedDeployment, FailureReason } from '../../src/ports/failedDeploymentsCache'
import { DeploymentResult, isSuccessfulDeployment } from '../../src/service/Service'
import { assertPromiseIsRejected, assertPromiseRejectionGeneric } from '../helpers/PromiseAssertions'
import { TestProgram } from './TestProgram'

export async function assertEntitiesAreDeployedButNotActive(server: TestProgram, ...entities: ControllerEntity[]) {
  // Legacy check
  for (const entity of entities) {
    const entities: ControllerEntity[] = await server.getEntitiesByPointers(entity.type, entity.pointers)
    const unexpectedEntities = entities.filter(({ id }) => id === entity.id)
    assert.equal(
      unexpectedEntities.length,
      0,
      `Expected not to find entity with id ${entity.id} when checking for pointer ${
        entity.pointers
      } on server '${server.getUrl()}.'`
    )
    await assertEntityIsOnServer(server, entity)
  }

  // Deployments check
  const entityIds = entities.map(({ id }) => id)
  const deployments = await server.getDeployments({ filters: { entityIds } })
  assert.equal(deployments.length, entities.length)
  for (const deployment of deployments) {
    assert.notEqual(deployment.auditInfo.overwrittenBy, undefined)
    await assertFileIsOnServer(server, deployment.entityId)
  }
}

export async function assertEntityWasNotDeployed(server: TestProgram, entity: ControllerEntity) {
  await assertFileIsNotOnServer(server, entity.id)

  // Legacy check
  const content: EntityContentItemReference[] = entity.content ?? []
  await Promise.all(content.map(({ hash }) => assertFileIsNotOnServer(server, hash)))
  const entities = await server.getEntitiesByIds(entity.type, entity.id)
  assert.equal(entities.length, 0)

  // Deployments check
  const deployments = await server.getDeployments({ filters: { entityIds: [entity.id] } })
  assert.equal(deployments.length, 0)
}

export async function assertEntitiesAreActiveOnServer(server: TestProgram, ...entities: ControllerEntity[]) {
  // Entities check
  for (const entity of entities) {
    const entitiesByPointer = await server.getEntitiesByPointers(entity.type, entity.pointers)
    assert.deepStrictEqual(entitiesByPointer, [entity])
    await assertEntityIsOnServer(server, entity)
  }

  // Deployments check
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]))
  const allPointers = entities.map(({ pointers }) => pointers).reduce((accum, curr) => accum.concat(curr), [])
  const deployments = await server.getDeployments({ filters: { pointers: allPointers, onlyCurrentlyPointed: true } })
  assert.equal(deployments.length, entities.length)
  for (const deployment of deployments) {
    assertEntityIsTheSameAsDeployment(entitiesById.get(deployment.entityId)!, deployment)
    assert.equal(deployment.auditInfo.overwrittenBy, undefined)
    await assertFileIsOnServer(server, deployment.entityId)
  }
}

export async function assertDeploymentsCount(server: TestProgram, count: number) {
  const deployments = await server.getDeployments()
  assert.equal(
    deployments.length,
    count,
    `Expected to find ${count} deployments on server ${server.getUrl()}. Instead, found ${deployments.length}.`
  )
}

export async function assertDeploymentsAreReported(
  server: TestProgram,
  ...expectedDeployments: ControllerDeployment[]
) {
  const deployments = await server.getDeployments()
  assert.equal(
    deployments.length,
    expectedDeployments.length,
    `Expected to find ${expectedDeployments.length} deployments on server ${server.getUrl()}. Instead, found ${
      deployments.length
    }.`
  )

  // Make sure that deployments are sorted per descending local timestamp
  for (let i = 1; i < deployments.length; i++) {
    assert.ok(deployments[i - 1].auditInfo.localTimestamp > deployments[i].auditInfo.localTimestamp)
  }

  // Sort fetched deployments by ascending entity id
  const sortedDeployments = deployments.sort((a, b) => (a.entityId > b.entityId ? 1 : -1))

  // Sort expected deployments by ascending entity id
  const sortedExpectedDeployments = expectedDeployments.sort((a, b) => (a.entityId > b.entityId ? 1 : -1))

  // Compare deployments
  for (let i = 0; i < expectedDeployments.length; i++) {
    const expectedEvent: ControllerDeployment = sortedExpectedDeployments[i]
    const actualEvent: ControllerDeployment = sortedDeployments[i]
    assertEqualsDeployment(actualEvent, expectedEvent)
  }
}

export function assertDeploymentFailsWith(promiseExecution: () => Promise<any>, errorMessage: string) {
  return assertPromiseRejectionGeneric(promiseExecution, (error) => {
    console.debug(error)
    expect(error.endsWith(`Got status 400. Response was '${JSON.stringify({ errors: [errorMessage] })}'`)).toBeTruthy()
  })
}

export async function assertThereIsAFailedDeployment(server: TestProgram): Promise<FailedDeployment> {
  const failedDeployments: FailedDeployment[] = await server.getFailedDeployments()
  assert.equal(failedDeployments.length, 1)
  return failedDeployments[0]
}

export async function assertDeploymentFailed(server: TestProgram, reason: FailureReason, entity: ControllerEntity) {
  const failedDeployment = await assertThereIsAFailedDeployment(server)
  assert.equal(failedDeployment.entityType, entity.type)
  assert.equal(failedDeployment.entityId, entity.id)
  assert.equal(failedDeployment.reason, reason)
}

function assertEqualsDeployment(actualDeployment: ControllerDeployment, expectedDeployment: ControllerDeployment) {
  assert.equal(actualDeployment.entityType, expectedDeployment.entityType)
  assert.equal(actualDeployment.entityId, expectedDeployment.entityId)
  assert.deepEqual(actualDeployment.pointers, expectedDeployment.pointers)
  assert.equal(actualDeployment.entityTimestamp, expectedDeployment.entityTimestamp)
  assert.deepEqual(actualDeployment.content, expectedDeployment.content)
  assert.deepEqual(actualDeployment.metadata, expectedDeployment.metadata)
  assert.equal(actualDeployment.deployedBy, expectedDeployment.deployedBy)
  assert.equal(actualDeployment.auditInfo.version, expectedDeployment.auditInfo.version)
  assert.deepEqual(actualDeployment.auditInfo.authChain, expectedDeployment.auditInfo.authChain)
  assert.deepEqual(actualDeployment.auditInfo.migrationData, expectedDeployment.auditInfo.migrationData)
  assert.equal(actualDeployment.auditInfo.isDenylisted, expectedDeployment.auditInfo.isDenylisted)
  assert.deepEqual(actualDeployment.auditInfo.denylistedContent, expectedDeployment.auditInfo.denylistedContent)
  assert.ok(actualDeployment.auditInfo.localTimestamp >= expectedDeployment.auditInfo.localTimestamp)
}

async function assertEntityIsOnServer(server: TestProgram, entity: ControllerEntity) {
  const fetchedEntity: ControllerEntity = await server.getEntityById(entity.type, entity.id)
  assert.deepStrictEqual(fetchedEntity, entity)
  return assertFileIsOnServer(server, entity.id)
}

export async function assertFileIsOnServer(server: TestProgram, hash: ContentFileHash) {
  const content = await server.downloadContent(hash)
  const downloadedContentHashes = await Promise.all([
    Hashing.calculateBufferHash(content),
    Hashing.calculateIPFSHash(content)
  ])
  assert.ok(downloadedContentHashes.includes(hash))
}

export async function assertFileIsNotOnServer(server: TestProgram, hash: ContentFileHash) {
  await assertPromiseIsRejected(() => server.downloadContent(hash))
}

export async function assertEntityIsOverwrittenBy(
  server: TestProgram,
  entity: ControllerEntity,
  overwrittenBy: ControllerEntity
) {
  // Legacy check
  const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
  assert.equal(auditInfo.overwrittenBy, overwrittenBy.id)

  // Deployments check
  const deployment = await getEntitiesDeployment(server, entity)
  assert.equal(deployment.auditInfo.overwrittenBy, overwrittenBy.id)
}

export async function assertEntityIsNotOverwritten(server: TestProgram, entity: ControllerEntity) {
  // Legacy check
  const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
  assert.equal(auditInfo.overwrittenBy, undefined)

  // Deployments check
  const deployment = await getEntitiesDeployment(server, entity)
  assert.equal(deployment.auditInfo.overwrittenBy, undefined)
}

export async function assertEntityIsNotDenylisted(server: TestProgram, entity: ControllerEntity) {
  // Legacy check
  const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
  assert.equal(auditInfo.isDenylisted, undefined)

  // Deployments check
  const deployment = await getEntitiesDeployment(server, entity)
  assert.equal(deployment.auditInfo.isDenylisted, undefined)
}

export async function assertEntityIsDenylisted(server: TestProgram, entity: ControllerEntity) {
  // Legacy check
  const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
  assert.ok(auditInfo.isDenylisted)

  // Deployments check
  const deployment = await getEntitiesDeployment(server, entity)
  assert.ok(deployment.auditInfo.isDenylisted)
}

export async function assertContentNotIsDenylisted(
  server: TestProgram,
  entity: ControllerEntity,
  contentHash: ContentFileHash
) {
  // Legacy check
  const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
  assert.ok(!auditInfo.denylistedContent || !auditInfo.denylistedContent.includes(contentHash))

  // Deployments check
  const deployment = await getEntitiesDeployment(server, entity)
  assert.ok(!deployment.auditInfo.denylistedContent || !deployment.auditInfo.denylistedContent.includes(contentHash))
}

export async function assertContentIsDenylisted(
  server: TestProgram,
  entity: ControllerEntity,
  contentHash: ContentFileHash
) {
  // Legacy check
  const auditInfo: LegacyAuditInfo = await server.getAuditInfo(entity)
  assert.ok(auditInfo.denylistedContent!.includes(contentHash))

  // Deployments check
  const deployment = await getEntitiesDeployment(server, entity)
  assert.ok(deployment.auditInfo.denylistedContent!.includes(contentHash))
}

export function buildDeployment(
  deployData: DeploymentData,
  entity: ControllerEntity,
  deploymentTimestamp: Timestamp
): ControllerDeployment {
  return {
    ...entity,
    entityVersion: EntityVersion.V3,
    content: entity.content?.map(({ file, hash }) => ({ key: file, hash })),
    entityType: entity.type,
    entityId: entity.id,
    entityTimestamp: entity.timestamp,
    deployedBy: Authenticator.ownerAddress(deployData.authChain),
    auditInfo: {
      version: EntityVersion.V3,
      localTimestamp: deploymentTimestamp,
      authChain: deployData.authChain
    }
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

async function getEntitiesDeployment(server: TestProgram, entity: ControllerEntity): Promise<ControllerDeployment> {
  const deployments = await server.getDeployments({ filters: { entityIds: [entity.id] } })
  assert.equal(deployments.length, 1)
  const [deployment] = deployments
  return deployment
}

export async function assertResponseIsOkOrThrow(response: Response) {
  if (!response.ok) {
    throw new Error(await response.text())
  }
}

export function assertResultIsSuccessfulWithTimestamp(result: DeploymentResult, expectedTimestamp: Timestamp): void {
  if (isSuccessfulDeployment(result)) {
    expect(result).toEqual(expectedTimestamp)
  } else {
    assert.fail('The deployment result: ' + result + ' was expected to be successful, it was invalid instead.')
  }
}
