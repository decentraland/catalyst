import { random } from "faker"
import { EnvironmentConfig, Environment, Bean } from "@katalyst/content/Environment"
import { FailedDeploymentsManager, FailureReason, DeploymentStatus, FailedDeployment } from "@katalyst/content/service/errors/FailedDeploymentsManager"
import { ContentStorageFactory } from "@katalyst/content/storage/ContentStorageFactory"
import { FailedDeploymentsManagerFactory } from "@katalyst/content/service/errors/FailedDeploymentsManagerFactory"
import { deleteFolderRecursive } from "../E2ETestUtils"
import { streamToArray, StreamPipeline } from "@katalyst/content/helpers/StreamHelper"
import { DeploymentEvent } from "@katalyst/content/service/history/HistoryManager"
import { EntityType } from "@katalyst/content/service/Entity"

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
        expect(status).toBe(DeploymentStatus.UNKNOWN_ENTITY)

        await manager.reportFailedDeployment(deployment, FailureReason.DEPLOYMENT_ERROR)

        status = await manager.getDeploymentStatus(deployment.entityType, deployment.entityId)
        expect(status).toBe(DeploymentStatus.DEPLOYMENT_ERROR)
    })

    it(`When failures are reported, then all are reported correctly`, async () => {
        const deployment1 = buildRandomDeployment()
        const deployment2 = buildRandomDeployment()

        await manager.reportFailedDeployment(deployment1, FailureReason.UNKNOWN_ENTITY)
        await manager.reportFailedDeployment(deployment2, FailureReason.DEPLOYMENT_ERROR)

        const [failed1, failed2]: Array<FailedDeployment> = await toArray(manager.getAllFailedDeployments())

        expect(failed1.status).toBe(DeploymentStatus.DEPLOYMENT_ERROR)
        expect(failed1.deployment).toEqual(deployment2)
        expect(failed2.status).toBe(DeploymentStatus.UNKNOWN_ENTITY)
        expect(failed2.deployment).toEqual(deployment1)
    })

    it(`When successful deployment is reported, then all previous failures of such reported are deleted`, async () => {
        const deployment = buildRandomDeployment()

        await manager.reportFailedDeployment(deployment, FailureReason.UNKNOWN_ENTITY)
        await manager.reportFailedDeployment(deployment, FailureReason.DEPLOYMENT_ERROR)

        await manager.reportSuccessfulDeployment(deployment.entityType, deployment.entityId)

        const status = await manager.getDeploymentStatus(deployment.entityType, deployment.entityId)
        expect(status).toBe(DeploymentStatus.SUCCESSFUL)
    })

    async function toArray<T>(pipeline: StreamPipeline): Promise<Array<T>> {
        const results: Array<T> = []
        const stream = streamToArray(results)
        await pipeline.addAndExecute(stream)
        return results
    }


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
