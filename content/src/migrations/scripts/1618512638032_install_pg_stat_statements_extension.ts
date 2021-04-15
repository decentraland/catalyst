import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addExtension('pg_stat_statements', { ifNotExists: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropExtension('pg_stat_statements', { ifExists: true })
}
