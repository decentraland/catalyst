import { Entity, EntityType } from '@dcl/schemas'
import { Database } from '../../repository/Database'

export class DeploymentsRepository {
  constructor(private readonly db: Database) { }

  deploymentsSince(entityType: EntityType, timestamp: number): Promise<number> {
    return this.db.one(
      `SELECT COUNT(*) AS count ` +
      `FROM deployments ` +
      `WHERE entity_type = $1 AND local_timestamp > to_timestamp($2 / 1000.0)`,
      [entityType, timestamp],
      (row) => row.count
    )
  }

  async setEntitiesAsOverwritten(allOverwritten: Set<DeploymentId>, overwrittenBy: DeploymentId): Promise<void> {
    await this.db.txIf((transaction) => {
      const updates = Array.from(allOverwritten.values()).map((overwritten) =>
        this.db.none('UPDATE deployments SET deleter_deployment = $1 WHERE id = $2', [overwrittenBy, overwritten])
      )
      return transaction.batch(updates)
    })
  }

  async calculateOverwrites(
    entity: Entity
  ): Promise<{ overwrote: Set<DeploymentId>; overwrittenBy: DeploymentId | null }> {
    return this.db.taskIf(async (task) => {
      const overwrote: DeploymentId[] = await task.map(
        `
              SELECT dep1.id
              FROM deployments AS dep1
              LEFT JOIN deployments AS dep2 ON dep1.deleter_deployment = dep2.id
              WHERE dep1.entity_type = $1 AND
                  dep1.entity_pointers && ARRAY[$2:list] AND
                  (dep1.entity_timestamp < to_timestamp($3 / 1000.0) OR (dep1.entity_timestamp = to_timestamp($3 / 1000.0) AND dep1.entity_id < $4)) AND
                  (dep2.id IS NULL OR dep2.entity_timestamp > to_timestamp($3 / 1000.0) OR (dep2.entity_timestamp = to_timestamp($3 / 1000.0) AND dep2.entity_id > $4))
              ORDER BY dep1.entity_timestamp DESC, dep1.entity_id DESC`,
        [entity.type, entity.pointers, entity.timestamp, entity.id],
        (row) => row.id
      )

      let overwrittenByMany = await task.manyOrNone(
        `
            SELECT deployments.id
            FROM active_pointers as ap
                     INNER JOIN deployments on ap.entity_id = deployments.entity_id
            WHERE ap.pointer IN ($2:list)
              AND deployments.entity_type = $1
              AND (deployments.entity_timestamp > to_timestamp($3 / 1000.0) OR (deployments.entity_timestamp = to_timestamp($3 / 1000.0) AND deployments.entity_id > $4))
            ORDER BY deployments.entity_timestamp, deployments.entity_id
            LIMIT 1`,
        [entity.type, entity.pointers, entity.timestamp, entity.id]
      )

      if (overwrittenByMany.length === 0 && entity.type === 'scene') {
        // Scene overwrite determination can be tricky. If none was detected use this other query (slower but safer)
        overwrittenByMany = await task.manyOrNone(
          `
                 SELECT deployments.id
                 FROM deployments
                 WHERE deployments.entity_type = $1 AND
                     deployments.entity_pointers && ARRAY [$2:list] AND
                     (deployments.entity_timestamp > to_timestamp($3 / 1000.0) OR (deployments.entity_timestamp = to_timestamp($3 / 1000.0) AND deployments.entity_id > $4))
                 ORDER BY deployments.entity_timestamp, deployments.entity_id
                 LIMIT 1`,
          [entity.type, entity.pointers, entity.timestamp, entity.id]
        )
      }

      let overwrittenBy: DeploymentId | null = null
      if (overwrittenByMany.length > 0) {
        overwrittenBy = overwrittenByMany[0].id
      }
      return {
        overwrote: new Set(overwrote),
        overwrittenBy
      }
    })
  }
}

export type DeploymentId = number
