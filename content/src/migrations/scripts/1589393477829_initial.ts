/* eslint-disable @typescript-eslint/camelcase */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {

    /** Deployments */
    pgm.createTable('deployments',
        {
            id: { type: 'serial', primaryKey: true },
            deployer_address: { type: 'text', notNull: true },
            version: { type: 'text', notNull: true },
            entity_type: { type: 'text', notNull: true },
            entity_id: { type: 'text', notNull: true },
            entity_metadata: { type: 'json', notNull: false },
            entity_timestamp: { type: 'timestamp', notNull: true },
            entity_pointers: { type: 'text[]', notNull: true },
            origin_server_url: { type: 'text', notNull: true },
            origin_timestamp: { type: 'timestamp', notNull: true },
            local_timestamp: { type: 'timestamp', notNull: true },
            auth_chain: { type: 'json', notNull: true },
            deleter_deployment: { type: 'integer', references: 'deployments', notNull: false },
        },
        {
            constraints: {
                unique: ['entity_id', 'entity_type']
            }
        })

    pgm.addIndex('deployments', 'deployer_address')
    pgm.sql(`CREATE INDEX ON deployments ( origin_timestamp DESC )`) // Using plain SQL since lib doesn't expose DESC
    pgm.sql(`CREATE INDEX ON deployments ( local_timestamp DESC )`) // Using plain SQL since lib doesn't expose DESC

    /** Deployment Deltas */
    pgm.createType('delta_pointer_result', [ 'set', 'cleared' ])

    pgm.createTable('deployment_deltas',
        {
            deployment: { type: 'integer', references: 'deployments', notNull: true },
            pointer: { type: 'text', notNull: true },
            before: { type: 'integer', references: 'deployments', notNull: false },
            after: { type: 'delta_pointer_result', notNull: true },
        },
        {
            constraints: {
                unique: ['deployment', 'pointer']
            }
        })

    /** Failed Deployments */
    pgm.createTable('failed_deployments',
        {
            entity_type: { type: 'text', notNull: true },
            entity_id: { type: 'text', notNull: true },
            origin_server_url: { type: 'text', notNull: true },
            origin_timestamp: { type: 'timestamp', notNull: true },
            failure_timestamp: { type: 'timestamp', notNull: true },
            reason: { type: 'text', notNull: true },
            error_description: { type: 'text', notNull: false },
        },
        {
            constraints: {
                unique: ['entity_id', 'entity_type']
            }
        })
    pgm.sql(`CREATE INDEX ON failed_deployments ( failure_timestamp DESC )`) // Using plain SQL since lib doesn't expose DESC


    /** Last Deployed Pointers */
    pgm.createTable('last_deployed_pointers',
        {
            pointer: { type: 'text', notNull: true },
            entity_type: { type: 'text', notNull: true },
            deployment: { type: 'integer', references: 'deployments', notNull: true },
        },
        {
            constraints: {
                unique: ['pointer', 'entity_type']
            }
        })

    /** Pointer History */
    pgm.createTable('pointer_history',
        {
            pointer: { type: 'text', notNull: true },
            entity_type: { type: 'text', notNull: true },
            deployment: { type: 'integer', references: 'deployments', notNull: true },
        },
        {
            constraints: {
                unique: ['pointer', 'entity_type', 'deployment']
            }
        })

    /** Content Files */
    pgm.createTable('content_files',
        {
            deployment: { type: 'integer', references: 'deployments', notNull: true },
            content_hash: { type: 'text', notNull: true },
            key: { type: 'text', notNull: true },
        },
        {
            constraints: {
                unique: ['deployment', 'key']
            }
        })
    pgm.addIndex('content_files', 'content_hash')

    /** Migration Data */
    pgm.createTable('migration_data',
        {
            deployment: { type: 'integer', references: 'deployments', notNull: true },
            original_metadata: { type: 'json', notNull: true },
        },
        {
            constraints: {
                unique: ['deployment']
            }
        })

    /** Denylist */
    pgm.createTable('denylist',
        {
            target_type: { type: 'text', notNull: true },
            target_id: { type: 'text', notNull: true }
        },
        {
            constraints: {
                unique: ['target_id', 'target_type']
            }
        })

    /** Denylist history */
    pgm.createTable('denylist_history',
        {
            target_type: { type: 'text', notNull: true },
            target_id: { type: 'text', notNull: true },
            timestamp: { type: 'timestamp', notNull: true },
            auth_chain: { type: 'json', notNull: true },
            action: { type: 'text', notNull: true }
        },
        {
            constraints: {
                unique: ['target_id', 'target_type', 'timestamp']
            }
        })

}

export async function down(pgm: MigrationBuilder): Promise<void> {
    pgm.dropTable('deployment_deltas')
    pgm.dropTable('failed_deployments')
    pgm.dropTable('last_deployed_pointers')
    pgm.dropTable('pointer_history')
    pgm.dropTable('content_files')
    pgm.dropTable('migration_data')
    pgm.dropTable('denylist')
    pgm.dropTable('denylist_history')
    pgm.dropTable('deployments')
}
