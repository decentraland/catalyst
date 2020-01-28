import { TestServer } from "./TestServer"
import { deleteServerStorage, buildBaseEnv, buildDeployData } from "./E2ETestUtils"
import { MockedDAOClient } from "@katalyst/content/service/synchronization/clients/MockedDAOClient"
import ms from "ms"
import { Environment } from "@katalyst/content/Environment"
import { HistoryClient } from "@katalyst/content/service/history/client/HistoryClient"
import { DeploymentEvent, PartialDeploymentHistory } from "@katalyst/content/service/history/HistoryManager"

describe("History integration tests", function() {

    let server: TestServer

    beforeEach(async () => {
        const env: Environment = await buildBaseEnv('', 6060, ms("1m"), MockedDAOClient.withAddresses()).build()
        server = new TestServer(env)
        await server.start()
    })

    afterEach(async () => {
        await server.stop()
        deleteServerStorage(server)
    })

    it(`When history is consumed entirelly, all the events are retrieved`, async () => {
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

    async function validateHistoryThroughClient(server: TestServer, expectedEvents: DeploymentEvent[], batchSize?: number): Promise<void> {
        const executions: {url:string, res: PartialDeploymentHistory}[] = []

        const events = await HistoryClient.consumeAllHistory(server.getAddress(), undefined, undefined, undefined, batchSize,
        (url:string, res: PartialDeploymentHistory) => {
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
