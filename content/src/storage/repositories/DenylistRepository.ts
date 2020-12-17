import { DenylistAction, DenylistMetadata } from '@katalyst/content/denylist/Denylist'
import {
  DenylistTarget,
  DenylistTargetId,
  DenylistTargetType,
  parseDenylistTypeAndId
} from '@katalyst/content/denylist/DenylistTarget'
import { Repository } from '@katalyst/content/storage/Repository'

export class DenylistRepository {
  constructor(private readonly db: Repository) {}

  addTarget(target: DenylistTarget) {
    return this.db.none('INSERT INTO denylist (target_type, target_id) VALUES ($1, $2)', [
      target.getType(),
      target.getId()
    ])
  }

  removeTarget(target: DenylistTarget) {
    return this.db.none('DELETE FROM denylist WHERE target_type = $1 AND target_id = $2', [
      target.getType(),
      target.getId()
    ])
  }

  async getAllDenylistedTargets(): Promise<{ target: DenylistTarget; metadata: DenylistMetadata }[]> {
    const result = await this.db.any(`
            SELECT DISTINCT ON (denylist.target_type, denylist.target_id)
                denylist.target_type,
                denylist.target_id,
                date_part('epoch', denylist_history.timestamp) * 1000 AS timestamp,
                denylist_history.auth_chain
            FROM denylist
            LEFT JOIN denylist_history ON denylist.target_type = denylist_history.target_type AND denylist.target_id = denylist_history.target_id
            ORDER BY denylist.target_type, denylist.target_id, denylist_history.timestamp DESC`)
    return result.map((row) => ({
      target: parseDenylistTypeAndId(row.target_type, row.target_id),
      metadata: {
        timestamp: row.timestamp,
        authChain: row.auth_chain
      }
    }))
  }

  async isTargetDenylisted(target: DenylistTarget): Promise<boolean> {
    const result = await this.db.oneOrNone(`SELECT 1 FROM denylist WHERE target_type = $1 AND target_id = $2`, [
      target.getType(),
      target.getId()
    ])
    return !!result
  }

  /** Given a list of targets, only return those that are denylisted */
  async getDenylistedTargets(targets: DenylistTarget[]): Promise<Map<DenylistTargetType, DenylistTargetId[]>> {
    // Group targets by type
    const grouped: Map<DenylistTargetType, DenylistTargetId[]> = groupBy(
      targets,
      (target) => target.getType(),
      (target) => target.getId()
    )

    let idx = 1
    const values: any[] = []
    const orClause: string[] = []

    // Build where clause
    Array.from(grouped.entries()).forEach(([type, ids]) => {
      const typeId = `${idx++}`
      const idsId = `${idx++}`
      values.push(type)
      values.push(ids)
      orClause.push(`(target_type = $${typeId} AND target_id IN ($${idsId}:list))`)
    })

    // Perform the query
    const queryResult = await this.db.any(
      `SELECT target_type, target_id FROM denylist WHERE ${orClause.join(' OR ')}`,
      values
    )

    // Group all denylisted targets
    return groupBy(
      queryResult,
      (row) => row.target_type,
      (row) => row.target_id
    )
  }

  addEventToHistory(target: DenylistTarget, metadata: DenylistMetadata, action: DenylistAction) {
    return this.db.none(
      `
            INSERT INTO denylist_history
            (target_type, target_id, timestamp, auth_chain, action)
            VALUES ($(targetType), $(targetId), to_timestamp($(timestamp) / 1000.0), $(authChain:json), $(action))`,
      { targetType: target.getType(), targetId: target.getId(), ...metadata, action }
    )
  }
}

function groupBy<K, V, T>(list: T[], keyGetter: (item: T) => K, valueGetter: (item: T) => V): Map<K, V[]> {
  const map: Map<K, V[]> = new Map()
  list.forEach((item) => {
    const key = keyGetter(item)
    const value = valueGetter(item)
    const collection = map.get(key)
    if (!collection) {
      map.set(key, [value])
    } else {
      collection.push(value)
    }
  })
  return map
}
