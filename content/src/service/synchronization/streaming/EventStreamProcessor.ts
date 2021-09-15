import { DeploymentWithAuditInfo, EntityId } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import ms from 'ms'
import parallelTransform from 'parallel-transform'
import { Readable, Writable } from 'stream'
import { metricsComponent } from '../../../metrics'
import { ContentServerClient } from '../clients/ContentServerClient'
import { HistoryDeploymentOptions } from '../EventDeployer'
import { OnlyNotDeployedFilter } from './OnlyNotDeployedFilter'
import { awaitablePipeline, mergeStreams, streamFilter } from './StreamHelper'
import { setupStreamTimeout } from './utils'

/**
 * This class processes a given history as a stream, and even makes some of the downloading in parallel.
 */
export class EventStreamProcessor {
  private static readonly LOGGER = log4js.getLogger('EventStreamProcessor')
  private static readonly PARALLEL_DOWNLOAD_WORKERS = 15

  constructor(
    private readonly checkIfAlreadyDeployed: (entityIds: EntityId[]) => Promise<Map<EntityId, boolean>>,
    private readonly deploymentBuilder: DeploymentPreparation,
    private readonly syncStreamTimeout: string
  ) {}

  /**
   * This method takes many deployment streams and tries to deploy them locally.
   */
  async processDeployments(deployments: Readable[], options?: HistoryDeploymentOptions) {
    // Merge the streams from the different servers
    const merged = mergeStreams(deployments)

    setupStreamTimeout(merged, ms(this.syncStreamTimeout))

    // A transform that will filter out duplicate deployments
    const filterOutDuplicates = this.filterOutDuplicates()

    // This transform will filter out entities that have already been deployed locally
    const filterOutAlreadyDeployed = new OnlyNotDeployedFilter((entityIds) => this.checkIfAlreadyDeployed(entityIds))

    // Build a transform stream that process the deployment info and prepares the deployment
    const downloadFilesTransform = this.prepareDeploymentBuilder()

    // Create writer stream that deploys the entity on this server
    const deployer = this.prepareStreamDeployer(options)

    // Build and execute the pipeline
    try {
      await awaitablePipeline(merged, filterOutDuplicates, filterOutAlreadyDeployed, downloadFilesTransform, deployer)
    } catch (error) {
      EventStreamProcessor.LOGGER.error(`Something failed when trying to deploy the history:\n${error}`)
    }
  }

  /**
   * Since deployments propagate across servers, it is very probable that we are receiving
   * duplicated entries. For each stream processing, we use a set to filter duplicated deployments
   * by entityId.
   */
  private filterOutDuplicates() {
    const known: Set<EntityId> = new Set()
    return streamFilter(({ deployment }: DeploymentWithSource) => {
      if (known.has(deployment.entityId)) {
        return false
      } else {
        known.add(deployment.entityId)
        return true
      }
    })
  }

  /**
   * Build a transform stream that takes the deployment information and downloads all files necessary to deploy it locally.
   */
  private prepareDeploymentBuilder() {
    return parallelTransform(
      EventStreamProcessor.PARALLEL_DOWNLOAD_WORKERS,
      { objectMode: true, ordered: false },
      async ({ deployment: deploymentEvent, source }: DeploymentWithSource, done) => {
        try {
          EventStreamProcessor.LOGGER.trace(
            `Preparing deployment. Entity (${deploymentEvent.entityType}, ${deploymentEvent.entityId})`
          )
          const execution = await this.deploymentBuilder(deploymentEvent, source)
          EventStreamProcessor.LOGGER.trace(
            `Deployment prepared. Entity (${deploymentEvent.entityType}, ${deploymentEvent.entityId})`
          )
          done(null, [deploymentEvent.entityType, deploymentEvent.entityId, execution])
        } catch (error) {
          EventStreamProcessor.LOGGER.error(
            `Failed preparing the deployment. Entity is (${deploymentEvent.entityType}, ${deploymentEvent.entityId}). Error was:\n${error}`
          )
          done(null, null)
        }
      }
    )
  }

  /** Build the stream writer that will execute the deployment */
  private prepareStreamDeployer(options?: HistoryDeploymentOptions) {
    return new Writable({
      objectMode: true,
      write: async ([entityType, entityId, performDeployment], _, done) => {
        try {
          await performDeployment()
          if (options?.logging) {
            EventStreamProcessor.LOGGER.info(`Deployed entity (${entityType}, ${entityId})`)
          } else {
            EventStreamProcessor.LOGGER.trace(`Deployed entity (${entityType}, ${entityId})`)
          }
          done()
        } catch (error) {
          metricsComponent.increment('dcl_content_failed_deployments_total')
          EventStreamProcessor.LOGGER.error(
            `Failed when trying to deploy entity is (${entityType}, ${entityId}). Error was:\n${error}`
          )
          done()
        }
      }
    })
  }
}

export type DeploymentWithSource = { deployment: DeploymentWithAuditInfo; source: ContentServerClient }
type DeploymentPreparation = (
  event: DeploymentWithAuditInfo,
  preferred?: ContentServerClient
) => Promise<DeploymentExecution>
type DeploymentExecution = () => Promise<void>
