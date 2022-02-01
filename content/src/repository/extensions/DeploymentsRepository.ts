import { AuditInfo, Entity, EntityId, EntityType, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { AuthChain, Authenticator } from 'dcl-crypto'
import { Database } from '../../repository/Database'

export type FullSnapshot = {
  entityId: EntityId
  entityType: EntityType
  pointers: Pointer[]
  localTimestamp: Timestamp
  authChain: AuthChain
}

export class DeploymentsRepository {
  constructor(private readonly db: Database) {}

  async getEntityById(entityId: EntityId) {
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

  deploymentsSince(entityType: EntityType, timestamp: Timestamp): Promise<number> {
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

  async getActiveDeploymentsByContentHash(contentHash: string): Promise<EntityId[]> {
    return this.db.map(
      `SELECT ` +
        `deployment.entity_id ` +
        `FROM deployments as deployment INNER JOIN content_files ON content_files.deployment=id ` +
        `WHERE content_hash=$1 AND deployment.deleter_deployment IS NULL;`,
      [contentHash],
      (row) => row.entity_id
    )
  }
}

export type DeploymentId = number
