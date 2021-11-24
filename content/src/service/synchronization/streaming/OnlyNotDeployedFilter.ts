import { EntityId } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import { Transform, TransformCallback } from 'stream'
import { metricsComponent } from '../../../metrics'

/**
 * Expose a stream transform that filters out already deployed entities.
 * We will use a buffer to accumulate a number of deployments, and when the number is reached, we
 * will check which of those deployments is new.
 */
export class OnlyNotDeployedFilter extends Transform implements Transform {
  private static readonly BUFFERED_DEPLOYMENTS = 300
  private static readonly LOGGER = log4js.getLogger('OnlyNotDeployedFilter')
  private readonly buffer: DeploymentWithSource[] = []

  constructor(private readonly checkIfAlreadyDeployed: (entityIds: EntityId[]) => Promise<Map<EntityId, boolean>>) {
    super({ objectMode: true })
  }

  _transform(deployment: DeploymentWithSource, _, done: TransformCallback): void {
    if (!deployment) {
      done()
      return
    }

    this.buffer.push(deployment)
    if (this.buffer.length >= OnlyNotDeployedFilter.BUFFERED_DEPLOYMENTS) {
      this.processBufferAndPushNonDeployed()
        .then(() => done())
        .catch((err) => done(err))
    } else {
      done()
    }
  }

  _flush(done: TransformCallback): void {
    if (this.buffer.length > 0) {
      this.processBufferAndPushNonDeployed()
        .then(() => done())
        .catch((err) => done(err))
    } else {
      done()
    }
  }

  private async processBufferAndPushNonDeployed(): Promise<void> {
    // since this function perform async operations, the buffer can still grow while it completes
    // the first step then is to copy the buffer to a local variable and then empty the shared buffer
    // to allow it to grow asynchronously
    const bufferCopy = this.buffer.slice()

    // Clear the shared buffer, to allow it to grow asynchronously
    this.buffer.length = 0

    // Find non deployed entities
    const ids = bufferCopy.map(({ deployment }) => deployment.entityId)
    try {
      const deployInfo = await this.checkIfAlreadyDeployed(ids)
      const newEntities: Set<EntityId> = new Set(
        Array.from(deployInfo.entries())
          .filter(([, deployed]) => !deployed)
          .map(([entityId]) => entityId)
      )

      const ignoredDeployments = bufferCopy.length - newEntities.size
      if (ignoredDeployments) {
        OnlyNotDeployedFilter.LOGGER.debug(
          `Ignoring ${ignoredDeployments} deployments because they were already deployed.`
        )
        metricsComponent.increment('dcl_content_ignored_deployments_total', {}, ignoredDeployments)
      }

      // Filter out already deployed entities and push the new ones
      bufferCopy
        .filter(({ deployment }) => newEntities.has(deployment.entityId))
        .forEach((deployment) => this.push(deployment))
    } catch (err) {
      OnlyNotDeployedFilter.LOGGER.error(`Couldn't filter the non deployed deployments due to DB heavy load`)

      throw err
    }
  }
}
