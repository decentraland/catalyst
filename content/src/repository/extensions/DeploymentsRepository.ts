import { Authenticator } from '@dcl/crypto'
import { Entity, EntityType } from '@dcl/schemas'
import { AuditInfo } from 'dcl-catalyst-commons'
import { Database } from '../../repository/Database'

export class DeploymentsRepository {
  constructor(private readonly db: Database) {}

  async getEntityById(entityId: string) {
    const result = await this.db.map(
      `
        SELECT
          d.entity_id AS entity_id,
          date_part('epoch', d.local_timestamp) * 1000 AS local_timestamp
        FROM deployments d WHERE d.entity_id = $1
        LIMIT 1
      `,
      [entityId],
      (row) => ({
        entityId: row.entity_id,
        localTimestamp: row.local_timestamp
      })
    )
    if (!result || result.length == 0) return undefined
    return result[0]
  }

  async getAmountOfDeployments(): Promise<Map<EntityType, number>> {
    const entries: [EntityType, number][] = await this.db.map(
      `SELECT entity_type, COUNT(*) AS count FROM deployments GROUP BY entity_type`,
      [],
      (row) => [row.entity_type, parseInt(row.count)]
    )
    return new Map(entries)
  }

  deploymentsSince(entityType: EntityType, timestamp: number): Promise<number> {
    return this.db.one(
      `SELECT COUNT(*) AS count ` +
        `FROM deployments ` +
        `WHERE entity_type = $1 AND local_timestamp > to_timestamp($2 / 1000.0)`,
      [entityType, timestamp],
      (row) => row.count
    )
  }

  saveDeployment(entity: Entity, auditInfo: AuditInfo, overwrittenBy: DeploymentId | null): Promise<DeploymentId> {
    return this.db.one(
      `INSERT INTO deployments (deployer_address, version, entity_type, entity_id, entity_timestamp, entity_pointers, entity_metadata, local_timestamp, auth_chain, deleter_deployment)` +
        ` VALUES ` +
        `($(deployer), $(entity.version), $(entity.type), $(entity.id), to_timestamp($(entity.timestamp) / 1000.0), $(entity.pointers), $(metadata), to_timestamp($(auditInfo.localTimestamp) / 1000.0), $(auditInfo.authChain:json), $(overwrittenBy))` +
        ` RETURNING id`,
      {
        entity,
        auditInfo,
        metadata: entity.metadata ? { v: entity.metadata } : null, // We want to be able to store whatever we want, but psql is heavily typed. So we will wrap the metadata with an object
        deployer: Authenticator.ownerAddress(auditInfo.authChain),
        overwrittenBy
      },
      (deployment) => deployment.id
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
      console.log([entity.type, entity.pointers, entity.timestamp, entity.id], 'overwrote', overwrote)

      const overwrittenByMany = await task.manyOrNone(
        `
                SELECT deployments.id
                FROM deployments
                WHERE deployments.entity_type = $1 AND
                    deployments.entity_pointers && ARRAY [$2:list] AND
                    (deployments.entity_timestamp > to_timestamp($3 / 1000.0) OR (deployments.entity_timestamp = to_timestamp($3 / 1000.0) AND deployments.entity_id > $4))
                ORDER BY deployments.entity_timestamp ASC, deployments.entity_id ASC
                LIMIT 10`,
        [entity.type, entity.pointers, entity.timestamp, entity.id]
      )
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
