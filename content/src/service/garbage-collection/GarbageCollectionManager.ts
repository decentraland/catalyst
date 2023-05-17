import { ILoggerComponent } from '@well-known-components/interfaces'
import { delay } from 'dcl-catalyst-commons'
import { findContentHashesNotBeingUsedAnymore } from '../../logic/database-queries/content-files-queries'
import { SYSTEM_PROPERTIES } from '../../ports/system-properties'
import { AppComponents } from '../../types'

export class GarbageCollectionManager {
  private LOGGER: ILoggerComponent.ILogger
  private hashesDeletedInLastSweep: Set<string> = new Set()
  private lastTimeOfCollection: number
  private nextGarbageCollectionTimeout: NodeJS.Timeout
  private stopping = false
  private sweeping = false

  constructor(
    private readonly components: Pick<
      AppComponents,
      'systemProperties' | 'metrics' | 'logs' | 'storage' | 'database' | 'clock'
    >,
    private readonly performGarbageCollection: boolean,
    private readonly sweepInterval: number
  ) {
    this.LOGGER = components.logs.getLogger('GarbageCollectionManager')
  }

  async start(): Promise<void> {
    if (this.performGarbageCollection) {
      this.stopping = false
      const lastCollectionTime = await this.components.systemProperties.get(SYSTEM_PROPERTIES.lastGarbageCollectionTime)
      this.lastTimeOfCollection = lastCollectionTime ?? 0
      await this.performSweep()
    }
  }

  async stop(): Promise<void> {
    if (this.performGarbageCollection) {
      this.stopping = true
      clearTimeout(this.nextGarbageCollectionTimeout)
      await this.waitUntilSyncFinishes()
    }
  }

  /**
   * When it is time, we will calculate the hashes of all the overwritten deployments, and check if they are not being used by another deployment.
   * If they are not being used, then we will delete them.
   */
  async performSweep() {
    const newTimeOfCollection: number = this.components.clock.now()
    this.sweeping = true
    const { end: endTimer } = this.components.metrics.startTimer('dcl_content_garbage_collection_time')
    try {
      const hashes = await findContentHashesNotBeingUsedAnymore(this.components.database, this.lastTimeOfCollection)

      this.components.metrics.increment('dcl_content_garbage_collection_items_total', {}, hashes.length)

      this.LOGGER.debug(`Hashes to delete are: (${hashes.join(',')})`)
      await this.components.storage.delete(hashes)
      await this.components.systemProperties.set(SYSTEM_PROPERTIES.lastGarbageCollectionTime, newTimeOfCollection)
      this.hashesDeletedInLastSweep = new Set(hashes)

      this.lastTimeOfCollection = newTimeOfCollection
    } catch (error) {
      this.LOGGER.error(`Failed to perform garbage collection.`)
      this.LOGGER.error(error)
    } finally {
      if (!this.stopping) {
        this.nextGarbageCollectionTimeout = setTimeout(() => this.performSweep(), this.sweepInterval)
      }
      this.sweeping = false
      endTimer()
    }
  }

  deletedInLastSweep(): Set<string> {
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
