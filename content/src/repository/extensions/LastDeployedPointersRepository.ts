import { EntityType } from '@dcl/schemas'
import { Database } from '../Database'
import { DeploymentId } from './DeploymentsRepository'

export class LastDeployedPointersRepository {
  constructor(private readonly db: Database) {}

  async setAsLastActiveDeploymentsOnPointers(
    deploymentId: DeploymentId,
    entityType: EntityType,
    pointers: string[]
  ): Promise<void> {
    if (pointers.length > 0) {
      await this.db.txIf((transaction) => {
        const upserts = pointers.map((pointer) =>
          transaction.none(
            `
                    INSERT INTO last_deployed_pointers (deployment, pointer, entity_type)
                    VALUES ($1, $2, $3)
                    ON CONFLICT ON CONSTRAINT last_deployed_pointers_uniq_pointer_entity_type
                    DO UPDATE SET deployment = $1`,
            [deploymentId, pointer, entityType]
          )
        )

        return transaction.batch(upserts)
      })
    }
  }
}
