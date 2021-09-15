import { DeploymentWithAuditInfo, EntityId } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import { metricsComponent } from '../../../metrics'
import { ContentServerClient } from '../clients/ContentServerClient'
import { HistoryDeploymentOptions } from '../EventDeployer'

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
   */
  async processDeployments(deploymentStream: AsyncIterable<DeploymentWithSource>, options?: HistoryDeploymentOptions) {
    const filtered: Set<EntityId> = new Set()

    for await (const it of deploymentStream) {
      if (!it) continue

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

      try {
        // Prepare the deployer function
        EventStreamProcessor.LOGGER.info(`Deploying entity (${it.deployment.entityType}, ${it.deployment.entityId})`)
        const performDeployment = await this.deploymentBuilder(it.deployment, it.source)
        // Perform the deployment
        await performDeployment()
        EventStreamProcessor.LOGGER.info(`Deployed entity (${it.deployment.entityType}, ${it.deployment.entityId})`)
      } catch (error) {
        metricsComponent.increment('dcl_content_failed_deployments_total')
        EventStreamProcessor.LOGGER.error(
          `Failed when trying to deploy entity is (${it.deployment.entityType}, ${it.deployment.entityId}). Error was:\n${error}`
        )
      }
    }
  }
}

export type DeploymentWithSource = { deployment: DeploymentWithAuditInfo; source: ContentServerClient }
type DeploymentPreparation = (
  event: DeploymentWithAuditInfo,
  preferred?: ContentServerClient
) => Promise<DeploymentExecution>
type DeploymentExecution = () => Promise<void>
