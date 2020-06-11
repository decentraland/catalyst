import { ContentFileHash, ContentFile, Hashing, EntityType, ENTITY_FILE_NAME, Timestamp } from "dcl-catalyst-commons";
import { EnvironmentConfig, Bean, Environment } from "@katalyst/content/Environment";
import { ServiceFactory } from "@katalyst/content/service/ServiceFactory";
import { ContentStorage } from "@katalyst/content/storage/ContentStorage";
import { MetaverseContentService } from "@katalyst/content/service/Service";
import { HistoryManager } from "@katalyst/content/service/history/HistoryManager";
import { Entity } from "@katalyst/content/service/Entity";
import { assertPromiseRejectionIs } from "@katalyst/test-helpers/PromiseAssertions";
import { buildEntityAndFile } from "@katalyst/test-helpers/service/EntityTestFactory";
import { MockedStorage } from "../storage/MockedStorage";
import { EntityVersion, AuditInfoBase } from "@katalyst/content/service/Audit";
import { MockedAccessChecker } from "@katalyst/test-helpers/service/access/MockedAccessChecker";
import { Authenticator } from "dcl-crypto";
import { ContentAuthenticator } from "@katalyst/content/service/auth/Authenticator";
import { MockedRepository } from "../storage/MockedRepository";
import { MockedHistoryManager } from "./history/MockedHistoryManager";
import { MockedContentCluster } from "@katalyst/test-helpers/service/synchronization/MockedContentCluster";
import { NoOpFailedDeploymentsManager } from "./errors/NoOpFailedDeploymentsManager";
import { NoOpDeploymentReporter } from "@katalyst/content/service/reporters/NoOpDeploymentReporter";
import { NoOpPointerManager } from "./pointers/NoOpPointerManager";
import { NoOpDeploymentManager } from "./deployments/NoOpDeploymentManager";
import { NoOpValidations } from "@katalyst/test-helpers/service/validations/NoOpValidations";

describe("Service", function () {

    const auditInfo: AuditInfoBase = {
        authChain: Authenticator.createSimpleAuthChain('entityId', 'ethAddress', 'signature'),
        version: EntityVersion.V3,
    }

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
    })

    beforeEach(async () => {
        storage = new MockedStorage()
        historyManager = new MockedHistoryManager()
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
        const historySpy = spyOn(historyManager, "reportDeployment")

        const timestamp: Timestamp = await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, '')
        const deltaMilliseconds = Date.now() - timestamp
        expect(deltaMilliseconds).toBeGreaterThanOrEqual(0)
        expect(deltaMilliseconds).toBeLessThanOrEqual(10)
        expect(storageSpy).toHaveBeenCalledWith(entity.id, entityFile.content)
        expect(storageSpy).toHaveBeenCalledWith(randomFileHash, randomFile.content)
        expect(historySpy).toHaveBeenCalled()
    });

    it(`When a file is already uploaded, then don't try to upload it again`, async () => {
        // Consider the random file as already uploaded, but not the entity file
        spyOn(storage, "exist").and.callFake((ids: string[]) => Promise.resolve(new Map(ids.map(id => [id, id === randomFileHash]))))
        const storeSpy = spyOn(storage, "store")

        await service.deployEntity([entityFile, randomFile], entity.id, auditInfo, '')

        expect(storeSpy).toHaveBeenCalledWith(entity.id, entityFile.content)
        expect(storeSpy).not.toHaveBeenCalledWith(randomFileHash, randomFile.content)
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
        const env = new Environment()
            .registerBean(Bean.STORAGE, storage)
            .registerBean(Bean.HISTORY_MANAGER, historyManager)
            .registerBean(Bean.ACCESS_CHECKER, new MockedAccessChecker())
            .registerBean(Bean.AUTHENTICATOR, new ContentAuthenticator())
            .registerBean(Bean.VALIDATIONS, new NoOpValidations())
            .registerBean(Bean.CONTENT_CLUSTER, MockedContentCluster.withoutIdentity())
            .registerBean(Bean.FAILED_DEPLOYMENTS_MANAGER, NoOpFailedDeploymentsManager.build())
            .registerBean(Bean.POINTER_MANAGER, NoOpPointerManager.build())
            .registerBean(Bean.DEPLOYMENT_MANAGER, NoOpDeploymentManager.build())
            .registerBean(Bean.DEPLOYMENT_REPORTER, new NoOpDeploymentReporter())
            .registerBean(Bean.REPOSITORY, MockedRepository.build())
            .setConfig(EnvironmentConfig.ALLOW_DEPLOYMENTS_FOR_TESTING, allowDeploymentsForTesting)

        return ServiceFactory.create(env);
    }

})
