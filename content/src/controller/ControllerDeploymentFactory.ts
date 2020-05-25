import { ControllerDeployment } from "./Controller"
import { Deployment } from "../service/deployments/DeploymentManager"

export class ControllerDeploymentFactory {
    static maskEntity(deployment: Deployment): ControllerDeployment {
        return {
            ...deployment,
            content: deployment.content ? Array.from(deployment.content.entries()).map(([ key, hash ]) => ({ key, hash })) : []
        }
    }
}