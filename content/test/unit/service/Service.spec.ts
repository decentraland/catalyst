import { ENTITY_FILE_NAME, ContentFile } from "@katalyst/content/service/Service";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";
import { EntityType, Entity } from "@katalyst/content/service/Entity";
import { EnvironmentBuilder, EnvironmentConfig, Bean } from "@katalyst/content/Environment";
import { ServiceFactory } from "@katalyst/content/service/ServiceFactory";
import { ContentStorage } from "@katalyst/content/storage/ContentStorage";
import { MetaverseContentService } from "@katalyst/content/service/Service";
import { HistoryManager } from "@katalyst/content/service/history/HistoryManager";
import { Hashing, ContentFileHash } from '@katalyst/content/service/Hashing';
import { assertPromiseRejectionIs } from "@katalyst/test-helpers/PromiseAssertions";
import { buildEntityAndFile } from "@katalyst/test-helpers/service/EntityTestFactory";
import { MockedStorage } from "../storage/MockedStorage";
import { MockedHistoryManager } from "./history/MockedHistoryManager";
import { EntityVersion, AuditInfo, NO_TIMESTAMP } from "@katalyst/content/service/Audit";
import { MockedAccessChecker } from "@katalyst/test-helpers/service/access/MockedAccessChecker";
import { AuthLinkType } from "dcl-crypto";
import { ContentAuthenticator } from "@katalyst/content/service/auth/Authenticator";

describe("Service", function () {

    const auditInfo: AuditInfo = {
        authChain: [{type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, signature:"signature", payload:"ethAddress"}],
        version: EntityVersion.V3, deployedTimestamp: NO_TIMESTAMP}

    let randomFile: { name: string, content: Buffer }
    let randomFileHash: ContentFileHash
    let entity: Entity
    let entityFile: ContentFile
    let historyManager: HistoryManager
    let storage: ContentStorage
    let service: MetaverseContentService

    beforeAll(async () => {
        randomFile = { name: "file", content: Buffer.from("1234") }
        randomFileHash = await Hashing.calculateHash(randomFile);
        [entity, entityFile] = await buildEntityAndFile(EntityType.SCENE, ["X1,Y1", "X2,Y2"], Date.now(), new Map([[randomFile.name, randomFileHash]]), "metadata")
        historyManager = new MockedHistoryManager()
    })

    beforeEach(async () => {
        storage = new MockedStorage()
        service = await buildService();
    })

    it(`When no file called '${ENTITY_FILE_NAME}' is uploaded, then an exception is thrown`, async () => {
        await assertPromiseRejectionIs(() => service.deployEntity([randomFile], randomFileHash, auditInfo, ''),
            `Failed to find the entity file. Please make sure that it is named '${ENTITY_FILE_NAME}'.`)
    });

    it(`When two or more files called '${ENTITY_FILE_NAME}' are uploaded, then an exception is thrown`, async () => {
        const invalidEntityFile: ContentFile = { name: ENTITY_FILE_NAME, content: Buffer.from("Hello") }
        await assertPromiseRejectionIs(() => service.deployEntity([entityFile, invalidEntityFile], "some-id", auditInfo, ''),
            `Found more than one file called '${ENTITY_FILE_NAME}'. Please make sure you upload only one with that name.`)
    });

    it(`When an entity is successfully deployed, then the content is stored correctly`, async () => {
        const storageSpy = spyOn(storage, "store").and.callThrough()
        const historySpy = spyOn(historyManager, "newEntityDeployment")

        const timestamp: Timestamp = await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, '')
        const deltaMilliseconds = Date.now() - timestamp
        expect(deltaMilliseconds).toBeGreaterThanOrEqual(0)
        expect(deltaMilliseconds).toBeLessThanOrEqual(10)
        expect(storageSpy).toHaveBeenCalledWith("contents", entity.id, entityFile.content)
        expect(storageSpy).toHaveBeenCalledWith("contents", randomFileHash, randomFile.content)
        expect(historySpy).toHaveBeenCalledWith("NOT_IN_DAO", entity.type, entity.id, timestamp)
        expect(await service.getEntitiesByIds(EntityType.SCENE, [entity.id])).toEqual([entity])
        expect(await service.getEntitiesByPointers(EntityType.SCENE, entity.pointers)).toEqual([entity])
        expect(await service.getActivePointers(EntityType.SCENE)).toEqual(entity.pointers)
    });

    it(`When an entity is successfully deployed, then previous overlapping entities are deleted`, async () => {
        await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, '')

        const [newEntity, newEntityFile] = await buildEntityAndFile(EntityType.SCENE, ["X2,Y2", "X3,Y3"], Date.now())

        await service.deployEntity([newEntityFile], newEntity.id, auditInfo, '')

        expect(await service.getEntitiesByIds(EntityType.SCENE, [entity.id])).toEqual([entity])
        expect(await service.getEntitiesByPointers(EntityType.SCENE, ["X1,Y1", "X2,Y2"])).toEqual([newEntity])
        expect(await service.getActivePointers(EntityType.SCENE)).toEqual(newEntity.pointers)
    });

    it(`When a file is already uploaded, then don't try to upload it again`, async () => {
        // Consider the random file as already uploaded, but not the entity file
        spyOn(storage, "exists").and.callFake((_: string, id: string) => Promise.resolve(id === randomFileHash))
        const storeSpy = spyOn(storage, "store")

        await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, '')

        expect(storeSpy).toHaveBeenCalledWith("contents", entity.id, entityFile.content)
        expect(storeSpy).not.toHaveBeenCalledWith("contents", randomFileHash, randomFile.content)
    });

    it(`When server is not in DAO, then deployments aren't allowed`, async () => {
        const service = await buildService(false)

        await assertPromiseRejectionIs(() => service.deployEntity([entityFile, randomFile], entity.id, auditInfo, ''),
            'Deployments are not allow since server is not in DAO')
    });

    it(`When server is not in DAO, then fixes are still allowed`, async () => {
        const service = await buildService(false)

        await service.deployToFix([entityFile, randomFile], entity.id, auditInfo, '')
    });

    async function buildService(allowDeploymentsForTesting = true) {
        const env = await new EnvironmentBuilder()
            .withStorage(storage)
            .withHistoryManager(historyManager)
            .withAccessChecker(new MockedAccessChecker())
            .withBean(Bean.AUTHENTICATOR, new ContentAuthenticator())
            .withConfig(EnvironmentConfig.IGNORE_VALIDATION_ERRORS, true)
            .withConfig(EnvironmentConfig.ALLOW_DEPLOYMENTS_FOR_TESTING, allowDeploymentsForTesting)
            .build();
        return await ServiceFactory.create(env);
    }

})
