import { Authenticator } from 'dcl-crypto';
import { EntityId, Entity, EntityType } from '@katalyst/content/service/Entity';
import { AuditInfo } from '@katalyst/content/service/Audit';
import { Repository } from '@katalyst/content/storage/Repository';
import { Timestamp } from '@katalyst/content/service/time/TimeSorting';
import { ServerAddress } from '@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient';

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
                metadata: row.entity_metadata ? row.entity_metadata.v : undefined,
            }))
    }

    getAmountOfDeployments(): Promise<number> {
        return this.db.one(`SELECT COUNT(*) AS count FROM deployments`, [], row => parseInt(row.count));
    }

    getHistoricalDeploymentsByOriginTimestamp(offset: number, limit: number, from?: Timestamp, to?: Timestamp, serverUrl?: ServerAddress) {
        return this.getDeploymentsBy('origin_timestamp', offset, limit, from, to, serverUrl)
    }

    getHistoricalDeploymentsByLocalTimestamp(offset: number, limit: number, from?: Timestamp, to?: Timestamp, serverUrl?: ServerAddress) {
        return this.getDeploymentsBy('local_timestamp', offset, limit, from, to, serverUrl)
    }

    private getDeploymentsBy(timestampField: string, offset: number, limit: number, from?: Timestamp, to?: Timestamp, serverUrl?: ServerAddress) {
        let query = `
            SELECT
                dep1.id,
                dep1.entity_type,
                dep1.entity_id,
                dep1.entity_pointers,
                date_part('epoch', dep1.entity_timestamp) * 1000 AS entity_timestamp,
                dep1.entity_metadata,
                dep1.deployer_address,
                dep1.version,
                dep1.auth_chain,
                dep1.origin_server_url,
                date_part('epoch', dep1.origin_timestamp) * 1000 AS origin_timestamp,
                date_part('epoch', dep1.local_timestamp) * 1000 AS local_timestamp,
                dep2.entity_id AS overwritten_by
            FROM deployments AS dep1
            LEFT JOIN deployments AS dep2 ON dep1.deleter_deployment = dep2.id`

        let whereClause: string[] = []

        const values: any = {
            timestampField,
            limit,
            offset,
        }

        if (from) {
            values.from = from
            whereClause.push(`dep1.${timestampField} >= to_timestamp($(from) / 1000.0)`)
        }

        if (to) {
            values.to = to
            whereClause.push(`dep1.${timestampField} <= to_timestamp($(to) / 1000.0)`)
        }

        if (serverUrl) {
            values.serverUrl = serverUrl
            whereClause.push(`dep1.origin_server_url = $(serverUrl)`)
        }

        const where = whereClause.length > 0 ?
            ' WHERE ' + whereClause.join(' AND ') :
            ''

        query += where
        query += ` ORDER BY dep1.${timestampField} DESC LIMIT $(limit) OFFSET $(offset)`

        return this.db.map(query, values, row => ({
            deploymentId: row.id,
            entityType: row.entity_type,
            entityId: row.entity_id,
            pointers: row.entity_pointers,
            entityTimestamp: row.entity_timestamp,
            metadata: row.entity_metadata ? row.entity_metadata.v : undefined,
            deployerAddress: row.deployer_address,
            version: row.version,
            authChain: row.auth_chain,
            originServerUrl: row.origin_server_url,
            originTimestamp: row.origin_timestamp,
            localTimestamp: row.local_timestamp,
            overwrittenBy: row.overwritten_by ?? undefined
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
                $(metadata),
                $(auditInfo.originServerUrl),
                to_timestamp($(auditInfo.originTimestamp) / 1000.0),
                to_timestamp($(auditInfo.localTimestamp) / 1000.0),
                $(auditInfo.authChain:json),
                $(overwrittenBy)
            ) RETURNING id`, {
                entity,
                auditInfo,
                metadata: entity.metadata ? { v: entity.metadata } : null, // We want to be able to store whatever we want, but psql is heavily typed. So we will wrap the metadata with an object
                deployer: Authenticator.ownerAddress(auditInfo.authChain),
                overwrittenBy,
            }, deployment => deployment.id)
    }

    getAuditInfo(type: EntityType, id: EntityId) {
        return this.db.oneOrNone(`
            SELECT
                dep.id,
                dep.version,
                date_part('epoch', dep.origin_timestamp) * 1000 AS origin_timestamp,
                date_part('epoch', dep.local_timestamp) * 1000 AS local_timestamp,
                dep.origin_server_url,
                dep.auth_chain,
                dep2.entity_id AS overwritten_by
            FROM deployments AS dep
            LEFT JOIN deployments AS dep2 ON dep.deleter_deployment = dep2.id
            WHERE dep.entity_id=$1 AND dep.entity_type=$2`,
            [id, type],
            row => row && ({
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