import { random, internet } from "faker"
import { EntityType } from "dcl-catalyst-commons"
import { FailedDeploymentsManager, FailureReason, FailedDeployment, NoFailure } from "@katalyst/content/service/errors/FailedDeploymentsManager"
import { loadTestEnvironment } from "../E2ETestEnvironment"
import { Repository } from "@katalyst/content/storage/Repository"
import { DeploymentEventBase } from "@katalyst/content/service/deployments/DeploymentManager"
import { RepositoryFactory } from "@katalyst/content/storage/RepositoryFactory"

describe("Integration - Failed Deployments Manager", function() {

    const testEnv = loadTestEnvironment()
    const manager = new FailedDeploymentsManager()
    let repository: Repository

    beforeEach(async () => {
        const env = await testEnv.getEnvForNewDatabase()
        repository = await RepositoryFactory.create(env)
    })

    it(`When failures are reported, then the last status is returned`, async () => {
        const deployment = buildRandomDeployment()

        await reportDeployment({ deployment, reason: FailureReason.NO_ENTITY_OR_AUDIT })

        let status = await manager.getDeploymentStatus(repository.failedDeployments, deployment.entityType, deployment.entityId)
        expect(status).toBe(FailureReason.NO_ENTITY_OR_AUDIT)

        await reportDeployment({ deployment, reason: FailureReason.DEPLOYMENT_ERROR })

        status = await manager.getDeploymentStatus(repository.failedDeployments, deployment.entityType, deployment.entityId)
        expect(status).toBe(FailureReason.DEPLOYMENT_ERROR)
    })

    it(`When failures are reported, then all are reported correctly`, async () => {
        const deployment1 = buildRandomDeployment()
        const deployment2 = buildRandomDeployment()

        await reportDeployment({ deployment: deployment1, reason: FailureReason.NO_ENTITY_OR_AUDIT, description: 'description' })
        await reportDeployment({ deployment: deployment2, reason: FailureReason.DEPLOYMENT_ERROR })

        const [failed1, failed2]: Array<FailedDeployment> = await manager.getAllFailedDeployments(repository.failedDeployments)

        assertFailureWasDueToDeployment(failed1, deployment2)
        expect(failed1.reason).toBe(FailureReason.DEPLOYMENT_ERROR)
        expect(failed1.errorDescription).toBeUndefined()
        assertFailureWasDueToDeployment(failed2, deployment1)
        expect(failed2.reason).toBe(FailureReason.NO_ENTITY_OR_AUDIT)
        expect(failed2.errorDescription).toEqual('description')
    })

    it(`When successful deployment is reported, then all previous failures of such reported are deleted`, async () => {
        const deployment = buildRandomDeployment()

        await reportDeployment({ deployment, reason: FailureReason.DEPLOYMENT_ERROR })

        await manager.reportSuccessfulDeployment(repository.failedDeployments, deployment.entityType, deployment.entityId)

        const status = await manager.getDeploymentStatus(repository.failedDeployments, deployment.entityType, deployment.entityId)
        expect(status).toBe(NoFailure.NOT_MARKED_AS_FAILED)
    })

    function assertFailureWasDueToDeployment(failedDeployment: FailedDeployment, deployment: DeploymentEventBase) {
        expect(failedDeployment.entityId).toEqual(deployment.entityId)
        expect(failedDeployment.entityType).toEqual(deployment.entityType)
        expect(failedDeployment.originServerUrl).toEqual(deployment.originServerUrl)
        expect(failedDeployment.originTimestamp).toEqual(deployment.originTimestamp)
        expect(failedDeployment.failureTimestamp).toBeGreaterThanOrEqual(deployment.originTimestamp)
    }

    function reportDeployment({ deployment, reason, description }: { deployment: DeploymentEventBase; reason: FailureReason; description?: string }): Promise<null> {
        const { entityType, entityId, originTimestamp, originServerUrl } = deployment
        return manager.reportFailure(repository.failedDeployments, entityType, entityId, originTimestamp, originServerUrl, reason, description)
    }

    function buildRandomDeployment(): DeploymentEventBase {
        const originTimestamp = Date.now()
        const originServerUrl = internet.url()
        const event =  {
            entityType: EntityType.PROFILE,
            entityId: random.alphaNumeric(10),
            originTimestamp,
            originServerUrl
        }
        return event
    }

})
