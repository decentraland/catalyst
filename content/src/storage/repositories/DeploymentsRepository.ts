import { Authenticator } from 'dcl-crypto';
import { EntityId, AuditInfo, EntityType, Timestamp, Pointer, DeploymentSorting, SortingOrder, SortingField } from 'dcl-catalyst-commons';
import { Entity } from '@katalyst/content/service/Entity';
import { Repository } from '@katalyst/content/storage/Repository';
import { ExtendedDeploymentFilters} from '@katalyst/content/service/deployments/DeploymentManager';

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

    getAmountOfDeployments(): Promise<number> {
        return this.db.one(`SELECT COUNT(*) AS count FROM deployments`, [], row => parseInt(row.count));
    }

    getHistoricalDeployments(offset: number, limit: number, filters?: ExtendedDeploymentFilters, sortBy?: DeploymentSorting) {
        console.log("Sorting: field ", sortBy?.field, ". order ", sortBy?.order)
        const sorting = Object.assign({field: SortingField.LOCAL_TIMESTAMP, order: SortingOrder.DESCENDING}, sortBy)
        return this.getDeploymentsBy(sorting.field, sorting.order, offset, limit, filters)
    }

    private getDeploymentsBy(timestampField: string, order: string, offset: number, limit: number, filters?: ExtendedDeploymentFilters) {
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

        if (filters?.fromLocalTimestamp) {
            values.fromLocalTimestamp = filters.fromLocalTimestamp
            whereClause.push(`dep1.local_timestamp >= to_timestamp($(fromLocalTimestamp) / 1000.0)`)
        }

        if (filters?.toLocalTimestamp) {
            values.toLocalTimestamp = filters.toLocalTimestamp
            whereClause.push(`dep1.local_timestamp <= to_timestamp($(toLocalTimestamp) / 1000.0)`)
        }

        if (filters?.fromOriginTimestamp) {
            values.fromOriginTimestamp = filters.fromOriginTimestamp
            whereClause.push(`dep1.origin_timestamp >= to_timestamp($(fromOriginTimestamp) / 1000.0)`)
        }

        if (filters?.toOriginTimestamp) {
            values.toOriginTimestamp = filters.toOriginTimestamp
            whereClause.push(`dep1.origin_timestamp <= to_timestamp($(toOriginTimestamp) / 1000.0)`)
        }

        if (filters?.originServerUrl) {
            values.originServerUrl = filters.originServerUrl
            whereClause.push(`dep1.origin_server_url = $(originServerUrl)`)
        }

        if (filters?.deployedBy && filters.deployedBy.length > 0) {
            values.deployedBy = filters.deployedBy
            whereClause.push(`dep1.deployer_address IN ($(deployedBy:list))`)
        }

        if (filters?.entityTypes && filters.entityTypes.length > 0) {
            values.entityTypes = filters.entityTypes
            whereClause.push(`dep1.entity_type IN ($(entityTypes:list))`)
        }

        if (filters?.entityIds && filters.entityIds.length > 0) {
            values.entityIds = filters.entityIds
            whereClause.push(`dep1.entity_id IN ($(entityIds:list))`)
        }

        if (filters?.onlyCurrentlyPointed) {
            whereClause.push(`dep1.deleter_deployment IS NULL`)
        }

        if (filters?.pointers && filters.pointers.length > 0) {
            values.pointers = filters.pointers
            whereClause.push(`dep1.entity_pointers && ARRAY[$(pointers:list)]`)
        }

        const where = whereClause.length > 0 ?
            ' WHERE ' + whereClause.join(' AND ') :
            ''

        query += where
        query += ` ORDER BY dep1.${timestampField} ${order}, dep1.entity_id ${order} LIMIT $(limit) OFFSET $(offset)`

        console.log(query)

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

    getSnapshot(entityType: EntityType): Promise<{ entityId: EntityId, pointers: Pointer[], localTimestamp: Timestamp}[]> {
        return this.db.map(`
            SELECT
                entity_id,
                entity_pointers,
                date_part('epoch', local_timestamp) * 1000 AS local_timestamp
            FROM deployments
            WHERE entity_type = $1 AND deleter_deployment IS NULL
            ORDER BY local_timestamp DESC, entity_id DESC
            `, [entityType], row => ({
                entityId: row.entity_id,
                pointers: row.entity_pointers,
                localTimestamp: row.local_timestamp,
            }))
    }

    deploymentsSince(entityType: EntityType, timestamp: Timestamp): Promise<number> {
        return this.db.one(`
            SELECT COUNT(*) AS count
            FROM deployments
            WHERE entity_type = $1 AND local_timestamp > to_timestamp($2 / 1000.0)`,
            [entityType, timestamp], row => row.count)
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

    async setEntitiesAsOverwritten(allOverwritten: Set<DeploymentId>, overwrittenBy: DeploymentId): Promise<void> {
        await this.db.txIf(transaction => {
            const updates = Array.from(allOverwritten.values())
                .map(overwritten => this.db.none('UPDATE deployments SET deleter_deployment = $1 WHERE id = $2', [overwrittenBy, overwritten]))
            return transaction.batch(updates)
        })
    }

}

export type DeploymentId = number