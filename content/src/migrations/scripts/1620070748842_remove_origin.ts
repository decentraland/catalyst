import { MigrationBuilder } from 'node-pg-migrate'

/*
  In this migration, we are removing the origin_server_url and origin_timestamp colums
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE IF EXISTS deployments DROP COLUMN origin_server_url ;`)
  pgm.sql(`ALTER TABLE IF EXISTS deployments DROP COLUMN origin_timestamp;`)
  pgm.sql(`ALTER TABLE IF EXISTS failed_deployments DROP COLUMN origin_server_url;`)
  pgm.sql(`ALTER TABLE IF EXISTS failed_deployments DROP COLUMN origin_timestamp;`)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(
    `ALTER TABLE deployments ADD COLUMN origin_server_url text  DEFAULT 'https://peer.decentraland.org/content' NOT NULL;`
  )
  pgm.sql(`ALTER TABLE failed_deployments ADD COLUMN origin_timestamp text  DEFAULT NOW() NOT NULL;`)

  pgm.sql(
    `ALTER TABLE failed_deployments ADD COLUMN origin_server_url text  DEFAULT 'https://peer.decentraland.org/content' NOT NULL;`
  )
  pgm.sql(`ALTER TABLE deployments ADD COLUMN origin_timestamp text  DEFAULT NOW() NOT NULL;`)

  pgm.sql(`CREATE INDEX ON deployments ( origin_timestamp DESC );`) // Using plain SQL since lib doesn't expose DESC

}
