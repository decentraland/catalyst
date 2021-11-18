import { ContentFileHash, DeploymentWithAuditInfo } from 'dcl-catalyst-commons'
import * as fs from 'fs'
import log4js from 'log4js'
import * as path from 'path'
import { Readable } from 'stream'
import { metricsComponent } from '../../metrics'
import { Entity } from '../Entity'
import { EntityFactory } from '../EntityFactory'
import { FailureReason } from '../errors/FailedDeploymentsManager'
import { ClusterDeploymentsService, DeploymentContext, DeploymentResult, isInvalidDeployment } from '../Service'
import { ContentServerClient } from './clients/ContentServerClient'
import { tryOnCluster } from './ClusterUtils'
import { ContentCluster } from './ContentCluster'
import { EventStreamProcessor } from './streaming/EventStreamProcessor'

function buildDeploymentExecution(
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

export class EventDeployer {
  private static readonly LOGGER = log4js.getLogger('EventDeployer')

  private readonly eventProcessor: EventStreamProcessor

  constructor(
    private readonly cluster: ContentCluster,
    private readonly service: ClusterDeploymentsService,
    syncStreamTimeout: string
  ) {
    this.eventProcessor = new EventStreamProcessor(
      (entityIds) => this.service.areEntitiesAlreadyDeployed(entityIds),
      (event, source) => this.wrapDeployment(this.prepareDeployment(event, source)),
      syncStreamTimeout
    )
  }

  async processAllDeployments(
    deployments: Readable[],
    options?: HistoryDeploymentOptions,
    shouldIgnoreTimeout = false
  ): Promise<void> {
    // Process history and deploy it
    return this.eventProcessor.processDeployments(deployments, options, shouldIgnoreTimeout)
  }

  async deployEntityFromLocalDisk(entityId: string, auditInfo: any, folder: string) {
    const entityFile = await fs.promises.readFile(path.join(folder, entityId))

    if (entityFile.length == 0) throw new Error('Trying to deploy empty entityFile')

    return this.service.deployEntity(
      [entityFile],
      entityId,
      auditInfo,
      // TODO: revalidate LOCAL
      DeploymentContext.LOCAL
    )
  }

  /** Download and prepare everything necessary to deploy an entity */
  private async prepareDeployment(
    deployment: DeploymentWithAuditInfo,
    source?: ContentServerClient
  ): Promise<DeploymentExecution> {
    EventDeployer.LOGGER.trace(`Downloading files for entity (${deployment.entityType}, ${deployment.entityId})`)

    // Download the entity file
    const { end: stopTimer } = metricsComponent.startTimer('dcl_content_download_time', {
      remote_catalyst: source?.getContentUrl() || 'undefined'
    })
    const entityFile: Buffer | undefined = await this.getEntityFile(deployment, source)
    stopTimer()

    const { auditInfo } = deployment

    if (entityFile) {
      const isLegacyEntity = !!auditInfo.migrationData
      if (auditInfo.overwrittenBy) {
        metricsComponent.increment('dcl_content_downloaded_total', { overwritten: 'true' })
        // Deploy the entity as overwritten and only download entity file to avoid storing content files for deployments that are no pointed at
        return buildDeploymentExecution(deployment, () =>
          this.service.deployEntity(
            [entityFile],
            deployment.entityId,
            auditInfo,
            isLegacyEntity ? DeploymentContext.OVERWRITTEN_LEGACY_ENTITY : DeploymentContext.OVERWRITTEN
          )
        )
      } else {
        metricsComponent.increment('dcl_content_downloaded_total', { overwritten: 'false' })
        // Parse as JSON the entity and create an object
        const entity: Entity = EntityFactory.fromBufferWithId(entityFile, deployment.entityId)

        // Download all entity's files as we need all content
        const files: Buffer[] | undefined = await this.getContentFiles(entity, source)

        if (files) {
          // Add the entity file to the list of files
          files.unshift(entityFile)

          // Since we could fetch all files, deploy the new entity normally
          return buildDeploymentExecution(deployment, () =>
            this.service.deployEntity(
              files,
              deployment.entityId,
              auditInfo,
              isLegacyEntity ? DeploymentContext.SYNCED_LEGACY_ENTITY : DeploymentContext.SYNCED
            )
          )
        } else {
          // Looks like there was a problem fetching one of the files
          await this.reportError({ deployment, reason: FailureReason.FETCH_PROBLEM, source })
          throw new Error('Failed to download some content')
        }
      }
    } else {
      // It looks like we could not fetch the entity file
      await this.reportError({ deployment, reason: FailureReason.NO_ENTITY_OR_AUDIT, source })
      throw new Error('Failed to fetch the entity file')
    }
  }

  /**
   * Get all the files needed to deploy the new entity
   */
  private async getContentFiles(entity: Entity, source?: ContentServerClient): Promise<Buffer[] | undefined> {
    // Read the entity, and get all content file hashes
    const allFileHashes: ContentFileHash[] = Array.from(entity.content?.values() ?? [])

    // Check which files we already have
    const unknownFileHashes = await this.filterOutKnownFiles(allFileHashes)
    EventDeployer.LOGGER.trace(
      `In total, will need to download ${unknownFileHashes.length} files for entity (${entity.type}, ${entity.id})`
    )

    // Download all content files
    const files: Buffer[] = []
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
        EventDeployer.LOGGER.error(
          `Failed to download file ${i + 1}/${unknownFileHashes.length} for entity (${entity.type}, ${
            entity.id
          }). Hash was ${fileHash}. Will cancel content download`
        )
        return undefined
      }
    }

    return files
  }

  private getEntityFile(
    deployment: DeploymentWithAuditInfo,
    source?: ContentServerClient
  ): Promise<Buffer | undefined> {
    return this.getFileOrUndefined(deployment.entityId, source)
  }

  /**
   * This method tries to get a file from the other servers on the DAO. If all the request fail, then it returns 'undefined'.
   */
  private getFileOrUndefined(fileHash: ContentFileHash, source?: ContentServerClient): Promise<Buffer | undefined> {
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

  private reportError(options: {
    deployment: DeploymentWithAuditInfo
    reason: FailureReason
    description?: string
    source?: ContentServerClient
  }): Promise<null> {
    const { entityType, entityId } = options.deployment
    return this.service.reportErrorDuringSync(entityType, entityId, options.reason, options.description)
  }

  /** Wrap the deployment, so if it fails, we can take action */
  private async wrapDeployment(deploymentPreparation: Promise<DeploymentExecution>): Promise<() => Promise<void>> {
    const deploymentExecution: DeploymentExecution = await deploymentPreparation
    return async () => {
      try {
        const deploymentResult: DeploymentResult = await deploymentExecution.execution()
        if (isInvalidDeployment(deploymentResult)) {
          // The deployment failed, so we report it
          await this.reportError({
            deployment: deploymentExecution.metadata.deploymentEvent,
            reason: FailureReason.DEPLOYMENT_ERROR,
            description: deploymentResult.errors.join('\n')
          })
        }
      } catch (error) {
        // The deployment failed, so we report it
        await this.reportError({
          deployment: deploymentExecution.metadata.deploymentEvent,
          reason: FailureReason.DEPLOYMENT_ERROR,
          description: error.message
        })
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
      EventDeployer.LOGGER.error(error)
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
