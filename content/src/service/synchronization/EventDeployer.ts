import log4js from 'log4js'
import { ENTITY_FILE_NAME, ContentFileHash, DeploymentWithAuditInfo } from 'dcl-catalyst-commons'
import { Readable } from 'stream'
import { ContentServerClient } from './clients/ContentServerClient'
import { Entity } from '../Entity'
import { ClusterDeploymentsService, DeploymentResult, InvalidResult, isSuccessfullDeployment } from '../Service'
import { ContentCluster } from './ContentCluster'
import { tryOnCluster } from './ClusterUtils'
import { EntityFactory } from '../EntityFactory'
import { EventStreamProcessor } from './streaming/EventStreamProcessor'
import { FailureReason } from '../errors/FailedDeploymentsManager'
import { ContentFile } from '../../controller/Controller'

export class EventDeployer {
  private static readonly LOGGER = log4js.getLogger('EventDeployer')

  private readonly eventProcessor: EventStreamProcessor

  constructor(private readonly cluster: ContentCluster, private readonly service: ClusterDeploymentsService) {
    this.eventProcessor = new EventStreamProcessor(
      (entityIds) => this.service.areEntitiesAlreadyDeployed(entityIds),
      (event, source) => this.wrapDeployment(this.prepareDeployment(event, source))
    )
  }

  async processAllDeployments(deployments: Readable[], options?: HistoryDeploymentOptions) {
    // Process history and deploy it
    return this.eventProcessor.processDeployments(deployments, options)
  }

  /** Download and prepare everything necessary to deploy an entity */
  private async prepareDeployment(
    deployment: DeploymentWithAuditInfo,
    source?: ContentServerClient
  ): Promise<DeploymentExecution> {
    EventDeployer.LOGGER.trace(`Downloading files for entity (${deployment.entityType}, ${deployment.entityId})`)

    // Download the entity file
    const entityFile: ContentFile | undefined = await this.getEntityFile(deployment, source)

    const { auditInfo } = deployment

    if (entityFile) {
      if (auditInfo.overwrittenBy) {
        // Deploy the entity as overwritten
        return this.buildDeploymentExecution(deployment, () =>
          this.service.deployOverwrittenEntityFromCluster(entityFile, deployment.entityId, auditInfo)
        )
      } else {
        // Build entity
        const entity: Entity = EntityFactory.fromFile(entityFile, deployment.entityId)

        // Download all entity's files
        const files: ContentFile[] | undefined = await this.getContentFiles(entity, source)

        if (files) {
          // Add the entity file to the list of files
          files.unshift(entityFile)

          // Since we could fetch all files, deploy the new entity normally
          return this.buildDeploymentExecution(deployment, () =>
            this.service.deployEntityFromCluster(files, deployment.entityId, auditInfo)
          )
        } else {
          // Looks like there was a problem fetching one of the files
          await this.reportError(deployment, FailureReason.FETCH_PROBLEM)
          throw new Error('Failed to download some content')
        }
      }
    } else {
      // It looks like we could not fetch the entity file
      await this.reportError(deployment, FailureReason.NO_ENTITY_OR_AUDIT)
      throw new Error('Failed to fetch the entity file')
    }
  }

  /**
   * Get all the files needed to deploy the new entity
   */
  private async getContentFiles(entity: Entity, source?: ContentServerClient): Promise<ContentFile[] | undefined> {
    // Read the entity, and get all content file hashes
    const allFileHashes: ContentFileHash[] = Array.from(entity.content?.values() ?? [])

    // Check which files we already have
    const unknownFileHashes = await this.filterOutKnownFiles(allFileHashes)
    EventDeployer.LOGGER.trace(
      `In total, will need to download ${unknownFileHashes.length} files for entity (${entity.type}, ${entity.id})`
    )

    // Download all content files
    const files: ContentFile[] = []
    for (let i = 0; i < unknownFileHashes.length; i++) {
      const fileHash = unknownFileHashes[i]
      EventDeployer.LOGGER.trace(
        `Going to download file ${i + 1}/${unknownFileHashes.length} for entity (${entity.type}, ${
          entity.id
        }). Hash is ${fileHash}`
      )
      const file = await this.getFileOrUndefined(fileHash, source)
      if (file) {
        files.push(file)
        EventDeployer.LOGGER.trace(
          `Downloaded file ${i + 1}/${unknownFileHashes.length} for entity (${entity.type}, ${
            entity.id
          }). Hash was ${fileHash}`
        )
      } else {
        EventDeployer.LOGGER.trace(
          `Failed to download file ${i + 1}/${unknownFileHashes.length} for entity (${entity.type}, ${
            entity.id
          }). Hash was ${fileHash}. Will cancel content download`
        )
        return undefined
      }
    }

    return files
  }

  private async getEntityFile(
    deployment: DeploymentWithAuditInfo,
    source?: ContentServerClient
  ): Promise<ContentFile | undefined> {
    const file: ContentFile | undefined = await this.getFileOrUndefined(deployment.entityId, source)

    // If we could download the entity file, rename it
    if (file) {
      file.name = ENTITY_FILE_NAME
    }
    return file
  }

  /**
   * This method tries to get a file from the other servers on the DAO. If all the request fail, then it returns 'undefined'.
   */
  private getFileOrUndefined(
    fileHash: ContentFileHash,
    source?: ContentServerClient
  ): Promise<ContentFile | undefined> {
    return this.tryOnClusterOrUndefined(
      (server) => server.getContentFile(fileHash),
      this.cluster,
      `get file with hash '${fileHash}'`,
      { preferred: source }
    )
  }

  private async filterOutKnownFiles(hashes: ContentFileHash[]): Promise<ContentFileHash[]> {
    // Check if we already have any of the files
    const availableContent: Map<ContentFileHash, boolean> = await this.service.isContentAvailable(hashes)

    // Filter out files that we already have
    return Array.from(availableContent.entries())
      .filter(([_, isAlreadyAvailable]) => !isAlreadyAvailable)
      .map(([fileHash, _]) => fileHash)
  }

  private reportError(deployment: DeploymentWithAuditInfo, reason: FailureReason, description?: string): Promise<null> {
    const { entityType, entityId, auditInfo } = deployment
    const { originTimestamp, originServerUrl } = auditInfo
    return this.service.reportErrorDuringSync(
      entityType,
      entityId,
      originTimestamp,
      originServerUrl,
      reason,
      description
    )
  }

  private buildDeploymentExecution(
    deploymentEvent: DeploymentWithAuditInfo,
    execution: () => Promise<DeploymentResult>
  ): DeploymentExecution {
    return {
      metadata: {
        deploymentEvent
      },
      execution
    }
  }

  /** Wrap the deployment, so if it fails, we can take action */
  private async wrapDeployment(deploymentPreparation: Promise<DeploymentExecution>): Promise<() => Promise<void>> {
    const deploymentExecution = await deploymentPreparation
    return async () => {
      try {
        const deploymentResult: DeploymentResult = await deploymentExecution.execution()
        if (isSuccessfullDeployment(deploymentResult)) {
          // The deployment failed, so we report it
          await this.reportError(
            deploymentExecution.metadata.deploymentEvent,
            FailureReason.DEPLOYMENT_ERROR,
            (deploymentResult as InvalidResult).errors.join('\n')
          )
        } else {
          // The deployment failed, so we report it
          await this.reportError(
            deploymentExecution.metadata.deploymentEvent,
            FailureReason.DEPLOYMENT_ERROR,
            (deploymentResult as InvalidResult).errors.join('\n')
          )
        }
      } catch (error) {
        // The deployment failed, so we report it
        await this.reportError(
          deploymentExecution.metadata.deploymentEvent,
          FailureReason.DEPLOYMENT_ERROR,
          error.message
        )
        // Re throw the error
        throw error
      }
    }
  }

  /** Execute an operation on the cluster, but return 'undefined' if it fails */
  private async tryOnClusterOrUndefined<T>(
    execution: (server: ContentServerClient) => Promise<T>,
    cluster: ContentCluster,
    description: string,
    options?: { retries?: number; preferred?: ContentServerClient }
  ): Promise<T | undefined> {
    try {
      return await tryOnCluster(execution, cluster, description, options)
    } catch (error) {
      return undefined
    }
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
