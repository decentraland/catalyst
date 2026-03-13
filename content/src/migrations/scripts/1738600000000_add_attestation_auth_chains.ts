import { MigrationBuilder } from 'node-pg-migrate'

/*
 * Add attestation_auth_chains column to deployments table.
 * Stores AuthChain[] as JSONB for ownership attestations that allow
 * users to equip wearables before blockchain minting completes.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('deployments', {
    attestation_auth_chains: { type: 'jsonb', notNull: false }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('deployments', 'attestation_auth_chains')
}
