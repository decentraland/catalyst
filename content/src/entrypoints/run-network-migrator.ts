import { Lifecycle } from '@well-known-components/interfaces'
import { EnvironmentBuilder } from '../Environment'
import { migrateContentFolderStructure } from '../migrations/ContentFolderMigrationManager'
import { AppComponents } from '../types'
import SQL from 'sql-template-strings'
import { DeploymentBuilder, DeploymentPreparationData } from 'dcl-catalyst-client/dist/utils/DeploymentBuilder'
import { streamToBuffer } from '../ports/contentStorage/contentStorage'
import { Authenticator } from '@dcl/crypto'
import EthCrypto from 'eth-crypto'
import { CatalystClient } from 'dcl-catalyst-client'

const GOERLI_MIGRATION_TIMESTAMP: number = process.env.GOERLI_MIGRATION_TIMESTAMP
  ? parseInt(process.env.GOERLI_MIGRATION_TIMESTAMP)
  : 1659712500000 // 05/08/2022, 12:15:00 PM

void Lifecycle.run<AppComponents>({
  async main(program: Lifecycle.EntryPointParameters<AppComponents>): Promise<void> {
    const { components, startComponents, stop } = program

    await components.migrationManager.run()

    await migrateContentFolderStructure(components)

    await startComponents()

    await doMigration(components)

    await stop()
  },
  initComponents() {
    return new EnvironmentBuilder().buildConfigAndComponents()
  }
})

async function doMigration(components: AppComponents) {
  const result = await components.database.queryWithValues(
    SQL`
        SELECT id, entity_type, entity_id, entity_timestamp, entity_pointers, entity_metadata 
        FROM deployments 
        WHERE entity_type = 'scene' 
          AND entity_timestamp < to_timestamp(${GOERLI_MIGRATION_TIMESTAMP / 1000})
    `
  )

  for (const deployment of result.rows) {
    const deployment2 = deployment as any

    const fileResult = await components.database.queryWithValues(
      SQL`
        SELECT * 
        FROM content_files 
        WHERE deployment = ${deployment2.id}
    `
    )
    console.log(deployment2, fileResult)

    const files: Map<string, Uint8Array> = new Map()

    for (const file of fileResult.rows) {
      const key = (file as any).key
      const hash = (file as any).content_hash
      const content = await components.storage.retrieve(hash)
      if (content) {
        files.set(key, await streamToBuffer(await content.asStream()))
      }
    }

    console.log('files', files, deployment2.entity_timestamp)
    const entity: DeploymentPreparationData = await DeploymentBuilder.buildEntity({
      type: deployment2.entity_type,
      pointers: deployment2.entity_pointers,
      files,
      metadata: deployment2.entity_metadata.v,
      // timestamp: new Date(deployment2.entity_timestamp).getTime()
      timestamp: new Date().getTime()
    })

    // Signing message
    const { address, privateKey, publicKey } = EthCrypto.createIdentity()
    console.log({ address, privateKey, publicKey })

    const messageHash = Authenticator.createEthereumMessageHash(entity.entityId)
    const signature = EthCrypto.sign(privateKey, Buffer.from(messageHash).toString('hex'))
    const authChain = Authenticator.createSimpleAuthChain(entity.entityId, address, signature)

    // // const catalystUrl = 'https://peer-ap1.decentraland.zone'
    const catalystUrl = 'http://localhost:6969'
    const client = new CatalystClient({ catalystUrl })

    console.log(entity)

    await client.deploy({
      entityId: entity.entityId,
      authChain: authChain,
      files: entity.files
    })

    throw new Error('fin')
  }
}
