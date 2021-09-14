import { EntityId } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import { Transform } from 'stream'
import { DCL_CONTENT_IGNORED_DEPLOYMENTS_TOTAL } from '../../../ContentMetrics'
import { DeploymentWithSource } from './EventStreamProcessor'

/**
 * Expose a stream transform that filters out already deployed entities.
 * We will use a buffer to accumulate a number of deployments, and when the number is reached, we
 * will check which of those deployments is new.
 */
export class OnlyNotDeployedFilter extends Transform {
  private static readonly BUFFERED_DEPLOYMENTS = 300
  private static readonly LOGGER = log4js.getLogger('OnlyNotDeployedFilter')
  private readonly buffer: DeploymentWithSource[] = []

  constructor(private readonly checkIfAlreadyDeployed: (entityIds: EntityId[]) => Promise<Map<EntityId, boolean>>) {
    super({ objectMode: true })
  }

  async _transform(deployment: DeploymentWithSource, _, done) {
    this.buffer.push(deployment)
    if (this.buffer.length >= OnlyNotDeployedFilter.BUFFERED_DEPLOYMENTS) {
      await this.processBufferAndPushNonDeployed()
    }
    done()
  }

  async _flush(done) {
    if (this.buffer.length > 0) {
      await this.processBufferAndPushNonDeployed()
    }
    done()
  }

  private async processBufferAndPushNonDeployed(): Promise<void> {
    // Find non deployed entities
    const ids = this.buffer.map(({ deployment }) => deployment.entityId)
    const deployInfo = await this.checkIfAlreadyDeployed(ids)
    const newEntities: Set<EntityId> = new Set(
      Array.from(deployInfo.entries())
        .filter(([, deployed]) => !deployed)
        .map(([entityId]) => entityId)
    )

    const ignoredDeployments = this.buffer.length - newEntities.size
    if (ignoredDeployments) {
      OnlyNotDeployedFilter.LOGGER.debug(
        `Ignoring ${ignoredDeployments} deployments because they were already deployed.`
      )
      DCL_CONTENT_IGNORED_DEPLOYMENTS_TOTAL.inc(ignoredDeployments)
    }

    // Filter out already deployed entities and push the new ones
    this.buffer
      .filter(({ deployment }) => newEntities.has(deployment.entityId))
      .forEach((deployment) => this.push(deployment))

    // Clear the buffer
    this.buffer.length = 0
  }
}
