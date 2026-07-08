import * as bf from 'bloom-filters'
import SQL from 'sql-template-strings'
import { SYSTEM_PROPERTIES } from '../../adapters/system-properties'
import { runLoggingPerformance } from '../../instrument'
import { AppComponents } from '../../types'
import { GCStaleProfilesResult, IGarbageCollectionComponent, SweepResult } from './types'

const PROFILE_CLEANUP_LIMIT = 10000

// How many unused content hashes to delete from storage per batch. Bounds both the in-memory list
// and the size of each storage.delete operation during a sweep.
const GC_DELETE_BATCH_SIZE = 1000

// How many delete batches deleteUnreferencedFiles keeps in flight at once. Each batch is one
// findReferencedHashes query + one storage.delete; a small window keeps folder-based storage (which
// unlinks serially inside delete()) from making the sweep fully sequential, without the unbounded
// fan-out of per-file parallel deletes.
const GC_DELETE_CONCURRENCY = 4

// Safety margin subtracted from the stored garbage-collection watermark. The next sweep only
// reconsiders hashes whose overwrite committed after the watermark; a deploy that assigned an older
// local_timestamp but committed just after the sweep started would otherwise slip below a
// strictly-later watermark and leak forever. Rewinding the watermark by more than any plausible
// deploy transaction duration guarantees such overwrites are re-examined next run.
const GC_WATERMARK_SAFETY_MARGIN_MS = 10 * 60 * 1000 // 10 minutes

export function createGarbageCollectionComponent(
  components: Pick<
    AppComponents,
    | 'systemProperties'
    | 'metrics'
    | 'logs'
    | 'storage'
    | 'database'
    | 'activeEntities'
    | 'contentFilesRepository'
    | 'deploymentsRepository'
    | 'pendingDeploymentsRepository'
    | 'snapshotsRepository'
  >,
  performGarbageCollection: boolean,
  profileDuration: number,
  // How long a partial (pending) deployment survives. Its entity id + content hashes are treated as
  // referenced until it expires, so in-flight staged uploads are never reclaimed.
  pendingDeploymentTtlMs: number
): IGarbageCollectionComponent {
  const logger = components.logs.getLogger('GarbageCollectionManager')
  let lastSweepResult: SweepResult | undefined = undefined
  let lastTimeOfCollection = 0

  /**
   * When it is time, we will calculate the hashes of all the overwritten deployments, and check if they are not being used by another deployment.
   * If they are not being used, then we will delete them.
   */
  async function gcUnusedHashes(): Promise<Set<string>> {
    const deletedHashes = new Set<string>()
    let batch: string[] = []

    const flushBatch = async (): Promise<void> => {
      if (batch.length === 0) {
        return
      }
      // Re-verify immediately before deleting. The sweep query ran against an earlier DB snapshot, so
      // a concurrent deploy may have re-referenced a hash since; and because storage is a single
      // content-addressed namespace, a candidate hash may also be a snapshot file or an entity JSON
      // (byte-identical files collide on hash). Never delete anything that is still referenced.
      const stillReferenced = await components.contentFilesRepository.findReferencedHashes(
        components.database,
        batch,
        pendingDeploymentTtlMs
      )
      const toDelete = batch.filter((hash) => !stillReferenced.has(hash))
      batch = []
      if (toDelete.length === 0) {
        return
      }
      await components.storage.delete(toDelete)
      // Emit the metric per batch (after the delete) so progress is observable during a long sweep
      // and a crash mid-sweep still records what was already deleted.
      components.metrics.increment('dcl_content_garbage_collection_items_total', {}, toDelete.length)
      for (const hash of toDelete) {
        deletedHashes.add(hash)
      }
    }

    // Stream the unused hashes and delete them in fixed-size batches, so neither the in-memory list
    // nor a single storage.delete grows unbounded with the number of overwritten deployments.
    for await (const hash of components.contentFilesRepository.streamContentHashesNotBeingUsedAnymore(
      components.database,
      lastTimeOfCollection,
      { batchSize: GC_DELETE_BATCH_SIZE }
    )) {
      batch.push(hash)
      if (batch.length >= GC_DELETE_BATCH_SIZE) {
        await flushBatch()
      }
    }
    await flushBatch()

    logger.debug(`Garbage collection deleted ${deletedHashes.size} unused content hashes`)
    return deletedHashes
  }

  // NOTE: remove old profile deployments and their images,
  // it will remove a max of ${PROFILE_CLEANUP_LIMIT} root profiles (plus the older versions they overwrote)
  async function gcStaleProfiles(oldProfileSince: Date): Promise<GCStaleProfilesResult> {
    const rootResult = await components.database.queryWithValues<{ id: string }>(
      SQL`SELECT d.id
          FROM deployments d
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

    if (rootResult.rowCount === 0) {
      logger.info(`Profile cleanup: no profiles to remove`)
      return {
        deletedHashes: new Set<string>(),
        deletedDeployments: new Set<string>()
      }
    }

    const rootIds = rootResult.rows.map((row) => row.id)

    // Expand to the full overwrite chain: every deployment (transitively) overwritten by a selected
    // profile. Deleting the whole chain together — rather than nulling `deleter_deployment` on the
    // survivors — prevents an old, already-overwritten version from being "resurrected" as active
    // (deleter NULL) and re-entering snapshots, and leaves no dangling self-referential FK.
    const chainResult = await components.database.queryWithValues<{ id: string; content_hash: string | null }>(
      SQL`
        WITH RECURSIVE chain AS (
          SELECT id FROM deployments WHERE id = ANY(${rootIds})
          UNION
          SELECT d.id FROM deployments d INNER JOIN chain c ON d.deleter_deployment = c.id
        )
        SELECT chain.id, cf.content_hash
        FROM chain
        LEFT JOIN content_files cf ON cf.deployment = chain.id`,
      'gc_old_profiles_expand_overwrite_chain'
    )

    const deploymentsSet = new Set<string>()
    const hashesSet = new Set<string>()
    for (const { id, content_hash } of chainResult.rows) {
      deploymentsSet.add(id)
      if (content_hash) {
        hashesSet.add(content_hash)
      }
    }

    const deployments = Array.from(deploymentsSet)
    const candidateHashes = Array.from(hashesSet)

    // A hash is still in use — and must be kept — if it is referenced by a deployment we are NOT
    // deleting (e.g. a default profile shares byte-identical avatar images with the profiles built
    // from it), or if it is a snapshot file or an entity id in the shared content-addressed storage.
    if (candidateHashes.length > 0) {
      const stillReferenced = await components.database.queryWithValues<{ hash: string }>(
        SQL`
          SELECT content_hash AS hash FROM content_files
            WHERE content_hash = ANY(${candidateHashes}) AND deployment <> ALL(${deployments})
          UNION
          SELECT hash FROM snapshots WHERE hash = ANY(${candidateHashes})
          UNION
          SELECT entity_id AS hash FROM deployments WHERE entity_id = ANY(${candidateHashes})`,
        'gc_old_profiles_check_hashes_in_use'
      )
      for (const { hash } of stillReferenced.rows) {
        hashesSet.delete(hash)
      }
    }

    const hashes = Array.from(hashesSet)

    logger.info(`Profile cleanup will remove ${deployments.length} deployments and ${hashes.length} from content_files`)
    await components.database.transaction(async (database) => {
      await database.queryWithValues(
        SQL`DELETE FROM content_files WHERE deployment = ANY(${deployments})`,
        'gc_old_profiles_delete_content_files'
      )

      logger.info(`Profile cleanup will remove ${deployments.length} deployments`)
      await database.queryWithValues(
        SQL`DELETE FROM deployments WHERE id = ANY(${deployments})`,
        'gc_old_profiles_delete_deployments'
      )
    }, 'gc_old_profiles')

    // Delete the files from storage only after the DB transaction commits: doing it first would leave
    // live content_files rows referencing already-deleted files if the transaction failed. A leftover
    // file after a successful commit is reclaimed by the next unused-hashes sweep.
    // Re-verify right before deleting (same guard as gcUnusedHashes): the in-use check above ran before
    // the transaction, so a concurrent deploy may have re-referenced one of these hashes since. This
    // narrows — but does not fully close — the window; a truly atomic guard would need locking.
    let hashesToDelete = hashes
    if (hashesToDelete.length > 0) {
      const stillReferenced = await components.contentFilesRepository.findReferencedHashes(
        components.database,
        hashesToDelete,
        pendingDeploymentTtlMs
      )
      hashesToDelete = hashesToDelete.filter((hash) => !stillReferenced.has(hash))
    }
    logger.info(`Profile cleanup will remove ${hashesToDelete.length} files from storage`)
    if (hashesToDelete.length > 0) {
      await components.storage.delete(hashesToDelete)
    }

    return {
      deletedHashes: new Set(hashesToDelete),
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

    const oldProfileSince = new Date(Date.now() - profileDuration)
    lastSweepResult = {}

    try {
      const gcProfileActiveEntitiesResult = await gcProfileActiveEntities(oldProfileSince)
      lastSweepResult.gcProfileActiveEntitiesResult = gcProfileActiveEntitiesResult
    } catch (error) {
      logger.error(`Failed to perform old profiles cleanup`)
      logger.error(error as Error)
      return
    }

    if (!performGarbageCollection) {
      return
    }

    // Persist a watermark rewound by a safety margin so overwrites committed around the sweep's start
    // (but stamped with a slightly older local_timestamp) are reconsidered next run instead of leaking.
    const newTimeOfCollection: number = Date.now() - GC_WATERMARK_SAFETY_MARGIN_MS
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

  async function deleteUnreferencedFiles(): Promise<void> {
    const unreferencedLogger = components.logs.getLogger('UnreferencedFilesDeleter')
    const referencedHashesBloom = bf.BloomFilter.create(15_000_000, 0.001)

    const addAllToBloomFilter = async (streamOfHashes: AsyncIterable<string>): Promise<number> => {
      let totalAddedHashes = 0
      for await (const hash of streamOfHashes) {
        totalAddedHashes++
        referencedHashesBloom.add(hash)
      }
      return totalAddedHashes
    }

    await runLoggingPerformance(unreferencedLogger, 'populate bloom filter', async () => {
      const totalEntityIds = await runLoggingPerformance(
        unreferencedLogger,
        'add stream of entity ids to bloom filter',
        async () =>
          await addAllToBloomFilter(components.deploymentsRepository.streamAllDistinctEntityIds(components.database))
      )

      const totalContentFileHashes = await runLoggingPerformance(
        unreferencedLogger,
        'add of stream content file hashes to bloom filter',
        async () =>
          await addAllToBloomFilter(
            components.contentFilesRepository.streamAllDistinctContentFileHashes(components.database)
          )
      )

      const totalSnapshotHashes = await runLoggingPerformance(
        unreferencedLogger,
        'add of stream snapshot hashes to bloom filter',
        async () => await addAllToBloomFilter(components.snapshotsRepository.getAllSnapshotHashes(components.database))
      )

      // Entity ids and content hashes of non-expired pending (partial) deployments are still referenced:
      // their content is staged but not yet attached to any deployment, so it would otherwise look
      // unreferenced and be swept. Expired pending rows are intentionally excluded so their staged
      // content becomes reclaimable.
      const totalPendingHashes = await runLoggingPerformance(
        unreferencedLogger,
        'add of stream pending deployment hashes to bloom filter',
        async () =>
          await addAllToBloomFilter(
            components.pendingDeploymentsRepository.streamAllNonExpiredHashes(
              components.database,
              pendingDeploymentTtlMs
            )
          )
      )
      unreferencedLogger.info(
        `Created bloom filter with ${totalEntityIds} entity ids, ${totalContentFileHashes} content hashes, ${totalSnapshotHashes} snapshot hashes and ${totalPendingHashes} pending deployment hashes.`
      )
    })

    let numberOfDeletedFiles = 0
    let batch: string[] = []
    const inFlight = new Set<Promise<void>>()

    // Delete in batches, re-verifying each batch against the database right before deletion. The bloom
    // filter was built once at the start of a potentially hours-long sweep, so anything referenced
    // AFTER that — most notably a partial (pending) upload that starts mid-sweep and stages files for
    // hours — is invisible to it. findReferencedHashes covers active deployments, snapshots, entity ids
    // and non-expired pending deployments at delete time.
    const deleteBatch = async (candidates: string[]): Promise<void> => {
      try {
        const stillReferenced = await components.contentFilesRepository.findReferencedHashes(
          components.database,
          candidates,
          pendingDeploymentTtlMs
        )
        const toDelete = candidates.filter((hash) => !stillReferenced.has(hash))
        if (toDelete.length === 0) {
          return
        }
        await components.storage.delete(toDelete)
        numberOfDeletedFiles += toDelete.length
      } catch (error) {
        unreferencedLogger.error(error as Error, { batchSize: String(candidates.length) })
      }
    }

    // Batches run through a small window of concurrent workers so the next batch's reference re-check
    // and deletes overlap the previous batch's I/O. On S3 each batch is a bulk DeleteObjects; on
    // folder-based storage delete() unlinks serially, so without this overlap the whole sweep would
    // degrade to fully serial unlinks interleaved with blocking DB queries.
    const flushBatch = async (): Promise<void> => {
      if (batch.length === 0) {
        return
      }
      const candidates = batch
      batch = []
      const task: Promise<void> = deleteBatch(candidates).finally(() => inFlight.delete(task))
      inFlight.add(task)
      if (inFlight.size >= GC_DELETE_CONCURRENCY) {
        await Promise.race(inFlight)
      }
    }

    unreferencedLogger.info(`Deleting files...`)
    for await (const storageFileId of components.storage.allFileIds()) {
      if (!referencedHashesBloom.has(storageFileId)) {
        batch.push(storageFileId)
        if (batch.length >= GC_DELETE_BATCH_SIZE) {
          await flushBatch()
        }
      }
    }
    await flushBatch()
    await Promise.all(inFlight)
    unreferencedLogger.info(`Deleted ${numberOfDeletedFiles} files`)
  }

  return {
    performSweep,
    getLastSweepResults(): SweepResult | undefined {
      return lastSweepResult
    },
    deleteUnreferencedFiles
  }
}
