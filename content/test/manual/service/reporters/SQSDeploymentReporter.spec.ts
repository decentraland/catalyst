import { Entity, EntityType } from "@katalyst/content/service/Entity";
import { SQSDeploymentReporter } from "@katalyst/content/service/reporters/SQSDeploymentReporter";
import { EnvironmentConfig, Environment } from "@katalyst/content/Environment";

describe("SQS Deployment Reporter", () => {

    fit(`Simple event reporting`, async () => {
        const env: Environment = await Environment.getInstance()
        const result: {error?:string, messageId?:string} = await new Promise((resolve,) => {
            const sqsReporter = new SQSDeploymentReporter(
                env.getConfig(EnvironmentConfig.SQS_ACCESS_KEY_ID),
                env.getConfig(EnvironmentConfig.SQS_SECRET_ACCESS_KEY),
                "https://sqs.us-east-1.amazonaws.com/872049612737/content-migrator-pending",
                (error,messageId) => {
                    resolve({error,messageId})
                }
            )
            const timestamp = new Date().getTime()
            const entity: Entity = new Entity(`id-${timestamp}`, EntityType.SCENE, [], timestamp)
            sqsReporter.reportDeployment(entity, "ethAddress", "integration-test")
        })
        expect(result.error).toBeUndefined()
        expect(result.messageId).toBeDefined()
    });

})
