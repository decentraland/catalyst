/* eslint-disable @typescript-eslint/naming-convention */
import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Backs the per-parcel upload caps (`pointers && $1`), which every new partial upload checks.
  pgm.sql('CREATE INDEX IF NOT EXISTS pending_deployments_pointers_gin_idx ON pending_deployments USING GIN (pointers)')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS pending_deployments_pointers_gin_idx')
}
