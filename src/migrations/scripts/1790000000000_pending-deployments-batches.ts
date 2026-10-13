/* eslint-disable @typescript-eslint/naming-convention */
import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Stored batches per partial upload, reported when it is published.
  pgm.addColumns('pending_deployments', {
    batches: { type: 'integer', notNull: true, default: 0 }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('pending_deployments', ['batches'])
}
