import { EntityType } from 'dcl-catalyst-commons'
import { MigrationBuilder } from 'node-pg-migrate'
import { considerDeploymentsOnPointersAsFailed } from '../Helper'

export async function up(pgm: MigrationBuilder): Promise<void> {
  return considerDeploymentsOnPointersAsFailed(
    pgm,
    EntityType.WEARABLE,
    'urn:decentraland:matic:collections-v2:0x9cdd5e329b4aa5c1cec3a0d99fe56f9f8f7892b5:0',
    'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0',
    'urn:decentraland:matic:collections-v2:0x321cd6d0901ede3b10e042febcc96e4e84202c89:0',
    'urn:decentraland:matic:collections-v2:0xf60ad515b3dd3a4ad232011697b25dfc1535ecbe:0'
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {}
