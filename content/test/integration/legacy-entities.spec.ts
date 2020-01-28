import fetch from "node-fetch"
import FormData from "form-data"
import { EnvironmentConfig, EnvironmentBuilder } from "@katalyst/content/Environment"
import { ContentFile } from "@katalyst/content/service/Service"
import { deleteServerStorage, createIdentity, buildDeployDataWithIdentity, DeployData } from "./E2ETestUtils"
import { TestServer } from "./TestServer"
import { MockedContentAnalytics } from "../helpers/service/analytics/MockedContentAnalytics"
import { MockedSynchronizationManager } from "../helpers/service/synchronization/MockedSynchronizationManager"
import { MockedAccessChecker } from "../helpers/service/access/MockedAccessChecker"

describe("End 2 end - Legacy Entities", () => {

    const identity = createIdentity()
    let server: TestServer

    beforeEach(async () => {
        const env = await new EnvironmentBuilder()
            .withAnalytics(new MockedContentAnalytics())
            .withSynchronizationManager(new MockedSynchronizationManager())
            .withAccessChecker(new MockedAccessChecker())
            .withConfig(EnvironmentConfig.SERVER_PORT, 8080)
            .withConfig(EnvironmentConfig.METRICS, false)
            .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, identity.address)
            .withConfig(EnvironmentConfig.ALLOW_LEGACY_ENTITIES, true)
            .build()
        server = new TestServer(env)
        await server.start()
    })

    afterEach(() => {
        server.stop()
        deleteServerStorage(server)
    })

    it(`When a non-decentraland address tries to deploy a legacy entity, then an exception is thrown`, async () => {
        // Prepare entity to deploy
        const [deployData, ] = await buildDeployDataWithIdentity(["0,0", "0,1"], "metadata", createIdentity())

        // Try to deploy the entity
        await deployLegacy(server, deployData, `Expected an address owned by decentraland. Instead, we found ${deployData.ethAddress}`)
    });

    it(`When a decentraland address tries to deploy a legacy entity, then it is successful`, async () => {
        // Prepare entity to deploy
        const [deployData, ] = await buildDeployDataWithIdentity(["0,0", "0,1"], "metadata", identity)

        // Deploy the entity
        await deployLegacy(server, deployData)
    });

})

async function deployLegacy(server: TestServer, deployData: DeployData, errorMessage?: string) {
    const form = new FormData();
    form.append('entityId'      , deployData.entityId)
    form.append('ethAddress'    , deployData.ethAddress)
    form.append('signature'     , deployData.signature)
    form.append('version'       , "v2")
    form.append('migration_data', JSON.stringify({ data: "data" }))

    deployData.files.forEach((f: ContentFile) => form.append(f.name, f.content, { filename: f.name }))

    const deployResponse = await fetch(`${server.getAddress()}/legacy-entities`, { method: 'POST', body: form })
    if (errorMessage) {
        expect(deployResponse.ok).toBe(false)
        const text = await deployResponse.text()
        expect(text).toBe(errorMessage)
    } else {
        expect(deployResponse.ok).toBe(true)
    }
}