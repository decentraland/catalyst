import { ILoggerComponent } from '@well-known-components/interfaces'
import { findContentHashesNotBeingUsedAnymore } from '../../logic/database-queries/content-files-queries'
import { SYSTEM_PROPERTIES } from '../../ports/system-properties'
import { AppComponents, PROFILE_DURATION } from '../../types'
import SQL from 'sql-template-strings'

const PROFILE_CLEANUP_LIMIT = 1000

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
      'systemProperties' | 'metrics' | 'logs' | 'storage' | 'database' | 'clock' | 'activeEntities'
    >,
    private readonly performGarbageCollection: boolean,
    private readonly sweepInterval: number
  ) {
    this.LOGGER = components.logs.getLogger('GarbageCollectionManager')
  }

  async start(): Promise<void> {
    this.stopping = false
    const lastCollectionTime = await this.components.systemProperties.get(SYSTEM_PROPERTIES.lastGarbageCollectionTime)
    this.lastTimeOfCollection = lastCollectionTime ?? 0
    await this.performSweep()
  }

  async stop(): Promise<void> {
    this.stopping = true
    clearTimeout(this.nextGarbageCollectionTimeout)
    await this.waitUntilSyncFinishes()
  }

  /**
   * When it is time, we will calculate the hashes of all the overwritten deployments, and check if they are not being used by another deployment.
   * If they are not being used, then we will delete them.
   */
  async performSweep() {
    await this.components.activeEntities.clearOldProfiles(this.components.database)

    if (!this.performGarbageCollection) {
      return
    }

    const newTimeOfCollection: number = this.components.clock.now()
    this.sweeping = true
    const { end: endTimer } = this.components.metrics.startTimer('dcl_content_garbage_collection_time')
    try {
      {
        // NOTE: remove old profile deployments and their images, it will remove a max of ${PROFILE_CLEANUP_LIMIT} per iteration
        const timestamp = new Date(Date.now() - PROFILE_DURATION)
        const result = await this.components.database.queryWithValues<{ id: string; content_hash: string }>(
          SQL`SELECT d.id, cf.content_hash FROM deployments d left join content_files cf on cf.deployment = d.id WHERE d.entity_type = 'profile' AND entity_timestamp < ${timestamp} LIMIT ${PROFILE_CLEANUP_LIMIT}`,
          'gc_query_old_profile_deployments'
        )

        const deploymentsSet = new Set<string>()
        const hashesSet = new Set<string>()

        for (const { id, content_hash } of result.rows) {
          if (content_hash) {
            hashesSet.add(content_hash)
          }
          deploymentsSet.add(id)
        }

        const hashes = Array.from(hashesSet)
        const deployments = Array.from(deploymentsSet)

        this.LOGGER.info(`Profile cleanup will remove ${hashes.length} files`)
        await this.components.storage.delete(hashes)

        this.LOGGER.info(`Profile cleanup will remove ${hashes.length} from content_files`)
        await this.components.database.queryWithValues(
          SQL`DELETE FROM content_files WHERE content_hash = ANY(${hashes})`,
          'gc_delete_old_profile_content_files'
        )

        this.LOGGER.info(`Profile cleanup will remove foreign keys for ${deployments.length} deployments`)
        await this.components.database.queryWithValues(
          SQL`UPDATE deployments SET deleter_deployment = NULL WHERE deleter_deployment = ANY(${deployments})`,
          'gc_update_old_profile_deployments'
        )

        this.LOGGER.info(`Profile cleanup will remove ${deployments.length} deployments`)
        await this.components.database.queryWithValues(
          SQL`DELETE FROM deployments WHERE id = ANY(${deployments})`,
          'gc_delete_old_profile_deployments'
        )
      }

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

  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve()
      }, ms)
    })
  }

  private waitUntilSyncFinishes(): Promise<void> {
    return new Promise(async (resolve) => {
      while (this.sweeping === true) {
        await this.wait(1000)
      }
      resolve()
    })
  }
}
