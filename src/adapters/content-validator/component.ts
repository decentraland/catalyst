import {
  AvlTree,
  BlockInfo,
  createAvlBlockSearch,
  createBlockRepository,
  createCachingEthereumProvider,
  loadTree
} from '@dcl/block-indexer'
import { l1Contracts } from '@dcl/catalyst-contracts'
import {
  DeploymentToValidate,
  ExternalCalls,
  OK,
  TokenAddresses,
  ValidateFn,
  createValidator
} from '@dcl/content-validator'
import { createAccessValidateFn } from '@dcl/content-validator/dist/validations/access'
import { createOnChainAccessCheckValidateFns } from '@dcl/content-validator/dist/validations/access/on-chain'
import { createOnChainClient } from '@dcl/content-validator/dist/validations/access/on-chain/client'
import { createSubgraphAccessCheckValidateFns } from '@dcl/content-validator/dist/validations/access/subgraph'
import { createTheGraphClient } from '@dcl/content-validator/dist/validations/access/subgraph/the-graph-client'
// Individual validation fns, composed into the partial-deployment staging subset (validateStagingScene).
// The library already exposes these via deep imports (see the access/* imports above); we reuse the
// content-independent ones so a staging request can be fully authenticated and access-checked without
// requiring every content file to be present yet.
import { validateAll } from '@dcl/content-validator/dist/validations/validations'
import { entityStructureValidationFn } from '@dcl/content-validator/dist/validations/entity-structure'
import { ipfsHashingValidateFn } from '@dcl/content-validator/dist/validations/ipfs-hashing'
import { metadataValidateFn } from '@dcl/content-validator/dist/validations/metadata-schema'
import { adr45ValidateFn } from '@dcl/content-validator/dist/validations/ADR45'
import { createSignatureValidateFn } from '@dcl/content-validator/dist/validations/signature'
import { sceneValidateFn } from '@dcl/content-validator/dist/validations/scene'
import { allHashesInUploadedFilesAreReportedInTheEntityValidateFn } from '@dcl/content-validator/dist/validations/content'
import { entityParameters } from '@dcl/content-validator/dist/validations/ADR51'
import { EntityType } from '@dcl/schemas'
import { toCoreFetcher } from '../../logic/to-core-fetcher'
import { Authenticator } from '@dcl/crypto'
import { hashV0, hashV1 } from '@dcl/hashing'
import { createSubgraphComponent } from '@dcl/thegraph-component'
import { HTTPProvider } from 'eth-connect'
import { Readable } from 'stream'
import { EnvironmentConfig } from '../../Environment'
import { createItemChecker, createL1Checker, createL2Checker } from './checker'
import { createEthereumProvider } from './ethereum-provider'
import { createThirdPartyItemChecker } from './third-party-item-checker'
import { AppComponents } from '../../types'
import { IContentValidator } from './types'

type ContentValidatorDeps = Pick<
  AppComponents,
  'storage' | 'crypto' | 'env' | 'logs' | 'metrics' | 'config' | 'fetcher'
> & {
  l1Provider: HTTPProvider
  l2Provider: HTTPProvider
}

async function createExternalCallsBag(
  components: Pick<AppComponents, 'storage' | 'crypto' | 'env'>
): Promise<ExternalCalls> {
  async function calculateFilesHashes(
    files: Map<string, Uint8Array>
  ): Promise<Map<string, { calculatedHash: string; buffer: Uint8Array }>> {
    const entries = await Promise.all(
      Array.from(files.entries()).map(async ([key, value]) => {
        const hashGenerationFn = key.startsWith('Qm') ? hashV0 : hashV1
        const calculatedHash = await hashGenerationFn(Readable.from(value))
        return [key, { calculatedHash, buffer: value }] as [string, { calculatedHash: string; buffer: Uint8Array }]
      })
    )

    return new Map(entries)
  }

  return {
    isContentStoredAlready: (hashes) => components.storage.existMultiple(hashes),
    fetchContentFileSize: async (hash) => {
      // `contentSize` is the decompressed/logical length: the gzip ISIZE trailer for compressed files,
      // or the file size for uncompressed ones. undefined when the file is missing or unreadable.
      const info = await components.storage.fileInfo(hash)
      return info?.contentSize ?? undefined
    },
    // How many size fetches calculateDeploymentSize may run at once (only the sync path fetches these).
    // Controlled by CONTENT_SIZE_FETCH_CONCURRENCY (default 10); set to 1 for the sequential behavior.
    fetchContentFileSizeConcurrency: components.env.getConfig<number>(EnvironmentConfig.CONTENT_SIZE_FETCH_CONCURRENCY),
    ownerAddress: (auditInfo) => Authenticator.ownerAddress(auditInfo.authChain),
    isAddressOwnedByDecentraland: (address: string) => components.crypto.isAddressOwnedByDecentraland(address),
    validateSignature: (entityId, auditInfo, timestamp) =>
      components.crypto.validateSignature(entityId, auditInfo.authChain, timestamp),
    calculateFilesHashes
  }
}

// Each of the three strategy helpers below returns the *access* validate fn (LAND/ownership/ACL check)
// only. The caller composes it into the full validator via `createValidator` and — for staging — into
// the content-independent subset via `validateAll`, so both paths run the identical access check.
async function createIgnoreBlockchainAccessValidateFn(): Promise<ValidateFn> {
  return (_d: DeploymentToValidate) => Promise.resolve(OK)
}

async function createOnChainAccessValidateFn(
  components: Pick<AppComponents, 'env' | 'metrics' | 'logs'>,
  externalCalls: ExternalCalls,
  l1Provider: HTTPProvider,
  l2Provider: HTTPProvider
): Promise<ValidateFn> {
  const { env, metrics, logs } = components
  const logger = logs.getLogger('OnChainValidator')
  const l1Network: 'mainnet' | 'sepolia' = env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const l2Network = l1Network === 'mainnet' ? 'polygon' : 'amoy'

  const l1Checker = await createL1Checker(l1Provider, l1Network)
  const l2Checker = await createL2Checker(l2Provider, l2Network)
  const l1ItemChecker = await createItemChecker(logs, l1Provider)
  const l2ItemChecker = await createItemChecker(logs, l2Provider)

  const storageRoot = env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER) as string
  const l1ThirdPartyItemChecker = await createThirdPartyItemChecker({ logs }, l1Provider, l1Network, storageRoot)
  const l2ThirdPartyItemChecker = await createThirdPartyItemChecker({ logs }, l2Provider, l2Network, storageRoot)

  const l1BlockSearch = createAvlBlockSearch({
    blockRepository: createBlockRepository({
      metrics,
      logs,
      ethereumProvider: createCachingEthereumProvider(
        createEthereumProvider(l1Provider, () =>
          metrics.increment('dcl_block_fetch_retries_total', { network: l1Network })
        )
      )
    }),
    metrics,
    logs
  })
  const l2BlockSearch = createAvlBlockSearch({
    blockRepository: createBlockRepository({
      metrics,
      logs,
      ethereumProvider: createCachingEthereumProvider(
        createEthereumProvider(l2Provider, () =>
          metrics.increment('dcl_block_fetch_retries_total', { network: l2Network })
        )
      )
    }),
    metrics,
    logs
  })

  const converter: (row: any[]) => { key: number; value: BlockInfo } = (row) => ({
    key: parseInt(row[0]),
    value: {
      timestamp: row[0],
      block: parseInt(row[1])
    }
  })
  async function warmUpCache(tree: AvlTree<number, BlockInfo>, networkName: string): Promise<void> {
    const start = new Date().getTime()
    const file = `blocks-cache-${networkName}.csv`
    try {
      await loadTree(tree, file, converter)
      logger.debug(`loading snapshot for ${networkName} took ${new Date().getTime() - start} ms.`)
    } catch (e) {
      logger.warn(`failed to load cache file ${file}`, e.toString())
    }
  }
  // TODO: @dcl/block-indexer is pinned to 1.1.2 — 1.3.0 removes BlockSearch.tree (used here for the
  // cache warm-up) in favour of internal caching via createAvlBlockSearch(..., { maxCachedBlocks }).
  // Bumping requires reworking this warm-up and coordinating with @dcl/content-validator's block-indexer.
  await warmUpCache(l1BlockSearch.tree, l1Network)
  await warmUpCache(l2BlockSearch.tree, l2Network)

  const L1 = {
    checker: l1Checker,
    collections: l1ItemChecker,
    thirdParty: l1ThirdPartyItemChecker,
    blockSearch: l1BlockSearch
  }

  const L2 = {
    checker: l2Checker,
    collections: l2ItemChecker,
    thirdParty: l2ThirdPartyItemChecker,
    blockSearch: l2BlockSearch
  }

  const validateFns = createOnChainAccessCheckValidateFns({
    logs,
    externalCalls,
    client: createOnChainClient({ logs, L1, L2 }),
    L1,
    L2
  })

  return createAccessValidateFn({ externalCalls }, validateFns)
}

async function createSubgraphAccessValidateFn(
  components: Pick<AppComponents, 'env' | 'metrics' | 'config' | 'logs' | 'fetcher'>,
  externalCalls: ExternalCalls
): Promise<ValidateFn> {
  const { logs, config, env, metrics, fetcher } = components
  // `components.fetcher` is stored as the WKC `IFetchComponent` (see components.ts — it serves the
  // other WKC-typed consumers like block-indexer and snapshots-fetcher), while @dcl/thegraph-component
  // expects the structurally-identical native-fetch `IFetchComponent` from @dcl/core-commons. The
  // underlying runtime value is already a native fetcher, so assert the core-commons type here.
  const baseComponents = { config, fetch: toCoreFetcher(fetcher), metrics, logs }
  const subGraphs = {
    L1: {
      landManager: await createSubgraphComponent(
        baseComponents,
        env.getConfig(EnvironmentConfig.LAND_MANAGER_SUBGRAPH_URL)
      ),
      blocks: await createSubgraphComponent(baseComponents, env.getConfig(EnvironmentConfig.BLOCKS_L1_SUBGRAPH_URL)),
      collections: await createSubgraphComponent(
        baseComponents,
        env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL)
      ),
      ensOwner: await createSubgraphComponent(baseComponents, env.getConfig(EnvironmentConfig.ENS_OWNER_PROVIDER_URL))
    },
    L2: {
      blocks: await createSubgraphComponent(baseComponents, env.getConfig(EnvironmentConfig.BLOCKS_L2_SUBGRAPH_URL)),
      collections: await createSubgraphComponent(
        baseComponents,
        env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL)
      ),
      thirdPartyRegistry: await createSubgraphComponent(
        baseComponents,
        env.getConfig(EnvironmentConfig.THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL)
      )
    }
  }

  const network: 'mainnet' | 'sepolia' = env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const contracts = l1Contracts[network]
  const tokenAddresses: TokenAddresses = {
    land: contracts.land,
    estate: contracts.state
  }

  const validateFns = createSubgraphAccessCheckValidateFns({
    logs,
    externalCalls,
    theGraphClient: createTheGraphClient({ logs, subGraphs }),
    subGraphs,
    tokenAddresses
  })

  return createAccessValidateFn({ externalCalls }, validateFns)
}

/**
 * The content-independent validations that a partial (staging) scene deployment must pass on every
 * request, before all of its content files are necessarily present. Excludes the size validation
 * (replaced by a cumulative check in the partial-deployments component) and the content-completeness
 * validation (only checkable at finalize). `accessValidateFn` runs last because it is the expensive
 * on-chain / subgraph call; `includeAccessCheck: false` builds the resume variant that omits it (see
 * IContentValidator.validateStagingScene for when that is safe).
 */
function createStagingSceneValidateFn(
  components: Pick<AppComponents, 'logs'>,
  externalCalls: ExternalCalls,
  accessValidateFn: ValidateFn,
  includeAccessCheck: boolean
): ValidateFn {
  const { logs } = components
  const validations = [
    entityStructureValidationFn,
    ipfsHashingValidateFn,
    metadataValidateFn,
    adr45ValidateFn,
    createSignatureValidateFn({ logs, externalCalls, accessValidateFn }),
    sceneValidateFn,
    allHashesInUploadedFilesAreReportedInTheEntityValidateFn
  ]
  if (includeAccessCheck) {
    validations.push(accessValidateFn)
  }
  return validateAll(...validations)
}

/**
 * Wraps `@dcl/content-validator` and selects the access-check strategy at construction time
 * based on env config:
 *  - `IGNORE_BLOCKCHAIN_ACCESS_CHECKS=true`     -> skip blockchain access checks
 *  - `L1_HTTP_PROVIDER_URL` and `L2_HTTP_PROVIDER_URL` set -> on-chain checker
 *  - otherwise                                  -> subgraph (TheGraph) checker
 */
export async function createContentValidator(components: ContentValidatorDeps): Promise<IContentValidator> {
  const { env, logs, l1Provider, l2Provider } = components
  const logger = logs.getLogger('content-validator')

  const externalCalls = await createExternalCallsBag(components)

  const ignoreBlockchainAccess = env.getConfig(EnvironmentConfig.IGNORE_BLOCKCHAIN_ACCESS_CHECKS) === 'true'
  const l1HttpProviderUrl: string | undefined = env.getConfig(EnvironmentConfig.L1_HTTP_PROVIDER_URL)
  const l2HttpProviderUrl: string | undefined = env.getConfig(EnvironmentConfig.L2_HTTP_PROVIDER_URL)
  const useOnChainValidator = !!(l1HttpProviderUrl && l2HttpProviderUrl)

  let accessValidateFn: ValidateFn
  if (ignoreBlockchainAccess) {
    // This bypasses all on-chain ownership/access checks, so any signed request can
    // deploy entities for pointers it does not own. It exists for tests/local dev only;
    // warn loudly so it can be spotted if it ever leaks into a real deployment.
    logger.warn(
      'IGNORE_BLOCKCHAIN_ACCESS_CHECKS is enabled: blockchain ownership/access validation is DISABLED. ' +
        'Deployments will NOT be checked for pointer ownership. This must never be set in production.'
    )
    accessValidateFn = await createIgnoreBlockchainAccessValidateFn()
  } else if (useOnChainValidator) {
    accessValidateFn = await createOnChainAccessValidateFn(components, externalCalls, l1Provider, l2Provider)
  } else {
    accessValidateFn = await createSubgraphAccessValidateFn(components, externalCalls)
  }

  const validate = createValidator({ logs, externalCalls, accessValidateFn })
  const validateStagingWithAccess = createStagingSceneValidateFn(components, externalCalls, accessValidateFn, true)
  const validateStagingWithoutAccess = createStagingSceneValidateFn(components, externalCalls, accessValidateFn, false)

  return {
    validate,
    validateStagingScene: (deployment, options) =>
      options?.skipAccessCheck ? validateStagingWithoutAccess(deployment) : validateStagingWithAccess(deployment),
    getMaxSizeInBytesPerPointer: (type: EntityType) => entityParameters[type].maxSizeInMB * 1024 * 1024
  }
}
