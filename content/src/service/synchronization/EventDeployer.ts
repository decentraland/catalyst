import { DeploymentWithAuditInfo, EntityType } from 'dcl-catalyst-commons'
import * as fs from 'fs'
import * as path from 'path'
import { FailureReason } from '../errors/FailedDeploymentsManager'
import { ClusterDeploymentsService, DeploymentContext, DeploymentResult } from '../Service'
import { ContentServerClient } from './clients/ContentServerClient'

export class EventDeployer {
  constructor(private readonly service: ClusterDeploymentsService) {}

  async deployEntityFromLocalDisk(entityId: string, authChain: any[], folder: string): Promise<void> {
    const entityFile = await fs.promises.readFile(path.join(folder, entityId))

    if (entityFile.length == 0) throw new Error('Trying to deploy empty entityFile')

    const deploymentResult = await this.service.deployEntity(
      [entityFile],
      entityId,
      { authChain },
      // TODO: revalidate LOCAL
      DeploymentContext.LOCAL
    )

    if (typeof deploymentResult == 'number') {
      return
    }

    if ('errors' in deploymentResult && deploymentResult.errors.length) {
      throw new Error(`Errors deploying entity(${entityId}): ${deploymentResult.errors.join(';')}`)
    }
  }

  async reportError(options: {
    deployment: { entityType: EntityType; entityId: string }
    reason: FailureReason
    description?: string
    source?: ContentServerClient
  }): Promise<null> {
    const { entityType, entityId } = options.deployment
    return this.service.reportErrorDuringSync(entityType, entityId, options.reason, options.description)
  }
}

export type DeploymentExecution = {
  metadata: {
    deploymentEvent: DeploymentWithAuditInfo
  }
  execution: () => Promise<DeploymentResult>
}

export type HistoryDeploymentOptions = {
  logging?: boolean
  preferredServer?: ContentServerClient
}
