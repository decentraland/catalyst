import { random } from "faker"
import { EnvironmentConfig, Environment, Bean } from "@katalyst/content/Environment"
import { FailedDeploymentsManager, FailureReason, FailedDeployment, NoFailure } from "@katalyst/content/service/errors/FailedDeploymentsManager"
import { ContentStorageFactory } from "@katalyst/content/storage/ContentStorageFactory"
import { FailedDeploymentsManagerFactory } from "@katalyst/content/service/errors/FailedDeploymentsManagerFactory"
import { DeploymentEvent } from "@katalyst/content/service/history/HistoryManager"
import { EntityType } from "@katalyst/content/service/Entity"
import { deleteFolderRecursive } from "../E2ETestUtils"

describe("Integration - Failed Deployments Manager", function() {

    const STORAGE = "storage"
    let manager: FailedDeploymentsManager

    beforeEach(async () => {
        const env = new Environment()
        env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, STORAGE)
        env.registerBean(Bean.STORAGE, await ContentStorageFactory.local(env))
        manager = FailedDeploymentsManagerFactory.create(env)
    })

    afterEach(async () => {
        deleteFolderRecursive(STORAGE)
    })

    it(`When failures are reported, then the last status is returned`, async () => {
        const deployment = buildRandomDeployment()

        await manager.reportFailedDeployment(deployment, FailureReason.UNKNOWN_ENTITY)

        let status = await manager.getDeploymentStatus(deployment.entityType, deployment.entityId)
        expect(status).toBe(FailureReason.UNKNOWN_ENTITY)

        await manager.reportFailedDeployment(deployment, FailureReason.DEPLOYMENT_ERROR)

        status = await manager.getDeploymentStatus(deployment.entityType, deployment.entityId)
        expect(status).toBe(FailureReason.DEPLOYMENT_ERROR)
    })

    it(`When failures are reported, then all are reported correctly`, async () => {
        const deployment1 = buildRandomDeployment()
        const deployment2 = buildRandomDeployment()

        await manager.reportFailedDeployment(deployment1, FailureReason.UNKNOWN_ENTITY)
        await manager.reportFailedDeployment(deployment2, FailureReason.DEPLOYMENT_ERROR)

        const [failed1, failed2]: Array<FailedDeployment> = await manager.getAllFailedDeployments()

        expect(failed1.reason).toBe(FailureReason.DEPLOYMENT_ERROR)
        expect(failed1.deployment).toEqual(deployment2)
        expect(failed2.reason).toBe(FailureReason.UNKNOWN_ENTITY)
        expect(failed2.deployment).toEqual(deployment1)
    })

    it(`When successful deployment is reported, then all previous failures of such reported are deleted`, async () => {
        const deployment = buildRandomDeployment()

        await manager.reportFailedDeployment(deployment, FailureReason.UNKNOWN_ENTITY)
        await manager.reportFailedDeployment(deployment, FailureReason.DEPLOYMENT_ERROR)

        await manager.reportSuccessfulDeployment(deployment.entityType, deployment.entityId)

        const status = await manager.getDeploymentStatus(deployment.entityType, deployment.entityId)
        expect(status).toBe(NoFailure.SUCCESS)
    })

    function buildRandomDeployment(): DeploymentEvent {
        const timestamp = random.number()
        const serverName = random.alphaNumeric(20)
        const event =  {
            entityType: EntityType.PROFILE,
            entityId: random.alphaNumeric(10),
            timestamp,
            serverName
        }
        return event
    }

})
