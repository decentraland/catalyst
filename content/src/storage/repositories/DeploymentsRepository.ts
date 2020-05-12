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
        const result = await this.db.any('SELECT entity_id FROM deployments WHERE entity_id IN ($1:list)', [entityIds])
        return new Map(entityIds.map(entityId => [entityId, result.includes(entityId)]))
    }

    getEntitiesByIds(entityType: EntityType, entityIds: EntityId[]) {
        return this.db.any('SELECT id, entity_id, entity_type, entity_timestamp, entity_pointers, entity_metadata FROM deployments WHERE entity_id IN ($1:list) AND entity_type = $2', [entityIds, entityType])
    }

    getAmountOfDeployments(): Promise<number> {
        return this.db.one(`SELECT count(*) FROM deployments`);
    }

    getHistoricalDeploymentsByOriginTimestamp(offset: number, limit: number, from?: Timestamp, to?: Timestamp, serverUrl?: ServerAddress): Promise<DeploymentEvent[]> {
        return this.getDeploymentsBy('origin_timestamp', offset, limit, from, to, serverUrl)
    }

    getHistoricalDeploymentsByLocalTimestamp(offset: number, limit: number, from?: Timestamp, to?: Timestamp, serverUrl?: ServerAddress): Promise<DeploymentEvent[]> {
        return this.getDeploymentsBy('local_timestamp', offset, limit, from, to, serverUrl)
    }

    private getDeploymentsBy(timestampField: string, offset: number, limit: number, from?: Timestamp, to?: Timestamp, serverUrl?: ServerAddress): Promise<DeploymentEvent[]> {
        let query = 'SELECT entity_type, entity_id, origin_timestamp, origin_server_url, local_timestamp FROM deployments'
        let whereClause: string[] = []

        if (from) {
            whereClause.push(`${timestampField} >= ${from}`)
        }

        if (to) {
            whereClause.push(`${timestampField} <= ${to}`)
        }

        if (serverUrl) {
            whereClause.push(`origin_server_url = ${serverUrl}`)
        }

        const where = whereClause.length > 0 ?
            ' WHERE ' + whereClause.join(' AND ') :
            ''

        query += where
        query += ` ORDER BY ${timestampField} DESC LIMIT ${limit} OFFSET ${offset}`

        return this.db.any(query)
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
                $(deployer)
                $(auditInfo.version),
                $(entity.type),
                $(entity.id),
                $(entity.timestamp),
                $(entity.pointers),
                $(entity.metadata),
                $(auditInfo.originUrl),
                $(auditInfo.originTimestamp),
                $(auditInfo.localTimestamp),
                $(auditInfo.authChain),
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
                SELECT dep.id, dep.version, dep.origin_timestamp, dep.local_timestamp, dep.origin_server_url, dep.auth_chain, dep2.entity_id AS overwritten_by
                FROM deployments AS dep
                LEFT JOIN deployments AS dep2 ON deployments.deleter_deployment = dep2.id
                WHERE dep.entity_id=$1 AND dep.entity_type=$2`,
                [id, type])
    }

    async setEntitiesAsOverwritten(overwritten: Set<DeploymentId>, overwrittenBy: DeploymentId): Promise<void> {
        await this.db.txIf(transaction => {
            const updates = Array.from(overwritten.values())
                .map(overwritten => this.db.none('UPDATE deployments SET deleter_deployment=$1 WHERE id=$2', [overwrittenBy, overwritten]))

            return transaction.batch(updates)
        })
    }

}

export type DeploymentId = string