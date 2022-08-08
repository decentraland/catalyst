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
  // For signing new deployments
  if (!process.env.MIGRATION_PRIVATE_KEY) {
    throw 'Cannot run migration without a deployer PK'
  }
  const privateKey = process.env.MIGRATION_PRIVATE_KEY
  const publicKey = EthCrypto.publicKeyByPrivateKey(privateKey)
  const address = EthCrypto.publicKey.toAddress(publicKey)
  console.log({ address, privateKey, publicKey })

  const result = await components.database.queryWithValues(
    SQL`
        SELECT id, entity_type, entity_id, entity_timestamp, entity_pointers, entity_metadata 
        FROM deployments 
        WHERE entity_type = 'scene'
          AND deleter_deployment IS NULL
          AND entity_timestamp < to_timestamp(${GOERLI_MIGRATION_TIMESTAMP / 1000})
        ORDER BY entity_timestamp
    `
  )

  console.log(`About to attempt migration of ${result.rowCount} scenes`)

  for (const deployment of result.rows) {
    const deployment2 = deployment as any

    const fileResult = await components.database.queryWithValues(
      SQL`
        SELECT * 
        FROM content_files 
        WHERE deployment = ${deployment2.id}
    `
    )

    const files: Map<string, Uint8Array> = new Map()

    for (const file of fileResult.rows) {
      const key = (file as any).key
      const hash = (file as any).content_hash
      const content = await components.storage.retrieve(hash)
      if (content) {
        files.set(key, await streamToBuffer(await content.asStream()))
      }
    }

    // console.log('files', files, deployment2.entity_timestamp)
    const entity: DeploymentPreparationData = await DeploymentBuilder.buildEntity({
      type: deployment2.entity_type,
      pointers: deployment2.entity_pointers,
      files,
      metadata: deployment2.entity_metadata.v,
      timestamp: new Date().getTime()
    })
    console.log(`Deploying entity ${entity.entityId}`)

    const messageHash = Authenticator.createEthereumMessageHash(entity.entityId)
    const signature = EthCrypto.sign(privateKey, Buffer.from(messageHash).toString('hex'))
    const authChain = Authenticator.createSimpleAuthChain(entity.entityId, address, signature)

    // const catalystUrl = 'https://peer-ap1.decentraland.zone'
    const catalystUrl = 'http://localhost:6969'
    const client = new CatalystClient({ catalystUrl })

    try {
      await client.deploy({
        entityId: entity.entityId,
        authChain: authChain,
        files: entity.files
      })
    } catch (e) {
      console.log(`Error deploying entity ${entity.entityId}`)
    }
  }
}
