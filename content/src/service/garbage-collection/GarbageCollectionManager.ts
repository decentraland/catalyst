import { createJobComponent } from '@dcl/job-component'
import { IBaseComponent, START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { findContentHashesNotBeingUsedAnymore } from '../../logic/database-queries/content-files-queries'
import { SYSTEM_PROPERTIES } from '../../ports/system-properties'
import { AppComponents, PROFILE_DURATION } from '../../types'
import SQL from 'sql-template-strings'

const PROFILE_CLEANUP_LIMIT = 10000

export type GCStaleProfilesResult = {
  deletedHashes: Set<string>
  deletedDeployments: Set<string>
}

export type SweepResult = {
  gcProfileActiveEntitiesResult?: Set<string>
  gcUnusedHashResult?: Set<string>
  gcStaleProfilesResult?: GCStaleProfilesResult
}

export type IGarbageCollectionComponent = IBaseComponent & {
  getLastSweepResults(): SweepResult | undefined
}

export function createGarbageCollectionComponent(
  components: Pick<
    AppComponents,
    'systemProperties' | 'metrics' | 'logs' | 'storage' | 'database' | 'clock' | 'activeEntities'
  >,
  performGarbageCollection: boolean,
  sweepInterval: number
): IGarbageCollectionComponent {
  const logger = components.logs.getLogger('GarbageCollectionManager')
  let lastSweepResult: SweepResult | undefined = undefined
  let lastTimeOfCollection = 0

  async function gcUnusedHashes(): Promise<Set<string>> {
    const hashes = await findContentHashesNotBeingUsedAnymore(components.database, lastTimeOfCollection)

    components.metrics.increment('dcl_content_garbage_collection_items_total', {}, hashes.length)

    logger.debug(`Hashes to delete are: (${hashes.join(',')})`)
    await components.storage.delete(hashes)
    return new Set<string>(hashes)
  }

  // NOTE: remove old profile deployments and their images,
  // it will remove a max of ${PROFILE_CLEANUP_LIMIT}
  async function gcStaleProfiles(oldProfileSince: Date): Promise<GCStaleProfilesResult> {
    const result = await components.database.queryWithValues<{ id: string; content_hash: string }>(
      SQL`SELECT d.id, cf.content_hash
          FROM deployments d
          LEFT JOIN content_files cf on cf.deployment = d.id
          WHERE d.entity_type = 'profile'
          AND entity_timestamp < ${oldProfileSince}
          AND NOT EXISTS (
            SELECT 1 FROM active_pointers ap
            WHERE ap.entity_id = d.entity_id
            AND ap.pointer ~ '^default[0-9]+$'
          )
          LIMIT ${PROFILE_CLEANUP_LIMIT}`,
      'gc_old_profiles_query_old_deployments'
    )

    if (result.rowCount === 0) {
      logger.info(`Profile cleanup: no profiles to remove`)
      return {
        deletedHashes: new Set<string>(),
        deletedDeployments: new Set<string>()
      }
    }

    const deploymentsSet = new Set<string>()
    const hashesSet = new Set<string>()

    for (const { id, content_hash } of result.rows) {
      if (content_hash) {
        hashesSet.add(content_hash)
      }
      deploymentsSet.add(id)
    }

    const hashesInUse = await components.database.queryWithValues<{ content_hash: string }>(
      SQL`SELECT content_hash FROM content_files cf inner join deployments d on cf.deployment = d.id WHERE content_hash = ANY(${Array.from(
        hashesSet
      )}) AND d.entity_timestamp > ${oldProfileSince}`,
      'gc_old_profiles_check_hashes_in_use'
    )

    for (const { content_hash } of hashesInUse.rows) {
      hashesSet.delete(content_hash)
    }

    const hashes = Array.from(hashesSet)
    const deployments = Array.from(deploymentsSet)

    logger.info(`Profile cleanup will remove ${hashes.length} files`)
    await components.storage.delete(hashes)

    logger.info(`Profile cleanup will remove ${hashes.length} from content_files`)
    await components.database.queryWithValues(
      SQL`DELETE FROM content_files WHERE deployment = ANY(${deployments})`,
      'gc_old_profiles_delete_content_files'
    )

    logger.info(`Profile cleanup will remove foreign keys for ${deployments.length} deployments`)
    await components.database.queryWithValues(
      SQL`UPDATE deployments SET deleter_deployment = NULL WHERE deleter_deployment = ANY(${deployments})`,
      'gc_old_profiles_update_deployments'
    )

    logger.info(`Profile cleanup will remove ${deployments.length} deployments`)
    await components.database.queryWithValues(
      SQL`DELETE FROM deployments WHERE id = ANY(${deployments})`,
      'gc_old_profiles_delete_deployments'
    )

    return {
      deletedHashes: hashesSet,
      deletedDeployments: deploymentsSet
    }
  }

  async function gcProfileActiveEntities(oldProfileSince: Date): Promise<Set<string>> {
    logger.info('Running clear old profiles process')

    const result = await components.database.queryWithValues<{ pointer: string }>(
      SQL`DELETE FROM active_pointers ap
          USING deployments d
          WHERE d.entity_id = ap.entity_id
          AND entity_type = 'profile'
          AND entity_timestamp < ${oldProfileSince}
          AND ap.pointer !~ '^default[0-9]+$'
          RETURNING ap.pointer`,
      'gc_old_profiles_delete_active_pointers'
    )

    const pointers = result.rows.map((r) => r.pointer)
    logger.info(`Clear old profiles process: ${pointers.length} active pointers deleted`)
    await components.activeEntities.clearPointers(pointers)

    return new Set(pointers)
  }

  async function performSweep() {
    const lastCollectionTime = await components.systemProperties.get(SYSTEM_PROPERTIES.lastGarbageCollectionTime)
    lastTimeOfCollection = lastCollectionTime ?? 0

    const oldProfileSince = new Date(Date.now() - PROFILE_DURATION)
    lastSweepResult = {}

    const gcProfileActiveEntitiesResult = await gcProfileActiveEntities(oldProfileSince)
    lastSweepResult.gcProfileActiveEntitiesResult = gcProfileActiveEntitiesResult

    if (!performGarbageCollection) {
      return
    }

    const newTimeOfCollection: number = components.clock.now()
    const { end: endTimer } = components.metrics.startTimer('dcl_content_garbage_collection_time')
    try {
      lastSweepResult.gcUnusedHashResult = await gcUnusedHashes()
      lastSweepResult.gcStaleProfilesResult = await gcStaleProfiles(oldProfileSince)

      await components.systemProperties.set(SYSTEM_PROPERTIES.lastGarbageCollectionTime, newTimeOfCollection)

      lastTimeOfCollection = newTimeOfCollection
    } finally {
      endTimer()
    }
  }

  const job = createJobComponent(
    { logs: components.logs },
    performSweep,
    sweepInterval,
    {
      onError: (error: any) => {
        logger.error(`Failed to perform garbage collection.`)
        logger.error(error)
      }
    }
  )

  return {
    async start() {
      await job[START_COMPONENT]?.(undefined as any)
    },
    async stop() {
      await job[STOP_COMPONENT]?.()
    },
    getLastSweepResults(): SweepResult | undefined {
      return lastSweepResult
    }
  }
}
