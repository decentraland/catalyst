/* eslint-disable @typescript-eslint/naming-convention */
import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('failed_deployments', {
    retry_count: { type: 'integer', notNull: true, default: 0 },
    next_retry_at: { type: 'timestamp', notNull: true, default: pgm.func('NOW()') }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('failed_deployments', ['retry_count', 'next_retry_at'])
}
