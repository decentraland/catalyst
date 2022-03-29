import { createValidator as validator, ExternalCalls, Validator as IValidatorComponent } from '@dcl/content-validator'
import { Authenticator } from 'dcl-crypto'
import { EnvironmentConfig } from '../../Environment'
import { streamToBuffer } from '../../ports/contentStorage/contentStorage'
import { AppComponents } from '../../types'

export function createValidator(
  components: Pick<AppComponents, 'storage' | 'catalystFetcher' | 'authenticator' | 'env' | 'logs'>
): IValidatorComponent {
  const externalCalls: ExternalCalls = {
    isContentStoredAlready: (hashes) => components.storage.existMultiple(hashes),
    fetchContentFileSize: async (hash) => {
      const maybeFile = await components.storage.retrieve(hash)
      if (maybeFile) {
        const stream = await maybeFile.asStream()
        const buffer = await streamToBuffer(stream)
        return buffer.byteLength
      }
      return undefined
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
        collections: components.env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL),
        thirdPartyRegistry: components.env.getConfig(EnvironmentConfig.THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL)
      }
    }
  }

  return validator(externalCalls, components)
}
