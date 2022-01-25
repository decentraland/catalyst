import { createValidator as validator, ExternalCalls, Validator as IValidatorComponent } from '@dcl/content-validator'
import { Authenticator } from 'dcl-crypto'
import { EnvironmentConfig } from '../../Environment'
import { streamToBuffer } from '../../storage/ContentStorage'
import { AppComponents } from '../../types'

export function createValidator(
  components: Pick<AppComponents, 'storage' | 'catalystFetcher' | 'authenticator' | 'env'>
): IValidatorComponent {
  const externalCalls: ExternalCalls = {
    isContentStoredAlready: (hashes) => components.storage.existMultiple(hashes),
    fetchContentFileSize: async (hash) => {
      const file = await components.storage.retrieve(hash)
      if (file) return (await streamToBuffer(await file.asStream())).byteLength
      throw new Error(`File ${hash} is missing`)
    },
    ownerAddress: (auditInfo) => Authenticator.ownerAddress(auditInfo.authChain),
    isAddressOwnedByDecentraland: (address: string) => components.authenticator.isAddressOwnedByDecentraland(address),
    validateSignature: (entityId, auditInfo, timestamp) =>
      components.authenticator.validateSignature(entityId, auditInfo.authChain, timestamp),
    queryGraph: components.catalystFetcher.queryGraph,
    subgraphs: {
      L1: {
        landManager: components.env.getConfig(EnvironmentConfig.LAND_MANAGER_SUBGRAPH_URL),
        blocks: components.env.getConfig(EnvironmentConfig.BLOCKS_L1_SUBGRAPH_URL),
        collections: components.env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL)
      },
      L2: {
        blocks: components.env.getConfig(EnvironmentConfig.BLOCKS_L2_SUBGRAPH_URL),
        collections: components.env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL)
      }
    }
  }

  return validator(externalCalls)
}
