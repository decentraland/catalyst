import { Repository } from '@katalyst/content/storage/Repository';
import { DenylistTarget, parseDenylistTypeAndId, DenylistTargetType, DenylistTargetId } from '@katalyst/content/denylist/DenylistTarget';
import { DenylistMetadata, DenylistAction } from '@katalyst/content/denylist/Denylist';

export class DenylistRepository {

    constructor(private readonly db: Repository) { }

    addTarget(target: DenylistTarget) {
        return this.db.none('INSERT INTO denylist (target_type, target_id) VALUES ($1, $2)', [target.getType(), target.getId()])
    }

    removeTarget(target: DenylistTarget) {
        return this.db.none('DELETE FROM denylist WHERE target_type = $1 AND target_id = $2', [target.getType(), target.getId()])
    }

    async getAllDenylistedTargets(): Promise<{ target: DenylistTarget, metadata: DenylistMetadata }[]> {
        const result = await this.db.any(`
            SELECT DISTINCT ON (denylist.target_type, denylist.target_id) denylist.target_type, denylist.target_id, denylist_history.timestamp, denylist_history.auth_chain
            FROM denylist
            LEFT JOIN denylist_history ON denylist.target_type = denylist_history.target_type AND denylist.target_id = denylist_history.target_id
            ORDER BY denylist_history,timestamp DESC`)
        return result.map(row => ({
            target: parseDenylistTypeAndId(row.target_type, row.target_id),
            metadata: {
                timestamp: row.timestamp,
                authChain: row.auth_chain,
            }
        }))
    }

    async isTargetDenylisted(target: DenylistTarget): Promise<boolean> {
        const result = await this.db.oneOrNone(`SELECT 1 FROM denylist WHERE target_type = $1 AND target_id = $2`, [target.getType(), target.getId()])
        return !!result
    }

    /** Given a list of targets, only return those that are denylisted */
    async getDenylistedTargets(targets: DenylistTarget[]): Promise<Map<DenylistTargetType, DenylistTargetId[]>> {
        // Group targets by type
        const grouped: Map<DenylistTargetType, DenylistTargetId[]> = groupBy(targets, target => target.getType(), target => target.getId())

        // Build where clause
        const whereClause = Array.from(grouped.entries())
            .map(([type, ids]) => `(target_type = '${type}' AND target_id IN (${ids.join(',')}))`)
            .join(' OR ')

        // Perform the query
        const queryResult = await this.db.any(`SELECT target_type, target_id FROM denylist WHERE ${whereClause}}`)

        // Group all denylisted targets
        return groupBy(queryResult, row => row.target_type, row => row.target_id)
    }

    addEventToHistory(target: DenylistTarget, metadata: DenylistMetadata, action: DenylistAction) {
        return this.db.none(`
            INSERT INTO denylist_history
            (target_type, target_id, timestamp, auth_chain, action)
            VALUES ($(targetType), $(targetId), $(timestamp), $(authChain), $(action))`,
            { targetType: target.getType(), targetId: target.getId(), ...metadata, action })
    }

}

function groupBy<K, V, T>(list: T[], keyGetter: (item: T) => K, valueGetter: (item: T) => V): Map<K, V[]> {
    const map: Map<K, V[]> = new Map();
    list.forEach((item) => {
         const key = keyGetter(item);
         const value = valueGetter(item)
         const collection = map.get(key);
         if (!collection) {
             map.set(key, [value]);
         } else {
             collection.push(value);
         }
    });
    return map;
}