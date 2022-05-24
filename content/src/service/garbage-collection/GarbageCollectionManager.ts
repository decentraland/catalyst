import { ILoggerComponent } from '@well-known-components/interfaces'
import { ContentFileHash, delay } from 'dcl-catalyst-commons'
import { DB_REQUEST_PRIORITY } from '../../repository/RepositoryQueue'
import { SystemProperty } from '../../service/system-properties/SystemProperties'
import { AppComponents } from '../../types'

export class GarbageCollectionManager {
  private LOGGER: ILoggerComponent.ILogger
  private hashesDeletedInLastSweep: Set<ContentFileHash> = new Set()
  private lastTimeOfCollection: number
  private nextGarbageCollectionTimeout: NodeJS.Timeout
  private stopping = false
  private sweeping = false

  constructor(
    private readonly components: Pick<
      AppComponents,
      'systemPropertiesManager' | 'repository' | 'deployer' | 'metrics' | 'logs' | 'storage'
    >,
    private readonly performGarbageCollection: boolean,
    private readonly sweepInterval: number
  ) {
    this.LOGGER = components.logs.getLogger('GarbageCollectionManager')
  }

  async start(): Promise<void> {
    if (this.performGarbageCollection) {
      this.stopping = false
      const lastCollectionTime = await this.components.systemPropertiesManager.getSystemProperty(
        SystemProperty.LAST_GARBAGE_COLLECTION_TIME
      )
      this.lastTimeOfCollection = lastCollectionTime ?? 0
      await this.performSweep()
    }
  }

  async stop(): Promise<void> {
    if (this.performGarbageCollection) {
      clearTimeout(this.nextGarbageCollectionTimeout)
      this.stopping = true
      await this.waitUntilSyncFinishes()
    }
  }

  /**
   * When it is time, we will calculate the hashes of all the overwritten deployments, and check if they are not being used by another deployment.
   * If they are not being used, then we will delete them.
   */
  async performSweep() {
    const newTimeOfCollection: number = Date.now()
    this.sweeping = true
    try {
      await this.components.repository.tx(
        async (transaction) => {
          const { end: endTimer } = this.components.metrics.startTimer('dcl_content_garbage_collection_time')

          const hashes = await transaction.content.findContentHashesNotBeingUsedAnymore(this.lastTimeOfCollection)

          this.components.metrics.increment('dcl_content_garbage_collection_items_total', {}, hashes.length)

          this.LOGGER.debug(`Hashes to delete are: (${hashes.join(',')})`)
          await this.components.storage.delete(hashes)
          await this.components.systemPropertiesManager.setSystemProperty(
            SystemProperty.LAST_GARBAGE_COLLECTION_TIME,
            newTimeOfCollection,
            transaction
          )
          this.hashesDeletedInLastSweep = new Set(hashes)

          endTimer()
        },
        { priority: DB_REQUEST_PRIORITY.HIGH }
      )
      this.lastTimeOfCollection = newTimeOfCollection
    } catch (error) {
      this.LOGGER.error(`Failed to perform garbage collection.`)
      this.LOGGER.error(error)
    } finally {
      if (!this.stopping) {
        this.nextGarbageCollectionTimeout = setTimeout(() => this.performSweep(), this.sweepInterval)
      }
      this.sweeping = false
    }
  }

  deletedInLastSweep(): Set<ContentFileHash> {
    return this.hashesDeletedInLastSweep
  }

  private waitUntilSyncFinishes(): Promise<void> {
    return new Promise(async (resolve) => {
      while (this.sweeping === true) {
        await delay('1s')
      }
      resolve()
    })
  }
}
