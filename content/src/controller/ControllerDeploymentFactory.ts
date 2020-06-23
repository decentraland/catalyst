import { Deployment as ControllerDeployment } from "dcl-catalyst-commons"
import { Deployment } from "../service/deployments/DeploymentManager"

export class ControllerDeploymentFactory {
    static deployment2ControllerEntity(deployment: Deployment): ControllerDeployment {
        return {
            ...deployment,
            content: deployment.content ? Array.from(deployment.content.entries()).map(([ key, hash ]) => ({ key, hash })) : []
        }
    }
}