import { Database } from '@katalyst/content/repository/Database'
import { DELTA_POINTER_RESULT, DeploymentResult } from '@katalyst/content/service/pointers/PointerManager'
import { EntityId, Pointer } from 'dcl-catalyst-commons'
import { DeploymentId } from './DeploymentsRepository'

export class DeploymentPointerChangesRepository {
  constructor(private readonly db: Database) {}

  async savePointerChanges(deploymentId: DeploymentId, deploymentResult: DeploymentResult): Promise<void> {
    await this.db.txIf((transaction) => {
      const contentPromises = Array.from(deploymentResult.entries()).map(([pointer, { before, after }]) =>
        transaction.none('INSERT INTO deployment_deltas (deployment, pointer, before, after) VALUES ($1, $2, $3, $4)', [
          deploymentId,
          pointer,
          before,
          after
        ])
      )
      return transaction.batch(contentPromises)
    })
  }

  async getPointerChangesForDeployments(
    deploymentIds: DeploymentId[]
  ): Promise<Map<DeploymentId, Map<Pointer, { before: EntityId | undefined; after: DELTA_POINTER_RESULT }>>> {
    const result: Map<
      DeploymentId,
      Map<Pointer, { before: EntityId | undefined; after: DELTA_POINTER_RESULT }>
    > = new Map()
    if (deploymentIds.length > 0) {
      const deltas = await this.db.any(
        `
              SELECT deployment, pointer, after, deployments.entity_id AS before
              FROM deployment_deltas
              LEFT JOIN deployments on deployments.id = deployment_deltas.before
              WHERE deployment IN ($1:list)`,
        [deploymentIds]
      )
      deltas.forEach(({ deployment, pointer, before, after }) => {
        if (!result.has(deployment)) {
          result.set(deployment, new Map())
        }
        result.get(deployment)!.set(pointer, { before: before ?? undefined, after })
      })
    }
    return result
  }
}
