import { Entity } from '@katalyst/content/service/Entity'
import { Repository } from '@katalyst/content/storage/Repository'
import { DeploymentId } from '@katalyst/content/storage/repositories/DeploymentsRepository'

export class PointerHistoryRepository {
  constructor(private readonly db: Repository) {}

  async calculateOverwrites(
    entity: Entity
  ): Promise<{ overwrote: Set<DeploymentId>; overwrittenBy: DeploymentId | null }> {
    return this.db.taskIf(async (task) => {
      const overwrote: DeploymentId[] = await task.map(
        `
                SELECT DISTINCT ON (pointer_history.pointer) dep1.id
                FROM pointer_history
                LEFT JOIN deployments AS dep1 ON pointer_history.deployment = dep1.id
                LEFT JOIN deployments AS dep2 ON dep1.deleter_deployment = dep2.id
                WHERE pointer_history.entity_type = $1 AND
                    pointer_history.pointer IN ($2:list) AND
                    (dep1.entity_timestamp < to_timestamp($3 / 1000.0) OR (dep1.entity_timestamp = to_timestamp($3 / 1000.0) AND dep1.entity_id < $4)) AND
                    (dep2.id IS NULL OR dep2.entity_timestamp > to_timestamp($3 / 1000.0) OR (dep2.entity_timestamp = to_timestamp($3 / 1000.0) AND dep2.entity_id > $4))
                ORDER BY pointer_history.pointer, dep1.entity_timestamp DESC, dep1.entity_id DESC`,
        [entity.type, entity.pointers, entity.timestamp, entity.id],
        (row) => row.id
      )

      const overwrittenBy: DeploymentId | null = await task.oneOrNone(
        `
                SELECT deployments.id
                FROM pointer_history
                LEFT JOIN deployments ON pointer_history.deployment = deployments.id
                WHERE pointer_history.entity_type = $1 AND
                    pointer_history.pointer IN ($2:list) AND
                    (deployments.entity_timestamp > to_timestamp($3 / 1000.0) OR (deployments.entity_timestamp = to_timestamp($3 / 1000.0) AND deployments.entity_id > $4))
                ORDER BY deployments.entity_timestamp ASC, deployments.entity_id ASC
                LIMIT 1`,
        [entity.type, entity.pointers, entity.timestamp, entity.id],
        (row) => row && row.id
      )

      return {
        overwrote: new Set(overwrote),
        overwrittenBy
      }
    })
  }

  async addToHistory(deploymentId: DeploymentId, entity: Entity): Promise<void> {
    await this.db.txIf((transaction) => {
      const updates = entity.pointers.map((pointer) =>
        transaction.none('INSERT INTO pointer_history (deployment, pointer, entity_type) VALUES ($1, $2, $3)', [
          deploymentId,
          pointer,
          entity.type
        ])
      )
      return transaction.batch(updates)
    })
  }
}
