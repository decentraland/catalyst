import { random } from "faker"
import { mock, instance, when, anything } from "ts-mockito"
import { BlacklistTarget, buildPointerTarget, buildContentTarget, buildEntityTarget, buildAddressTarget } from "@katalyst/content/blacklist/BlacklistTarget";
import { Blacklist } from "@katalyst/content/blacklist/Blacklist";
import { BlacklistServiceDecorator } from "@katalyst/content/blacklist/BlacklistServiceDecorator";
import { ContentFile } from "@katalyst/content/service/Service";
import { Pointer, Entity } from "@katalyst/content/service/Entity";
import { MockedMetaverseContentService, MockedMetaverseContentServiceBuilder, buildEntity, buildContent as buildRandomContent } from "@katalyst/test-helpers/service/MockedMetaverseContentService";
import { assertPromiseIsRejected, assertPromiseRejectionIs } from "@katalyst/test-helpers/PromiseAssertions";
import { EntityVersion, AuditInfo, NO_TIMESTAMP } from "@katalyst/content/service/audit/Audit";
import { Authenticator } from "@katalyst/content/service/auth/Authenticator";

describe("BlacklistServiceDecorator", () => {

    const P1: Pointer = "p1"
    const P2: Pointer = "p2"
    const content1 = buildRandomContent()
    const content2 = buildRandomContent()
    const ethAddress = random.alphaNumeric(10)
    const auditInfo: AuditInfo = {
        authChain: Authenticator.createSimpleAuthChain('', ethAddress, random.alphaNumeric(10)),
        version: EntityVersion.V3, deployedTimestamp: NO_TIMESTAMP}


    let entity1: Entity;
    let entity2: Entity;
    let entityFile1: ContentFile;

    let P1Target: BlacklistTarget;
    let content1Target: BlacklistTarget;
    let entity2Target: BlacklistTarget;
    let ethAddressTarget: BlacklistTarget;

    let service: MockedMetaverseContentService;

    beforeAll(async () => {
        [entity1, entityFile1] = await buildEntity([P1], content1);
        [entity2, ] = await buildEntity([P2], content2);

        P1Target = buildPointerTarget(entity1.type, P1);
        content1Target = buildContentTarget(content1.hash);
        entity2Target = buildEntityTarget(entity2.type, entity2.id);
        ethAddressTarget = buildAddressTarget(ethAddress);

        service = new MockedMetaverseContentServiceBuilder()
                .withContent(content1)
                .withContent(content2)
                .withEntity(entity1)
                .withEntity(entity2)
                .build()
    })

    it(`When a pointer is blacklisted, then no entities are reported on it`, async () => {
        const blacklist = blacklistWith(P1Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const entities = await decorator.getEntitiesByPointers(entity1.type, [P1]);

        expect(entities.length).toBe(0)
    })

    it(`When a pointer is not blacklisted, then it reports the entity correctly`, async () => {
        const blacklist = blacklistWith(P1Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const entities = await decorator.getEntitiesByPointers(entity2.type, entity2.pointers);

        expect(entities).toEqual([entity2])
    })

    it(`When an entity is blacklisted, then it is returned by pointers, but without content or metadata`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const entities = await decorator.getEntitiesByPointers(entity2.type, entity2.pointers);

        expect(entities.length).toBe(1)
        const returnedEntity = entities[0];
        entitiesEqualNonSanitizableProperties(returnedEntity, entity2)
        expect(returnedEntity.metadata).toEqual(BlacklistServiceDecorator.BLACKLISTED_METADATA)
        expect(returnedEntity.content).toBeUndefined()
    })

    it(`When an entity is not blacklisted, then it is returned by pointers correctly`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const entities = await decorator.getEntitiesByPointers(entity1.type, entity1.pointers);

        expect(entities).toEqual([entity1])
    })

    it(`When an entity is blacklisted, then it is returned by id, but without content or metadata`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const entities = await decorator.getEntitiesByIds(entity2.type, [entity2.id]);

        expect(entities.length).toBe(1)
        const returnedEntity = entities[0];
        entitiesEqualNonSanitizableProperties(returnedEntity, entity2)
        expect(returnedEntity.metadata).toEqual(BlacklistServiceDecorator.BLACKLISTED_METADATA)
        expect(returnedEntity.content).toBeUndefined()
    })

    it(`When an entity is not blacklisted, then it is returned by id correctly`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const entities = await decorator.getEntitiesByIds(entity1.type, [entity1.id]);

        expect(entities).toEqual([entity1])
    })

    it(`When a pointer is blacklisted, then it is not reported as active`, async () => {
        const blacklist = blacklistWith(P1Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const pointers = await decorator.getActivePointers(entity1.type);

        expect(pointers).toEqual([P2])
    })

    it(`When content is blacklisted, then it can't be returned`, async () => {
        const blacklist = blacklistWith(content1Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        assertPromiseIsRejected(() => decorator.getContent(content1.hash))
    })

    it(`When content is not blacklisted, then it can be returned correctly`, async () => {
        const blacklist = blacklistWith(content1Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const buffer = await decorator.getContent(content2.hash)

        expect(buffer).toBe(content2.buffer)
    })

    it(`When an entity is blacklisted, then it can't be returned as content`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        assertPromiseIsRejected(() => decorator.getContent(entity2.id))
    })

    it(`When an entity is not blacklisted, then it can be returned as content`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const buffer = await decorator.getContent(entity1.id)

        expect(buffer).toEqual(Buffer.from(entity1.id))
    })

    it(`When content is blacklisted, then it is not available`, async () => {
        const blacklist = blacklistWith(content1Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const available = await decorator.isContentAvailable([content1.hash, content2.hash]);

        expect(available.get(content1.hash)).toBeFalsy()
        expect(available.get(content2.hash)).toBeTruthy()
    })

    it(`When an entity is blacklisted, then it is not available as content`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const available = await decorator.isContentAvailable([entity1.id, entity2.id]);

        expect(available.get(entity1.id)).toBeTruthy()
        expect(available.get(entity2.id)).toBeFalsy()
    })

    it(`When an entity is blacklisted, then it is marked as so on the audit info`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const auditInfo = await decorator.getAuditInfo(entity2.type, entity2.id) as AuditInfo

        expect(auditInfo).toBeDefined()
        expect(auditInfo.deployedTimestamp).toEqual(MockedMetaverseContentService.AUDIT_INFO.deployedTimestamp)
        expect(auditInfo.authChain).toEqual(MockedMetaverseContentService.AUDIT_INFO.authChain)
        expect(auditInfo.overwrittenBy).toEqual(MockedMetaverseContentService.AUDIT_INFO.overwrittenBy)
        expect(auditInfo.isBlacklisted).toBeTruthy()
        expect(auditInfo.blacklistedContent).toBeUndefined()
    })

    it(`When content is blacklisted, then it is marked as so on the audit info`, async () => {
        const blacklist = blacklistWith(content1Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const auditInfo = await decorator.getAuditInfo(entity1.type, entity1.id) as AuditInfo

        expect(auditInfo).toBeDefined()
        expect(auditInfo.deployedTimestamp).toEqual(MockedMetaverseContentService.AUDIT_INFO.deployedTimestamp)
        expect(auditInfo.authChain).toEqual(MockedMetaverseContentService.AUDIT_INFO.authChain)
        expect(auditInfo.overwrittenBy).toEqual(MockedMetaverseContentService.AUDIT_INFO.overwrittenBy)
        expect(auditInfo.isBlacklisted).toBeUndefined()
        expect(auditInfo.blacklistedContent).toEqual([content1.hash])
    })

    it(`When an entity is not blacklisted, then the audit info is not modified`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const auditInfo = await decorator.getAuditInfo(entity1.type, entity1.id);

        expect(auditInfo).toEqual(MockedMetaverseContentService.AUDIT_INFO)
    })

    it(`When status is requested, then it is not modified`, async () => {
        const blacklist = blacklistWith(entity2Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        const status = await decorator.getStatus();

        expect(status).toEqual(MockedMetaverseContentService.STATUS)
    })

    it(`When no blacklist matches, then entities can be deployed`, async () => {
        const blacklist = blacklistWith()
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        await decorator.deployEntity([entityFile1], entity1.id, auditInfo, '');
    })

    it(`When address is blacklisted, then it can't deploy entities`, async () => {
        const blacklist = blacklistWith(ethAddressTarget)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        assertPromiseRejectionIs(() => decorator.deployEntity([entityFile1], entity1.id, auditInfo, ''),
            `Can't allow a deployment from address '${ethAddress}' since it was blacklisted.`)
    })

    it(`When pointer is blacklisted, then entities can't be deployed on it`, async () => {
        const blacklist = blacklistWith(P1Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        assertPromiseRejectionIs(() => decorator.deployEntity([entityFile1], entity1.id, auditInfo, ''),
            `Can't allow the deployment since the entity contains a blacklisted pointer.`)
    })

    it(`When content is blacklisted, then entities can't be deployed with it`, async () => {
        const blacklist = blacklistWith(content1Target)
        const decorator = new BlacklistServiceDecorator(service, blacklist)

        assertPromiseRejectionIs(() => decorator.deployEntity([entityFile1], entity1.id, auditInfo, ''),
            `Can't allow the deployment since the entity contains a blacklisted content.`)
    })

    function entitiesEqualNonSanitizableProperties(entity1: Entity, entity2: Entity) {
        expect(entity1.id).toEqual(entity2.id)
        expect(entity1.type).toEqual(entity2.type)
        expect(entity1.pointers).toEqual(entity2.pointers)
        expect(entity1.timestamp).toEqual(entity2.timestamp)
    }

    function blacklistWith(...blacklistedTargets: BlacklistTarget[]): Blacklist {
        const targetIds: Set<string> = new Set(blacklistedTargets.map(target => target.asString()))
        let mockedBlacklist: Blacklist = mock(Blacklist)
        when(mockedBlacklist.areTargetsBlacklisted(anything())).thenCall(
            (targets: BlacklistTarget[]) => Promise.resolve(new Map(targets.map(target => [target, targetIds.has(target.asString())]))))

        return instance(mockedBlacklist)
    }

})
