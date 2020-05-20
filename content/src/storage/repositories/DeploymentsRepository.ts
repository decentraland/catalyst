import { Authenticator } from 'dcl-crypto';
import { EntityId, Entity, EntityType } from '@katalyst/content/service/Entity';
import { AuditInfo } from '@katalyst/content/service/Audit';
import { Repository } from '@katalyst/content/storage/Repository';
import { Timestamp } from '@katalyst/content/service/time/TimeSorting';
import { ServerAddress } from '@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient';
import { DeploymentEvent } from '@katalyst/content/service/deployments/DeploymentManager';

export class DeploymentsRepository {

    constructor(private readonly db: Repository) { }

    async areEntitiesDeployed(entityIds: EntityId[]): Promise<Map<EntityId, boolean>> {
        if (entityIds.length === 0) {
            return new Map()
        }
        const result = await this.db.map('SELECT entity_id FROM deployments WHERE entity_id IN ($1:list)', [entityIds], ({ entity_id }) => entity_id)
        const deployedIds = new Set(result)
        return new Map(entityIds.map(entityId => [entityId, deployedIds.has(entityId)]))
    }

    getEntitiesByIds(entityType: EntityType, entityIds: EntityId[]) {
        if (entityIds.length === 0) {
            return Promise.resolve([])
        }
        return this.db.map(`
            SELECT id, entity_id, entity_type, date_part('epoch', entity_timestamp) * 1000 AS entity_timestamp, entity_pointers, entity_metadata
            FROM deployments
            WHERE entity_id IN ($1:list) AND entity_type = $2`, [entityIds, entityType], row => ({
                id: row.id,
                entityType: row.entity_type,
                entityId: row.entity_id,
                timestamp: row.entity_timestamp,
                pointers: row.entity_pointers,
                metadata: row.entity_metadata,
            }))
    }

    getAmountOfDeployments(): Promise<number> {
        return this.db.one(`SELECT COUNT(*) AS count FROM deployments`, [], row => parseInt(row.count));
    }

    getHistoricalDeploymentsByOriginTimestamp(offset: number, limit: number, from?: Timestamp, to?: Timestamp, serverUrl?: ServerAddress): Promise<DeploymentEvent[]> {
        return this.getDeploymentsBy('origin_timestamp', offset, limit, from, to, serverUrl)
    }

    getHistoricalDeploymentsByLocalTimestamp(offset: number, limit: number, from?: Timestamp, to?: Timestamp, serverUrl?: ServerAddress): Promise<DeploymentEvent[]> {
        return this.getDeploymentsBy('local_timestamp', offset, limit, from, to, serverUrl)
    }

    private getDeploymentsBy(timestampField: string, offset: number, limit: number, from?: Timestamp, to?: Timestamp, serverUrl?: ServerAddress): Promise<DeploymentEvent[]> {
        let query = `SELECT entity_type, entity_id, date_part('epoch', origin_timestamp) * 1000 AS origin_timestamp, origin_server_url, date_part('epoch', local_timestamp) * 1000 AS local_timestamp, deployer_address FROM deployments`
        let whereClause: string[] = []

        const values: any = {
            timestampField,
            limit,
            offset,
        }

        if (from) {
            values.from = from
            whereClause.push(`${timestampField} >= to_timestamp($(from) / 1000.0)`)
        }

        if (to) {
            values.to = to
            whereClause.push(`${timestampField} <= to_timestamp($(to) / 1000.0)`)
        }

        if (serverUrl) {
            values.serverUrl = serverUrl
            whereClause.push(`origin_server_url = $(serverUrl)`)
        }

        const where = whereClause.length > 0 ?
            ' WHERE ' + whereClause.join(' AND ') :
            ''

        query += where
        query += ` ORDER BY ${timestampField} DESC LIMIT $(limit) OFFSET $(offset)`

        return this.db.map(query, values, row => ({
            entityType: row.entity_type,
            entityId: row.entity_id,
            originTimestamp: row.origin_timestamp,
            originServerUrl: row.origin_server_url,
            localTimestamp: row.local_timestamp,
            deployer: row.deployer_address,
        }))
    }

    saveDeployment(entity: Entity, auditInfo: AuditInfo, overwrittenBy: DeploymentId | null): Promise<DeploymentId> {
        return this.db.one(`
            INSERT INTO deployments (
                deployer_address,
                version,
                entity_type,
                entity_id,
                entity_timestamp,
                entity_pointers,
                entity_metadata,
                origin_server_url,
                origin_timestamp,
                local_timestamp,
                auth_chain,
                deleter_deployment
            ) VALUES (
                $(deployer),
                $(auditInfo.version),
                $(entity.type),
                $(entity.id),
                to_timestamp($(entity.timestamp) / 1000.0),
                $(entity.pointers),
                $(entity.metadata),
                $(auditInfo.originServerUrl),
                to_timestamp($(auditInfo.originTimestamp) / 1000.0),
                to_timestamp($(auditInfo.localTimestamp) / 1000.0),
                $(auditInfo.authChain:json),
                $(overwrittenBy)
            ) RETURNING id`, {
                entity,
                auditInfo,
                deployer: Authenticator.ownerAddress(auditInfo.authChain),
                overwrittenBy,
            }, deployment => deployment.id)
    }

    getAuditInfo(type: EntityType, id: EntityId) {
       return this.db.oneOrNone(`
                SELECT dep.id, dep.version, date_part('epoch', dep.origin_timestamp) * 1000 AS origin_timestamp, date_part('epoch', dep.local_timestamp) * 1000 AS local_timestamp, dep.origin_server_url, dep.auth_chain, dep2.entity_id AS overwritten_by
                FROM deployments AS dep
                LEFT JOIN deployments AS dep2 ON dep.deleter_deployment = dep2.id
                WHERE dep.entity_id=$1 AND dep.entity_type=$2`,
                [id, type],
                row => ({
                    deploymentId: row.id,
                    auditInfo: {
                        version: row.version,
                        originTimestamp: row.origin_timestamp,
                        localTimestamp: row.local_timestamp,
                        originServerUrl: row.origin_server_url,
                        authChain: row.auth_chain,
                        overwrittenBy: row.overwritten_by ?? undefined,
                    }
                }))
    }

    async setEntitiesAsOverwritten(allOverwritten: Set<DeploymentId>, overwrittenBy: DeploymentId): Promise<void> {
        await this.db.txIf(transaction => {
            const updates = Array.from(allOverwritten.values())
                .map(overwritten => this.db.none('UPDATE deployments SET deleter_deployment = $1 WHERE id = $2', [overwrittenBy, overwritten]))
            return transaction.batch(updates)
        })
    }

}

export type DeploymentId = number