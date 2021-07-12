import { Denylist } from '@katalyst/content/denylist/Denylist'
import { DenylistServiceDecorator } from '@katalyst/content/denylist/DenylistServiceDecorator'
import {
  buildAddressTarget,
  buildContentTarget,
  buildEntityTarget,
  buildPointerTarget,
  DenylistTarget,
  DenylistTargetId,
  DenylistTargetType
} from '@katalyst/content/denylist/DenylistTarget'
import { Deployment } from '@katalyst/content/service/deployments/DeploymentManager'
import { Entity } from '@katalyst/content/service/Entity'
import { LocalDeploymentAuditInfo } from '@katalyst/content/service/Service'
import { assertPromiseRejectionIs } from '@katalyst/test-helpers/PromiseAssertions'
import { MockedRepository } from '@katalyst/test-helpers/repository/MockedRepository'
import {
  buildContent as buildRandomContent,
  buildEntity,
  MockedMetaverseContentService,
  MockedMetaverseContentServiceBuilder
} from '@katalyst/test-helpers/service/MockedMetaverseContentService'
import { EntityVersion, Pointer } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import { random } from 'faker'
import { anything, instance, mock, when } from 'ts-mockito'

describe('DenylistServiceDecorator', () => {
  const P1: Pointer = 'p1'
  const P2: Pointer = 'p2'
  const P3: Pointer = 'p3'
  const content1 = buildRandomContent()
  const content2 = buildRandomContent()
  const ethAddress = random.alphaNumeric(10)
  const auditInfo: LocalDeploymentAuditInfo = {
    authChain: Authenticator.createSimpleAuthChain('', ethAddress, random.alphaNumeric(10)),
    version: EntityVersion.V3
  }

  let entity1: Entity
  let entity2: Entity
  let entityFile1: Buffer

  let P1Target: DenylistTarget
  let content1Target: DenylistTarget
  let entity2Target: DenylistTarget
  let ethAddressTarget: DenylistTarget

  let service: MockedMetaverseContentService

  beforeAll(async () => {
    ;[entity1, entityFile1] = await buildEntity([P1, P3], content1)
    ;[entity2] = await buildEntity([P2], content2)

    P1Target = buildPointerTarget(entity1.type, P1)
    content1Target = buildContentTarget(content1.hash)
    entity2Target = buildEntityTarget(entity2.type, entity2.id)
    ethAddressTarget = buildAddressTarget(ethAddress)

    service = new MockedMetaverseContentServiceBuilder()
      .withContent(content1)
      .withContent(content2)
      .withEntity(entity1)
      .withEntity(entity2)
      .build()
  })

  it(`When an entity is not denylisted, then the audit info is not modified`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const { deployments } = await decorator.getDeployments()

    expect(deployments.length).toBe(2)
    const [deployment1] = deployments

    expect(deployment1.auditInfo).toEqual(MockedMetaverseContentService.AUDIT_INFO)
  })

  it(`When a pointer is denylisted, then no entities are reported on it`, async () => {
    const denylist = denylistWith(P1Target)
    const decorator = getDecorator(denylist)

    const entities = await decorator.getEntitiesByPointers(entity1.type, [P1])

    expect(entities.length).toBe(0)
  })

  it(`When a pointer is not denylisted, then it reports the entity correctly`, async () => {
    const denylist = denylistWith(P1Target)
    const decorator = getDecorator(denylist)

    const entities = await decorator.getEntitiesByPointers(entity2.type, entity2.pointers)

    expect(entities).toEqual([entity2])
  })

  it(`When an entity is denylisted, then it is returned by pointers, but without content or metadata`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const entities = await decorator.getEntitiesByPointers(entity2.type, entity2.pointers)

    expect(entities.length).toBe(1)
    const returnedEntity = entities[0]
    entitiesEqualNonSanitizableProperties(returnedEntity, entity2)
    expect(returnedEntity.metadata).toEqual(DenylistServiceDecorator.DENYLISTED_METADATA)
    expect(returnedEntity.content).toBeUndefined()
  })

  it(`When an entity is not denylisted, then it is returned by pointers correctly`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const entities = await decorator.getEntitiesByPointers(entity1.type, entity1.pointers)

    expect(entities).toEqual([entity1])
  })

  it(`When an entity is denylisted, then it is returned by id, but without content or metadata`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const entities = await decorator.getEntitiesByIds([entity2.id])

    expect(entities.length).toBe(1)
    const returnedEntity = entities[0]
    entitiesEqualNonSanitizableProperties(returnedEntity, entity2)
    expect(returnedEntity.metadata).toEqual(DenylistServiceDecorator.DENYLISTED_METADATA)
    expect(returnedEntity.content).toBeUndefined()
  })

  it(`When an entity is not denylisted, then it is returned by id correctly`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const entities = await decorator.getEntitiesByIds([entity1.id])

    expect(entities).toEqual([entity1])
  })

  it(`When an entity is denylisted, then it is returned on deployments, but without content or metadata`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const { deployments } = await decorator.getDeployments()

    expect(deployments.length).toBe(2)
    const [deployment1, deployment2] = deployments

    // Assert deployment 1 is not denylisted
    deploymentEquals(entity1, deployment1)
    expect(deployment1.auditInfo.isDenylisted).toBeUndefined()

    // Assert deployment 2 is denylisted
    deploymentEqualsNonSanitizableProperties(entity2, deployment2)
    expect(deployment2.metadata).toEqual(DenylistServiceDecorator.DENYLISTED_METADATA)
    expect(deployment2.content).toBeUndefined()
    expect(deployment2.auditInfo.isDenylisted).toBeTruthy()
  })

  it(`When content is denylisted, then it is marked as so on the deployment`, async () => {
    const denylist = denylistWith(content1Target)
    const decorator = getDecorator(denylist)

    const { deployments } = await decorator.getDeployments()

    expect(deployments.length).toBe(2)
    const [deployment1, deployment2] = deployments

    // Assert content is marked as denylisted
    deploymentEquals(entity1, deployment1)
    expect(deployment1.auditInfo.denylistedContent).toEqual([content1.hash])

    // Assert no content is marked as denylisted
    deploymentEquals(entity2, deployment2)
    expect(deployment2.auditInfo.denylistedContent).toBeUndefined
  })

  it(`When a pointer is denylisted, then deployments whose pointers fully match the filter are not returned`, async () => {
    const denylist = denylistWith(P1Target)
    const decorator = getDecorator(denylist)

    const { deployments } = await decorator.getDeployments({ filters: { pointers: [P1] } })

    expect(deployments.length).toBe(0)
  })

  it(`When a pointer is denylisted, then deployments whose pointers partially match the filter are returned`, async () => {
    const denylist = denylistWith(P1Target)
    const decorator = getDecorator(denylist)

    const { deployments } = await decorator.getDeployments({ filters: { pointers: entity1.pointers } })

    expect(deployments.length).toBe(1)
    deploymentEquals(entity1, deployments[0])
  })

  it(`When a pointer is denylisted but it is not used as a pointer filter, then it has no effect`, async () => {
    const denylist = denylistWith(P1Target)
    const decorator = getDecorator(denylist)

    const { deployments } = await decorator.getDeployments({ filters: { pointers: entity2.pointers } })

    expect(deployments.length).toBe(1)
    deploymentEquals(entity2, deployments[0])
  })

  it(`When a pointer is denylisted but it is not used as filter, then it has no effect`, async () => {
    const denylist = denylistWith(P1Target)
    const decorator = getDecorator(denylist)

    const { deployments } = await decorator.getDeployments({ filters: { entityIds: [entity1.id] } })

    expect(deployments.length).toBe(1)
    deploymentEquals(entity1, deployments[0])
  })

  it(`When content is denylisted, then it can't be returned`, async () => {
    const denylist = denylistWith(content1Target)
    const decorator = getDecorator(denylist)

    const content = await decorator.getContent(content1.hash)
    expect(content).toBeUndefined()
  })

  it(`When content is not denylisted, then it can be returned correctly`, async () => {
    const denylist = denylistWith(content1Target)
    const decorator = getDecorator(denylist)

    const buffer = await (await decorator.getContent(content2.hash))?.asBuffer()
    expect(buffer).toBe(content2.buffer)
  })

  it(`When an entity is denylisted, then it can't be returned as content`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const content = await decorator.getContent(entity2.id)
    expect(content).toBeUndefined()
  })

  it(`When an entity is not denylisted, then it can be returned as content`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const buffer = await (await decorator.getContent(entity1.id))?.asBuffer()

    expect(buffer).toEqual(Buffer.from(entity1.id))
  })

  it(`When content is denylisted, then it is not available`, async () => {
    const denylist = denylistWith(content1Target)
    const decorator = getDecorator(denylist)

    const available = await decorator.isContentAvailable([content1.hash, content2.hash])

    expect(available.get(content1.hash)).toBeFalsy()
    expect(available.get(content2.hash)).toBeTruthy()
  })

  it(`When an entity is denylisted, then it is not available as content`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const available = await decorator.isContentAvailable([entity1.id, entity2.id])

    expect(available.get(entity1.id)).toBeTruthy()
    expect(available.get(entity2.id)).toBeFalsy()
  })

  it(`When status is requested, then it is not modified`, async () => {
    const denylist = denylistWith(entity2Target)
    const decorator = getDecorator(denylist)

    const status = decorator.getStatus()

    expect(status).toEqual(MockedMetaverseContentService.STATUS)
  })

  it(`When no denylist matches, then entities can be deployed`, async () => {
    const denylist = denylistWith()
    const decorator = getDecorator(denylist)

    await decorator.deployEntity([entityFile1], entity1.id, auditInfo, '')
  })

  it(`When address is denylisted, then it can't deploy entities`, async () => {
    const denylist = denylistWith(ethAddressTarget)
    const decorator = getDecorator(denylist)

    await assertPromiseRejectionIs(
      () => decorator.deployEntity([entityFile1], entity1.id, auditInfo, ''),
      `Can't allow a deployment from address '${ethAddress}' since it was denylisted.`
    )
  })

  it(`When pointer is denylisted, then entities can't be deployed on it`, async () => {
    const denylist = denylistWith(P1Target)
    const decorator = getDecorator(denylist)

    await assertPromiseRejectionIs(
      () => decorator.deployEntity([entityFile1], entity1.id, auditInfo, ''),
      `Can't allow the deployment since the entity contains a denylisted pointer.`
    )
  })

  it(`When content is denylisted, then entities can't be deployed with it`, async () => {
    const denylist = denylistWith(content1Target)
    const decorator = getDecorator(denylist)

    await assertPromiseRejectionIs(
      () => decorator.deployEntity([entityFile1], entity1.id, auditInfo, ''),
      `Can't allow the deployment since the entity contains a denylisted content.`
    )
  })

  it(`When there is no file matching the entity id, then the deployment fails`, async () => {
    const denylist = denylistWith()
    const decorator = getDecorator(denylist)

    await assertPromiseRejectionIs(
      () => decorator.deployEntity([entityFile1], 'some-random-id', auditInfo, ''),
      `Failed to find the entity file.`
    )
  })

  function deploymentEqualsNonSanitizableProperties(entity: Entity, deployment: Deployment) {
    expect(entity.id).toEqual(deployment.entityId)
    expect(entity.type).toEqual(deployment.entityType)
    expect(entity.pointers).toEqual(deployment.pointers)
    expect(entity.timestamp).toEqual(deployment.entityTimestamp)
  }

  function entitiesEqualNonSanitizableProperties(entity1: Entity, entity2: Entity) {
    expect(entity1.id).toEqual(entity2.id)
    expect(entity1.type).toEqual(entity2.type)
    expect(entity1.pointers).toEqual(entity2.pointers)
    expect(entity1.timestamp).toEqual(entity2.timestamp)
  }

  function deploymentEquals(entity: Entity, deployment: Deployment) {
    expect(entity.id).toEqual(deployment.entityId)
    expect(entity.type).toEqual(deployment.entityType)
    expect(entity.pointers).toEqual(deployment.pointers)
    expect(entity.timestamp).toEqual(deployment.entityTimestamp)
    expect(entity.content).toEqual(deployment.content)
    expect(entity.metadata).toEqual(deployment.metadata)
  }

  function denylistWith(...denylistedTargets: DenylistTarget[]): Denylist {
    return instance(mockDenylistWith(...denylistedTargets))
  }

  function mockDenylistWith(...denylistedTargets: DenylistTarget[]): Denylist {
    const denylistedTargetsAsMap: Map<DenylistTargetId, DenylistTargetType> = new Map(
      denylistedTargets.map((target) => [target.getId(), target.getType()])
    )
    const mockedDenylist: Denylist = mock<Denylist>()
    when(mockedDenylist.getAllDenylistedTargets()).thenResolve(
      Array.from(
        denylistedTargets.map((target) => {
          return {
            target: target,
            metadata: {
              timestamp: 1,
              authChain: []
            }
          }
        })
      )
    )
    when(mockedDenylist.areTargetsDenylisted(anything(), anything())).thenCall((_, targets: DenylistTarget[]) => {
      const result: Map<DenylistTargetType, Map<DenylistTargetId, boolean>> = new Map()
      targets.forEach((target) => {
        if (!result.has(target.getType())) {
          result.set(target.getType(), new Map())
        }
        const isDenylisted = denylistedTargetsAsMap.get(target.getId()) === target.getType()
        result.get(target.getType())!.set(target.getId(), isDenylisted)
      })
      return Promise.resolve(result)
    })

    return mockedDenylist
  }

  function getDecorator(denylist: Denylist) {
    return new DenylistServiceDecorator(service, denylist, MockedRepository.build())
  }
})
