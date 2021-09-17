import { DeploymentWithAuditInfo, EntityId } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import PQueue from 'p-queue'
import { metricsComponent } from '../../../metrics'
import { ContentServerClient } from '../clients/ContentServerClient'

/**
 * This class processes a given history as a stream, and even makes some of the downloading in parallel.
 */
export class EventStreamProcessor {
  static readonly LOGGER = log4js.getLogger('EventStreamProcessor')

  constructor(
    private readonly checkIfAlreadyDeployed: (entityIds: EntityId[]) => Promise<Map<EntityId, boolean>>,
    private readonly deploymentBuilder: DeploymentPreparation
  ) {}

  /**
   * This method takes many deployment streams and tries to deploy them locally.
   *
   * Returns false if it had to break synchronization due to the size of the job.
   */
  async processDeployments(deploymentStream: AsyncIterable<DeploymentWithSource>): Promise<boolean> {
    const filtered: Set<EntityId> = new Set()

    const CONCURRENCY = 50
    const ENTITY_DEPLOYMENT_TIMEOUT = 600000 /* 10min */
    const MAX_QUEUED = 1000

    const jobQueue = new PQueue({
      concurrency: CONCURRENCY,
      autoStart: true,
      timeout: ENTITY_DEPLOYMENT_TIMEOUT
    })

    for await (const it of deploymentStream) {
      if (!it) continue

      if (jobQueue.size > MAX_QUEUED) {
        EventStreamProcessor.LOGGER.info(`Queued jobs: ${jobQueue.size}. Waiting to finish before continuing`)
        await jobQueue.onEmpty()
      }

      /**
       * Since deployments propagate across servers, it is very probable that we are receiving
       * duplicated entries. For each stream processing, we use a set to filter duplicated deployments
       * by entityId.
       */
      if (filtered.has(it.deployment.entityId)) {
        continue
      }
      filtered.add(it.deployment.entityId)

      // Filter out entities that have already been deployed locally
      const deployed = await this.checkIfAlreadyDeployed([it.deployment.entityId])
      if (deployed.get(it.deployment.entityId)) {
        continue
      }

      jobQueue.add(async () => {
        try {
          // Prepare the deployer function
          EventStreamProcessor.LOGGER.info(
            `Deploying entity (${it.deployment.entityType}, ${it.deployment.entityId}, ${new Date(
              it.deployment.entityTimestamp
            ).toISOString()})`
          )
          const performDeployment = await this.deploymentBuilder(it.deployment, it.source)
          // Perform the deployment
          await performDeployment()
          it.source.deploymentsSuccessful(it.deployment)
        } catch (error) {
          metricsComponent.increment('dcl_content_failed_deployments_total')
          EventStreamProcessor.LOGGER.error(
            `Failed when trying to deploy entity is (${it.deployment.entityType}, ${it.deployment.entityId}). Error was:\n${error}`
          )
        }
      })
    }

    await jobQueue.onIdle()

    return false
  }
}

export type DeploymentWithSource = { deployment: DeploymentWithAuditInfo; source: ContentServerClient }
type DeploymentPreparation = (
  event: DeploymentWithAuditInfo,
  preferred?: ContentServerClient
) => Promise<DeploymentExecution>
type DeploymentExecution = () => Promise<void>
