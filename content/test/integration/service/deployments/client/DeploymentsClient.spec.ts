import { TestServer } from "../../../TestServer"
import { Bean } from "@katalyst/content/Environment"
import { MockedSynchronizationManager } from "@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager"
import { buildDeployData } from "../../../E2ETestUtils"
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper"
import { loadTestEnvironment } from "../../../E2ETestEnvironment"
import { PartialDeploymentHistory } from "@katalyst/content/service/deployments/DeploymentManager"
import { DeploymentsClient } from "@katalyst/content/service/deployments/client/DeploymentsClient"
import { ControllerDeployment } from "@katalyst/content/controller/Controller"
import { ControllerDeploymentFactory } from "@katalyst/content/controller/ControllerDeploymentFactory"

describe("Integration - Deployments Client", function() {

    const testEnv = loadTestEnvironment()
    let server: TestServer

    beforeEach(async () => {
        server = await testEnv.configServer()
            .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
            .andBuild()
        await server.start()
    })

    it(`When history is consumed entirely, all the events are retrieved`, async () => {
        // Add some deployments
        for(let i=0; i<10; i=i+1) {
            const [deployData, ] = await buildDeployData(["X1,Y1"], "metadata")
            await server.deploy(deployData)
        }

        const { deployments } = await server.getDeployments()

        expect(deployments.length).toBe(10)

        await validateHistoryThroughClient(server, deployments)
        await validateHistoryThroughClient(server, deployments, 3)
        await validateHistoryThroughClient(server, deployments, 5)
        await validateHistoryThroughClient(server, deployments, 7)
    })

    async function validateHistoryThroughClient(server: TestServer, expectedDeployments: ControllerDeployment[], batchSize?: number): Promise<void> {
        const executions: {url:string, res: PartialDeploymentHistory}[] = []

        const deployments = await DeploymentsClient.consumeAllDeployments(new FetchHelper(), server.getAddress(), undefined, batchSize,
        (url:string, res: PartialDeploymentHistory) => {
            executions.push({
                url: url,
                res: res
            })
        })

        expect(deployments.map(deployment => ControllerDeploymentFactory.maskEntity(deployment))).toEqual(expectedDeployments)

        if (batchSize) {
            expect(executions.length).toBe(Math.ceil(expectedDeployments.length / batchSize))
            for(let i=0; i<executions.length-1; i++) {
                expect(executions[i].res.deployments.length).toBe(batchSize)
                expect(executions[i].res.pagination.offset).toBe(i*batchSize)
                expect(executions[i].res.pagination.limit).toBe(batchSize)
                expect(executions[i].res.pagination.moreData).toBe(true)
            }
            expect(executions[executions.length-1].res.deployments.length).toBeLessThanOrEqual(batchSize)
            expect(executions[executions.length-1].res.pagination.offset).toBe((executions.length-1)*batchSize)
            expect(executions[executions.length-1].res.pagination.limit).toBe(batchSize)
            expect(executions[executions.length-1].res.pagination.moreData).toBe(false)
        } else {
            expect(executions.length).toBe(1)
            expect(executions[0].res.deployments.length).toBeLessThanOrEqual(expectedDeployments.length)
            expect(executions[0].res.pagination.offset).toBe(0)
            expect(executions[0].res.pagination.limit).toBe(500)
            expect(executions[0].res.pagination.moreData).toBe(false)
        }

    }
})
