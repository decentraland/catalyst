import { TestServer } from "../../../TestServer"
import { Bean } from "@katalyst/content/Environment"
import { HistoryClient } from "@katalyst/content/service/history/client/HistoryClient"
import { LegacyDeploymentEvent, PartialDeploymentLegacyHistory } from "@katalyst/content/service/history/HistoryManager"
import { MockedSynchronizationManager } from "@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager"
import { buildDeployData } from "../../../E2ETestUtils"
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper"
import { loadTestEnvironment } from "../../../E2ETestEnvironment"

describe("Integration - History Client", function() {

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

        const allEvents = (await server.getHistory()).events

        expect(allEvents.length).toBe(10)

        await validateHistoryThroughClient(server, allEvents)
        await validateHistoryThroughClient(server, allEvents, 3)
        await validateHistoryThroughClient(server, allEvents, 5)
        await validateHistoryThroughClient(server, allEvents, 7)
    })

    async function validateHistoryThroughClient(server: TestServer, expectedEvents: LegacyDeploymentEvent[], batchSize?: number): Promise<void> {
        const executions: {url:string, res: PartialDeploymentLegacyHistory}[] = []

        const events = await HistoryClient.consumeAllHistory(new FetchHelper(), server.getAddress(), undefined, undefined, undefined, batchSize,
        (url:string, res: PartialDeploymentLegacyHistory) => {
            executions.push({
                url: url,
                res: res
            })
        })

        expect(events).toEqual(expectedEvents)

        if (batchSize) {
            expect(executions.length).toBe(Math.ceil(expectedEvents.length / batchSize))
            for(let i=0; i<executions.length-1; i++) {
                expect(executions[i].res.events.length).toBe(batchSize)
                expect(executions[i].res.pagination.offset).toBe(i*batchSize)
                expect(executions[i].res.pagination.limit).toBe(batchSize)
                expect(executions[i].res.pagination.moreData).toBe(true)
            }
            expect(executions[executions.length-1].res.events.length).toBeLessThanOrEqual(batchSize)
            expect(executions[executions.length-1].res.pagination.offset).toBe((executions.length-1)*batchSize)
            expect(executions[executions.length-1].res.pagination.limit).toBe(batchSize)
            expect(executions[executions.length-1].res.pagination.moreData).toBe(false)
        } else {
            expect(executions.length).toBe(1)
            expect(executions[0].res.events.length).toBeLessThanOrEqual(expectedEvents.length)
            expect(executions[0].res.pagination.offset).toBe(0)
            expect(executions[0].res.pagination.limit).toBe(500)
            expect(executions[0].res.pagination.moreData).toBe(false)
        }

    }
})
