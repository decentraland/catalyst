import { Entity } from '@dcl/schemas'
import { Database } from '../../repository/Database'
import { DeploymentId } from '../../repository/extensions/DeploymentsRepository'
export class PointerHistoryRepository {
  constructor(private readonly db: Database) {}

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
