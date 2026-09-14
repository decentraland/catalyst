/* eslint-disable @typescript-eslint/naming-convention */
import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('failed_deployments', {
    retry_count: { type: 'integer', notNull: true, default: 0 },
    // `timestamptz`, unlike the pre-existing `failure_time`: this column is an absolute
    // deadline that is written from a `to_timestamp()` (timestamptz) value and read back as
    // an epoch. A timezone-less column would be converted using the session TimeZone on both
    // ends, shifting every retry deadline by the session's UTC offset.
    next_retry_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('failed_deployments', ['retry_count', 'next_retry_at'])
}
